import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/integrations/firebase/firebase';
import { 
  collection, query, where, getDocs, orderBy, limit, 
  updateDoc, deleteDoc, doc, addDoc, onSnapshot, getDoc
} from 'firebase/firestore';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { StoreConfig } from '@/lib/storeConfig';
import { DEFAULT_STORE_CONFIG } from '@/lib/storeConfig';
import type { Session as ShoppingSession, CartItem } from '@/integrations/firebase/types';

export { type CartItem, type ShoppingSession };

export function useSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);
  
  const currentSessionId = useRef<string | null>(null);

  // Load store config — prefer session snapshot, fallback to mart config
  const loadStoreConfig = useCallback(async (martId: string, snapshot?: any) => {
    if (snapshot && typeof snapshot === 'object') {
      setStoreConfig({ ...DEFAULT_STORE_CONFIG, ...snapshot });
      return;
    }
    const martDoc = await getDoc(doc(db, 'marts', martId));
    const data = martDoc.data();
    if (data?.config && typeof data.config === 'object') {
      setStoreConfig({ ...DEFAULT_STORE_CONFIG, ...(data.config as any) });
    }
  }, []);

  // Fetch active session for current user
  const fetchActiveSession = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'sessions'),
        where('user_id', '==', user.uid),
        where('state', 'in', ['ACTIVE', 'LOCKED', 'VERIFIED', 'PAID']),
        orderBy('created_at', 'desc'),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const sessionData = { id: docSnap.id, ...docSnap.data() } as ShoppingSession;
        setSession(sessionData);
        currentSessionId.current = sessionData.id;
        await loadStoreConfig(sessionData.mart_id, docSnap.data().config_snapshot);
        
        const itemsQuery = query(
          collection(db, 'cart_items'),
          where('session_id', '==', docSnap.id),
          orderBy('added_at', 'asc')
        );
        const itemsSnapshot = await getDocs(itemsQuery);
        setItems(itemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }) as CartItem));
      } else {
        setSession(null);
        currentSessionId.current = null;
        setItems([]);
      }
    } catch (error) {
      console.error("Error fetching session:", error);
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
      (async () => {
        const sessionRef = doc(db, 'sessions', session.id);
        const curDoc = await getDoc(sessionRef);
        if (curDoc.exists() && curDoc.data().state === 'ACTIVE') {
          await updateDoc(sessionRef, { state: 'CLOSED' });
          setSession(null);
          setItems([]);
          currentSessionId.current = null;
        }
      })();
      return;
    }

    const timer = setTimeout(() => {
      toast.error('Your cart has expired due to inactivity.');
      (async () => {
        const sessionRef = doc(db, 'sessions', session.id);
        const curDoc = await getDoc(sessionRef);
        if (curDoc.exists() && curDoc.data().state === 'ACTIVE') {
          await updateDoc(sessionRef, { state: 'CLOSED' });
          setSession(null);
          setItems([]);
          currentSessionId.current = null;
        }
      })();
    }, remaining);

    return () => clearTimeout(timer);
  }, [session?.id, session?.state, session?.created_at, storeConfig.cart_timeout_minutes]);

  // Realtime session state subscription
  useEffect(() => {
    if (!currentSessionId.current) return;
    
    const unsubscribe = onSnapshot(doc(db, 'sessions', currentSessionId.current), (docSnap) => {
      if (docSnap.exists()) {
        setSession({ id: docSnap.id, ...docSnap.data() } as ShoppingSession);
      } else {
        setSession(null);
        currentSessionId.current = null;
      }
    });

    return () => unsubscribe();
  }, [currentSessionId.current]);

  // Realtime cart items subscription
  useEffect(() => {
    if (!currentSessionId.current) return;
    
    const itemsQuery = query(
      collection(db, 'cart_items'),
      where('session_id', '==', currentSessionId.current),
      orderBy('added_at', 'asc')
    );
    
    const unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
      setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CartItem)));
    });

    return () => unsubscribe();
  }, [currentSessionId.current]);

  const createSession = useCallback(async (martId: string, branchId: string) => {
    if (!user) return null;
    setLoading(true);
    try {
      const martDoc = await getDoc(doc(db, 'marts', martId));
      const martData = martDoc.data();
      
      const configSnapshot = martData?.config && typeof martData.config === 'object'
        ? { ...DEFAULT_STORE_CONFIG, ...martData.config }
        : DEFAULT_STORE_CONFIG;
      
      setStoreConfig(configSnapshot);

      const sessionCode = 'QLS-' + Math.random().toString(36).substring(2, 10).toUpperCase();

      const newSessionRef = await addDoc(collection(db, 'sessions'), {
        user_id: user.uid,
        mart_id: martId,
        branch_id: branchId,
        session_code: sessionCode,
        config_snapshot: JSON.parse(JSON.stringify(configSnapshot)),
        state: 'ACTIVE',
        total_amount: 0,
        payment_method: null,
        cart_hash: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      const newSessionData = await getDoc(newSessionRef);

      // Create cart record (as in supabase schema) - Note: not strictly necessary with nosql
      await addDoc(collection(db, 'carts'), { 
        session_id: newSessionRef.id,
        created_at: new Date().toISOString()
      });

      const sessionObj = { id: newSessionRef.id, ...newSessionData.data() } as ShoppingSession;
      setSession(sessionObj);
      currentSessionId.current = sessionObj.id;
      setItems([]);
      return sessionObj;
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
        await updateDoc(doc(db, 'cart_items', existing.id), { 
          quantity: existing.quantity + 1 
        });
        // Realtime listener updates the item list
        await recalcTotal();
        return true;
      }

      // Vercel Serverless API fetch
      const resp = await fetch('/api/inventory-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, branch_id: session.branch_id })
      });
      
      if (!resp.ok) {
        toast.error('Product not found');
        return false;
      }
      const data = await resp.json();

      if (!data?.product) {
        toast.error('Product not found');
        return false;
      }

      const product = data.product;
      await addDoc(collection(db, 'cart_items'), {
        session_id: session.id,
        barcode: product.barcode,
        title: product.title,
        brand: product.brand || null,
        category: product.category || null,
        image_url: product.image_url || null,
        price: product.price,
        quantity: 1,
        added_at: new Date().toISOString()
      });

      // Realtime subscription updates the local list
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
      await deleteDoc(doc(db, 'cart_items', itemId));
    } else {
      await updateDoc(doc(db, 'cart_items', itemId), { quantity });
    }
    await recalcTotal();
  }, [session]);

  const removeItem = useCallback(async (itemId: string) => {
    if (!session || session.state !== 'ACTIVE') return;
    await deleteDoc(doc(db, 'cart_items', itemId));
    await recalcTotal();
  }, [session]);

  const recalcTotal = useCallback(async () => {
    if (!session) return;
    // We compute locally as items change, but we should fetch fresh to be safe
    const freshItemsQuery = query(collection(db, 'cart_items'), where('session_id', '==', session.id));
    const freshItemsSnap = await getDocs(freshItemsQuery);
    
    const total = freshItemsSnap.docs.reduce((sum, d) => sum + (d.data().price * d.data().quantity), 0);
    await updateDoc(doc(db, 'sessions', session.id), { 
      total_amount: total,
      updated_at: new Date().toISOString()
    });
  }, [session]);

  const setPaymentMethod = useCallback(async (method: string) => {
    if (!session) return;
    await updateDoc(doc(db, 'sessions', session.id), { payment_method: method });
  }, [session]);

  const lockCart = useCallback(async () => {
    if (!session || items.length === 0) return;

    const hashData = items.map(i => `${i.barcode}:${i.quantity}:${i.price}`).sort().join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(hashData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const cartHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();

    // Query for carts associated with this session to update the cart hash
    const cartQuery = query(collection(db, 'carts'), where('session_id', '==', session.id));
    const cartSnap = await getDocs(cartQuery);
    if (!cartSnap.empty) {
      await updateDoc(doc(db, 'carts', cartSnap.docs[0].id), {
        cart_hash: cartHash,
        locked_at: new Date().toISOString()
      });
    }

    const sessionRef = doc(db, 'sessions', session.id);
    const curDoc = await getDoc(sessionRef);
    if (curDoc.exists() && curDoc.data().state === 'ACTIVE') {
      await updateDoc(sessionRef, { 
        state: 'LOCKED', 
        cart_hash: cartHash,
        updated_at: new Date().toISOString()
      });
      toast.success('Cart locked! Show QR to cashier.');
    } else {
      toast.error('Failed to lock cart');
    }
  }, [session, items]);

  const endSession = useCallback(() => {
    setSession(null);
    setItems([]);
    currentSessionId.current = null;
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
