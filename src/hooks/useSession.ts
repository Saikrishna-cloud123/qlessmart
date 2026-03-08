import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

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
}

export function useSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

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
      // Fetch items
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
  }, [user]);

  useEffect(() => { fetchActiveSession(); }, [fetchActiveSession]);

  // Subscribe to realtime session updates
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session-${session.id}`)
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

  const createSession = useCallback(async (martId: string, branchId: string) => {
    if (!user) return null;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          mart_id: martId,
          branch_id: branchId,
          session_code: 'TEMP', // trigger will generate
        })
        .select()
        .single();

      if (error) throw error;
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
    setLoading(true);
    try {
      // Check if already in cart
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

      // Lookup via edge function
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
  }, [session, items]);

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
    // Re-fetch items to be accurate
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
    // Generate cart hash
    const hashData = items.map(i => `${i.barcode}:${i.quantity}`).sort().join('|');
    let hash = 0;
    for (let i = 0; i < hashData.length; i++) {
      hash = ((hash << 5) - hash) + hashData.charCodeAt(i);
      hash |= 0;
    }
    const cartHash = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');

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
  }, []);

  return {
    session,
    items,
    loading,
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
