import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldCheck, ShieldX, Package, ArrowLeft,
  CheckCircle2, XCircle, CreditCard, Receipt, Clock,
  ScanBarcode, Plus, Minus, User, Banknote, QrCode, Smartphone,
  Settings, Save, Mail, LogOut, Camera,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { CartItem } from '@/hooks/useSession';

const STATE_COLORS: Record<string, string> = {
  ACTIVE: 'bg-accent/20 text-accent-foreground',
  LOCKED: 'bg-warning/20 text-warning-foreground',
  VERIFIED: 'bg-primary/20 text-primary',
  PAID: 'bg-primary/20 text-primary',
  CLOSED: 'bg-muted text-muted-foreground',
};

const PAYMENT_LABELS: Record<string, { label: string; icon: any }> = {
  cash: { label: 'Cash', icon: Banknote },
  card: { label: 'Card', icon: CreditCard },
  upi_counter: { label: 'UPI Counter', icon: QrCode },
  upi_app: { label: 'UPI App', icon: Smartphone },
  razorpay: { label: 'Online', icon: CreditCard },
};

interface SessionRow {
  id: string;
  session_code: string;
  state: string;
  total_amount: number;
  cart_hash: string | null;
  payment_method: string | null;
  user_id: string;
  mart_id: string;
  branch_id: string;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
}

