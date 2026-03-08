import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { StoreConfig } from '@/lib/storeConfig';
import { DEFAULT_STORE_CONFIG } from '@/lib/storeConfig';

export interface CartItem {
  id: string;
  barcode: string;
  title: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  price: number;
  quantity: number;
}

export interface ShoppingSession {
  id: string;
  session_code: string;
  state: string;
  mart_id: string;
  branch_id: string;
  total_amount: number;
  cart_hash: string | null;
  payment_method: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  config_snapshot: any;
}

export function useSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);

  // Load store config — prefer session snapshot, fallback to mart config
  const loadStoreConfig = useCallback(async (martId: string, snapshot?: any) => {
    if (snapshot && typeof snapshot === 'object') {
      setStoreConfig({ ...DEFAULT_STORE_CONFIG, ...snapshot });
      return;
    }
    const { data } = await supabase
      .from('marts')
      .select('config')
      .eq('id', martId)
      .single();
    if (data?.config && typeof data.config === 'object') {
      setStoreConfig({ ...DEFAULT_STORE_CONFIG, ...(data.config as any) });
    }
  }, []);

  // Fetch active session for current user
  const fetchActiveSession = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .in('state', ['ACTIVE', 'LOCKED', 'VERIFIED', 'PAID'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setSession(data as ShoppingSession);
      await loadStoreConfig(data.mart_id, (data as any).config_snapshot);
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select('*')
        .eq('session_id', data.id)
        .order('added_at', { ascending: true });
      setItems((cartItems || []) as CartItem[]);
    } else {
      setSession(null);
      setItems([]);
    }
  }, [user, loadStoreConfig]);

  useEffect(() => { fetchActiveSession(); }, [fetchActiveSession]);

  // Cart timeout enforcement
  useEffect(() => {
    if (!session || session.state !== 'ACTIVE') return;
    const timeoutMs = storeConfig.cart_timeout_minutes * 60 * 1000;
    const createdAt = new Date(session.created_at).getTime();
    const expiresAt = createdAt + timeoutMs;
    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining <= 0) {
      toast.error('Your cart has expired due to inactivity.');
      supabase.from('sessions').update({ state: 'CLOSED' as any }).eq('id', session.id).eq('state', 'ACTIVE' as any)
        .then(() => { setSession(null); setItems([]); });
      return;
    }

    const timer = setTimeout(() => {
      toast.error('Your cart has expired due to inactivity.');
      supabase.from('sessions').update({ state: 'CLOSED' as any }).eq('id', session.id).eq('state', 'ACTIVE' as any)
        .then(() => { setSession(null); setItems([]); });
    }, remaining);

    return () => clearTimeout(timer);
  }, [session?.id, session?.state, session?.created_at, storeConfig.cart_timeout_minutes]);

  // Phase 4: Realtime session state subscription
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session-rt-${session.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${session.id}`,
      }, (payload) => {
        setSession(prev => prev ? { ...prev, ...payload.new } as ShoppingSession : null);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  // Phase 4: Realtime cart items subscription
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`cart-items-rt-${session.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cart_items',
        filter: `session_id=eq.${session.id}`,
      }, async () => {
        // Refetch all items on any change
        const { data } = await supabase
          .from('cart_items')
          .select('*')
          .eq('session_id', session.id)
          .order('added_at', { ascending: true });
        if (data) setItems(data as CartItem[]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  // Phase 5: Create session with config snapshot
  const createSession = useCallback(async (martId: string, branchId: string) => {
    if (!user) return null;
    setLoading(true);
    try {
      // Load and snapshot config
      const { data: martData } = await supabase
        .from('marts')
        .select('config')
        .eq('id', martId)
        .single();
      
      const configSnapshot = martData?.config && typeof martData.config === 'object'
        ? { ...DEFAULT_STORE_CONFIG, ...(martData.config as any) }
        : DEFAULT_STORE_CONFIG;
      
      setStoreConfig(configSnapshot);

      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          mart_id: martId,
          branch_id: branchId,
          session_code: 'TEMP',
          config_snapshot: JSON.parse(JSON.stringify(configSnapshot)) as any,
        })
        .select()
        .single();

      if (error) throw error;

      // Create cart record
      await supabase.from('carts').insert({ session_id: data.id });

      setSession(data as ShoppingSession);
      setItems([]);
      return data;
    } catch (e: any) {
      toast.error(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const lookupAndAddItem = useCallback(async (barcode: string) => {
    if (!session) return false;

    if (items.length >= storeConfig.max_items_per_cart) {
      toast.error(`Cart limit reached (max ${storeConfig.max_items_per_cart} items)`);
      return false;
    }

    setLoading(true);
    try {
      const existing = items.find(i => i.barcode === barcode);
      if (existing) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
        if (error) throw error;
        setItems(prev => prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i));
        await recalcTotal();
        return true;
      }

      const { data, error } = await supabase.functions.invoke('inventory-lookup', {
        body: { barcode, branch_id: session.branch_id },
      });

      if (error || !data?.product) {
        toast.error('Product not found');
        return false;
      }

      const product = data.product;
      const { data: newItem, error: insertErr } = await supabase
        .from('cart_items')
        .insert({
          session_id: session.id,
          barcode: product.barcode,
          title: product.title,
          brand: product.brand,
          category: product.category,
          image_url: product.image_url,
          price: product.price,
          quantity: 1,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      setItems(prev => [...prev, newItem as CartItem]);
      await recalcTotal();
      toast.success(`Added: ${product.title}`);
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [session, items, storeConfig.max_items_per_cart]);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    if (!session || session.state !== 'ACTIVE') return;
    if (quantity <= 0) {
      await supabase.from('cart_items').delete().eq('id', itemId);
      setItems(prev => prev.filter(i => i.id !== itemId));
    } else {
      await supabase.from('cart_items').update({ quantity }).eq('id', itemId);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity } : i));
    }
    await recalcTotal();
  }, [session]);

  const removeItem = useCallback(async (itemId: string) => {
    if (!session || session.state !== 'ACTIVE') return;
    await supabase.from('cart_items').delete().eq('id', itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
    await recalcTotal();
  }, [session]);

  const recalcTotal = useCallback(async () => {
    if (!session) return;
    const { data: freshItems } = await supabase
      .from('cart_items')
      .select('*')
      .eq('session_id', session.id);
    const allItems = (freshItems || []) as CartItem[];
    setItems(allItems);
    const total = allItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    await supabase.from('sessions').update({ total_amount: total }).eq('id', session.id);
    setSession(prev => prev ? { ...prev, total_amount: total } : null);
  }, [session]);

  const setPaymentMethod = useCallback(async (method: string) => {
    if (!session) return;
    await supabase.from('sessions').update({ payment_method: method as any }).eq('id', session.id);
    setSession(prev => prev ? { ...prev, payment_method: method } : null);
  }, [session]);

  const lockCart = useCallback(async () => {
    if (!session || items.length === 0) return;

    const hashData = items.map(i => `${i.barcode}:${i.quantity}:${i.price}`).sort().join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(hashData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const cartHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();

    await supabase
      .from('carts')
      .update({ cart_hash: cartHash, locked_at: new Date().toISOString() })
      .eq('session_id', session.id);

    const { error } = await supabase
      .from('sessions')
      .update({ state: 'LOCKED' as any, cart_hash: cartHash })
      .eq('id', session.id)
      .eq('state', 'ACTIVE' as any);

    if (error) {
      toast.error('Failed to lock cart');
      return;
    }
    setSession(prev => prev ? { ...prev, state: 'LOCKED', cart_hash: cartHash } : null);
    toast.success('Cart locked! Show QR to cashier.');
  }, [session, items]);

  const endSession = useCallback(() => {
    setSession(null);
    setItems([]);
    setStoreConfig(DEFAULT_STORE_CONFIG);
  }, []);

  return {
    session,
    items,
    loading,
    storeConfig,
    createSession,
    lookupAndAddItem,
    updateQuantity,
    removeItem,
    setPaymentMethod,
    lockCart,
    endSession,
    fetchActiveSession,
  };
}