const CashierDashboard = () => {
  const navigate = useNavigate();
  const { user, profile, updateProfile, signOut } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [sessionItems, setSessionItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [scanInput, setScanInput] = useState('');
  const [addBarcode, setAddBarcode] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [profileName, setProfileName] = useState(profile?.display_name || '');
  const [profileAvatar, setProfileAvatar] = useState(profile?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [employeeMartId, setEmployeeMartId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('employees').select('mart_id').eq('user_id', user.id).eq('is_active', true).limit(1).single()
      .then(({ data }) => {
        if (data) setEmployeeMartId(data.mart_id);
      });
  }, [user]);

  const fetchSessions = useCallback(async () => {
    if (!employeeMartId) return;
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('mart_id', employeeMartId)
      .in('state', ['LOCKED', 'VERIFIED', 'PAID'])
      .order('created_at', { ascending: false });
    if (data) setSessions(data as SessionRow[]);
  }, [employeeMartId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!employeeMartId) return;
    const channel = supabase
      .channel('cashier-sessions')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'sessions',
        filter: `mart_id=eq.${employeeMartId}`,
      }, () => { fetchSessions(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeMartId, fetchSessions]);

  const loadSessionDetail = useCallback(async (sess: SessionRow) => {
    setSelectedSession(sess);
    const { data: items } = await supabase.from('cart_items').select('*').eq('session_id', sess.id);
    setSessionItems((items || []) as CartItem[]);
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', sess.user_id).single();
    setCustomerName(prof?.display_name || 'Customer');
  }, []);

  const handleScanQR = async () => {
    const input = scanInput.trim();
    if (!input) return;
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .or(`id.eq.${input},session_code.eq.${input}`)
      .single();

    if (data && data.state === 'LOCKED') {
      loadSessionDetail(data as SessionRow);
      setScanInput('');
    } else if (data) {
      toast.error(`Session state is ${data.state}`);
    } else {
      toast.error('Session not found');
    }
  };

  const verifyCart = async () => {
    if (!selectedSession || !user) return;
    const { error } = await supabase
      .from('sessions')
      .update({ state: 'VERIFIED' as any, verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', selectedSession.id)
      .eq('state', 'LOCKED' as any);
    if (error) { toast.error('Failed to verify'); return; }
    toast.success('Cart verified!');
    setSelectedSession(prev => prev ? { ...prev, state: 'VERIFIED', verified_by: user.id } : null);
    fetchSessions();
  };

  const rejectCart = async () => {
    if (!selectedSession) return;
    await supabase.from('sessions').update({ state: 'ACTIVE' as any, cart_hash: null }).eq('id', selectedSession.id);
    toast.info('Cart rejected, returned to customer.');
    setSelectedSession(null);
    fetchSessions();
  };

  const markPaid = async () => {
    if (!selectedSession) return;
    // Create payment record
    await supabase.from('payments').insert({
      session_id: selectedSession.id,
      amount: selectedSession.total_amount,
      method: (selectedSession.payment_method || 'cash') as any,
      status: 'completed',
      paid_at: new Date().toISOString(),
    });
    // Generate invoice
    await supabase.from('invoices').insert({
      session_id: selectedSession.id,
      mart_id: selectedSession.mart_id,
      branch_id: selectedSession.branch_id,
      user_id: selectedSession.user_id,
      invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
      items: sessionItems as any,
      total_amount: selectedSession.total_amount,
      total_quantity: sessionItems.reduce((s, i) => s + i.quantity, 0),
      payment_method: (selectedSession.payment_method || 'cash') as any,
    });
    await supabase.from('sessions').update({ state: 'PAID' as any }).eq('id', selectedSession.id);

    // Deliver invoice to mart API
    try {
      await supabase.functions.invoke('deliver-invoice', {
        body: { session_id: selectedSession.id },
      });
    } catch (e) {
      console.log('Invoice delivery skipped:', e);
    }

    // Audit log
    if (user) {
      await supabase.from('audit_logs').insert({
        action: 'PAYMENT_COMPLETED',
        user_id: user.id,
        session_id: selectedSession.id,
        details: { amount: selectedSession.total_amount, method: selectedSession.payment_method },
      });
    }
    toast.success('Payment recorded & invoice generated!');
    setSelectedSession(prev => prev ? { ...prev, state: 'PAID' } : null);
    fetchSessions();
  };

  const updateItemQty = async (itemId: string, qty: number) => {
    if (qty <= 0) {
      await supabase.from('cart_items').delete().eq('id', itemId);
      setSessionItems(prev => prev.filter(i => i.id !== itemId));
    } else {
      await supabase.from('cart_items').update({ quantity: qty }).eq('id', itemId);
      setSessionItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: qty } : i));
    }
    const newTotal = sessionItems
      .map(i => i.id === itemId ? (qty <= 0 ? 0 : i.price * qty) : i.price * i.quantity)
      .reduce((a, b) => a + b, 0);
    await supabase.from('sessions').update({ total_amount: newTotal }).eq('id', selectedSession!.id);
    setSelectedSession(prev => prev ? { ...prev, total_amount: newTotal } : null);
  };

  const addItemToSession = async () => {
    if (!selectedSession || !addBarcode.trim()) return;
    setAddingItem(true);
    try {
      const { data, error } = await supabase.functions.invoke('inventory-lookup', {
        body: { barcode: addBarcode.trim(), branch_id: selectedSession.branch_id },
      });
      if (error || !data?.product) { toast.error('Product not found'); return; }
      const p = data.product;
      const { data: newItem } = await supabase.from('cart_items').insert({
        session_id: selectedSession.id, barcode: p.barcode, title: p.title,
        brand: p.brand, category: p.category, image_url: p.image_url, price: p.price, quantity: 1,
      }).select().single();
      if (newItem) {
        setSessionItems(prev => [...prev, newItem as CartItem]);
        const newTotal = selectedSession.total_amount + p.price;
        await supabase.from('sessions').update({ total_amount: newTotal }).eq('id', selectedSession.id);
        setSelectedSession(prev => prev ? { ...prev, total_amount: newTotal } : null);
        toast.success(`Added: ${p.title}`);
        setAddBarcode('');
      }
    } finally { setAddingItem(false); }
  };

  const changePaymentMethod = async (method: string) => {
    if (!selectedSession) return;
    await supabase.from('sessions').update({ payment_method: method as any }).eq('id', selectedSession.id);
    setSelectedSession(prev => prev ? { ...prev, payment_method: method } : null);
    toast.success('Payment method updated');
  };

  if (!employeeMartId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground mb-2">Not Assigned</h1>
          <p className="text-muted-foreground mb-4">You are not assigned to any store as a cashier.</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back Home
          </Button>
        </div>
      </div>
    );
  }

  // Session detail view
  if (selectedSession) {
    const payInfo = PAYMENT_LABELS[selectedSession.payment_method || 'cash'];
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setSelectedSession(null)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-bold text-foreground">Cart Verification</h1>
                <p className="font-mono text-xs text-muted-foreground">{selectedSession.session_code}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATE_COLORS[selectedSession.state]}`}>
              {selectedSession.state}
            </span>
          </div>
        </header>
        <div className="mx-auto max-w-2xl p-6">
          {/* Customer info — display_name only, no email */}
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <User className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium text-foreground">{customerName}</p>
            </div>
          </div>

          {/* Cart hash */}
          {selectedSession.cart_hash && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">SHA256 Cart Fingerprint</p>
                <p className="font-mono text-sm font-bold text-foreground">{selectedSession.cart_hash}</p>
              </div>
            </div>
          )}

          {/* Payment method */}
          <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              {payInfo && <payInfo.icon className="h-5 w-5 text-primary" />}
              <div>
                <p className="text-xs text-muted-foreground">Payment Method</p>
                <p className="font-medium text-foreground">{payInfo?.label || 'Not set'}</p>
              </div>
            </div>
            {selectedSession.state === 'LOCKED' && (
              <div className="flex gap-1">
                {Object.entries(PAYMENT_LABELS).map(([key, val]) => (
                  <Button
                    key={key}
                    variant={selectedSession.payment_method === key ? 'default' : 'ghost'}
                    size="sm"
                    className={selectedSession.payment_method === key ? 'gradient-primary border-0 text-primary-foreground' : ''}
                    onClick={() => changePaymentMethod(key)}
                  >
                    <val.icon className="h-3.5 w-3.5" />
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="mb-4 space-y-2">
            {sessionItems.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">{idx + 1}</span>
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.barcode}</p>
                </div>
                <div className="flex items-center gap-1">
                  {selectedSession.state === 'LOCKED' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateItemQty(item.id, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                  )}
                  <span className="w-6 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                  {selectedSession.state === 'LOCKED' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateItemQty(item.id, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                  <span className="ml-2 text-sm text-primary font-medium">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Add item */}
          {selectedSession.state === 'LOCKED' && (
            <form onSubmit={(e) => { e.preventDefault(); addItemToSession(); }} className="mb-4 flex gap-2">
              <Input
                placeholder="Add barcode..."
                value={addBarcode}
                onChange={(e) => setAddBarcode(e.target.value)}
                className="font-mono"
              />
              <Button type="submit" disabled={addingItem || !addBarcode.trim()} className="gradient-primary border-0 text-primary-foreground">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          )}

          {/* Total */}
          <div className="mb-6 flex items-center justify-between rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            <span className="font-medium text-foreground">Total Amount</span>
            <span className="text-2xl font-bold text-primary">₹{selectedSession.total_amount.toFixed(2)}</span>
          </div>

          {/* Actions */}
          {selectedSession.state === 'LOCKED' && (
            <div className="flex gap-3">
              <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 py-6 text-base" onClick={verifyCart}>
                <CheckCircle2 className="mr-2 h-5 w-5" /> Approve Cart
              </Button>
              <Button variant="destructive" className="flex-1 py-6 text-base" onClick={rejectCart}>
                <XCircle className="mr-2 h-5 w-5" /> Reject
              </Button>
            </div>
          )}
          {selectedSession.state === 'VERIFIED' && (
            <Button className="w-full gradient-primary border-0 text-primary-foreground py-6 text-base" onClick={markPaid}>
              <CreditCard className="mr-2 h-5 w-5" /> Mark as Paid
            </Button>
          )}
          {selectedSession.state === 'PAID' && (
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="text-sm font-medium text-foreground">Payment complete & invoice generated</p>
              <p className="text-xs text-muted-foreground">Customer can show receipt QR at exit</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Dashboard list
  const lockedSessions = sessions.filter(s => s.state === 'LOCKED');
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Cashier Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {lockedSessions.length} pending verification{lockedSessions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-6">
        {showSettings && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2"><User className="h-4 w-4" /> Profile</h3>
            <div>
              <Label className="text-sm font-medium text-foreground">Display Name</Label>
              <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-medium text-foreground">Email</Label>
              <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" /> {user?.email}
              </div>
            </div>
            <Button disabled={savingProfile} className="w-full gradient-primary border-0 text-primary-foreground" onClick={async () => {
              setSavingProfile(true);
              const { error } = await updateProfile({ display_name: profileName.trim() || null, avatar_url: profileAvatar.trim() || null });
              setSavingProfile(false);
              if (error) toast.error('Failed to save'); else toast.success('Profile updated!');
            }}>
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </motion.div>
        )}

        {/* QR Scanner */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <ScanBarcode className="h-5 w-5 text-primary" /> Scan Customer QR
          </h3>
          <form onSubmit={(e) => { e.preventDefault(); handleScanQR(); }} className="flex gap-2">
            <Input
              placeholder="Scan QR or enter session ID..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" disabled={!scanInput.trim()} className="gradient-primary border-0 text-primary-foreground">
              <ScanBarcode className="h-5 w-5" />
            </Button>
          </form>
        </div>

        {/* Sessions list */}
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Pending Sessions</h3>
          <span className="ml-auto text-sm text-muted-foreground">{sessions.length} total</span>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">No sessions waiting for verification</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((sess, i) => {
              const payLabel = PAYMENT_LABELS[sess.payment_method || 'cash'];
              return (
                <motion.button
                  key={sess.id}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => loadSessionDetail(sess)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    {sess.state === 'LOCKED' ? <Shield className="h-5 w-5 text-primary" /> :
                     sess.state === 'VERIFIED' ? <ShieldCheck className="h-5 w-5 text-primary" /> :
                     <CheckCircle2 className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium text-foreground">{sess.session_code}</p>
                    <p className="text-xs text-muted-foreground">
                      {payLabel?.label} · {new Date(sess.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">₹{sess.total_amount.toFixed(2)}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATE_COLORS[sess.state]}`}>
                      {sess.state}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CashierDashboard;
