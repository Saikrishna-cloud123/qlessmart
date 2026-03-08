import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldCheck, ShieldX, Package, ArrowLeft,
  CheckCircle2, XCircle, CreditCard, Receipt, Clock,
  ScanBarcode
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useECartStore, type Session } from '@/lib/store';
import { toast } from 'sonner';

const STATE_COLORS: Record<string, string> = {
  ACTIVE: 'bg-accent/20 text-accent-foreground',
  LOCKED: 'bg-warning/20 text-warning-foreground',
  VERIFIED: 'bg-success/20 text-success-foreground',
  PAID: 'bg-primary/20 text-primary',
  CLOSED: 'bg-muted text-muted-foreground',
};

const CashierDashboard = () => {
  const navigate = useNavigate();
  const { sessions, verifyCart, rejectCart, markPaid, closeSession } = useECartStore();
  const [cashierName, setCashierName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [scanInput, setScanInput] = useState('');

  const allSessions = Object.values(sessions).filter(s => s.state !== 'CLOSED');
  const lockedSessions = allSessions.filter(s => s.state === 'LOCKED');

  // Auto-refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Update selected session when store changes
  useEffect(() => {
    if (selectedSession) {
      const updated = sessions[selectedSession.id];
      if (updated) setSelectedSession(updated);
    }
  }, [sessions, selectedSession?.id]);

  const handleScanQR = () => {
    const session = sessions[scanInput.trim()];
    if (session && session.state === 'LOCKED') {
      setSelectedSession(session);
      setScanInput('');
    } else if (session) {
      toast.error(`Session found but state is ${session.state}`);
    } else {
      toast.error('Session not found');
    }
  };

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card w-full max-w-sm rounded-2xl p-8"
        >
          <Shield className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h1 className="mb-2 text-center text-2xl font-bold text-foreground">Cashier Login</h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Enter your name to start verifying carts
          </p>
          <form onSubmit={(e) => { e.preventDefault(); if (cashierName.trim()) setLoggedIn(true); }}>
            <Input
              placeholder="Your name"
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              className="mb-4"
              autoFocus
            />
            <Button
              type="submit"
              className="w-full gradient-primary border-0 text-primary-foreground"
              disabled={!cashierName.trim()}
            >
              Start Shift
            </Button>
          </form>
          <Button variant="ghost" className="mt-3 w-full" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </motion.div>
      </div>
    );
  }

  // Session detail view
  if (selectedSession) {
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
                <p className="font-mono text-xs text-muted-foreground">{selectedSession.id}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATE_COLORS[selectedSession.state]}`}>
              {selectedSession.state}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-2xl p-6">
          {/* Cart hash */}
          {selectedSession.cartHash && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Cart Fingerprint</p>
                <p className="font-mono text-sm font-bold text-foreground">{selectedSession.cartHash}</p>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="mb-4 space-y-2">
            {selectedSession.items.map((item, idx) => (
              <div
                key={item.product.barcode}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                {item.product.image ? (
                  <img src={item.product.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{item.product.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.product.barcode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">×{item.quantity}</p>
                  <p className="text-sm text-primary">₹{(item.product.price * item.quantity).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mb-6 flex items-center justify-between rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            <span className="font-medium text-foreground">Total Amount</span>
            <span className="text-2xl font-bold text-primary">₹{selectedSession.totalAmount.toFixed(2)}</span>
          </div>

          {/* Actions */}
          {selectedSession.state === 'LOCKED' && (
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-success text-success-foreground hover:bg-success/90 py-6 text-base"
                onClick={() => {
                  verifyCart(selectedSession.id, cashierName);
                  toast.success('Cart verified!');
                }}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Approve Cart
              </Button>
              <Button
                variant="destructive"
                className="flex-1 py-6 text-base"
                onClick={() => {
                  rejectCart(selectedSession.id);
                  setSelectedSession(null);
                  toast.info('Cart rejected, returned to customer.');
                }}
              >
                <XCircle className="mr-2 h-5 w-5" />
                Reject
              </Button>
            </div>
          )}

          {selectedSession.state === 'VERIFIED' && (
            <Button
              className="w-full gradient-primary border-0 text-primary-foreground py-6 text-base"
              onClick={() => {
                markPaid(selectedSession.id);
                toast.success('Payment recorded!');
              }}
            >
              <CreditCard className="mr-2 h-5 w-5" />
              Record Payment
            </Button>
          )}

          {selectedSession.state === 'PAID' && (
            <Button
              className="w-full py-6 text-base"
              variant="outline"
              onClick={() => {
                closeSession(selectedSession.id);
                setSelectedSession(null);
                toast.success('Session closed.');
              }}
            >
              <Receipt className="mr-2 h-5 w-5" />
              Close & Print Receipt
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Dashboard list
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Cashier Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome, {cashierName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Exit
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-6">
        {/* QR scan input */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleScanQR(); }}
          className="mb-6 flex gap-2"
        >
          <Input
            placeholder="Scan or enter session ID..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            className="font-mono"
          />
          <Button type="submit" className="gradient-primary border-0 text-primary-foreground">
            <ScanBarcode className="h-5 w-5" />
          </Button>
        </form>

        {/* Pending verification */}
        {lockedSessions.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-warning" />
              Pending Verification ({lockedSessions.length})
            </h2>
            <div className="space-y-2">
              {lockedSessions.map((session) => (
                <motion.button
                  key={session.id}
                  className="w-full rounded-xl border-2 border-warning/30 bg-warning/5 p-4 text-left transition-colors hover:bg-warning/10"
                  onClick={() => setSelectedSession(session)}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">{session.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.items.length} items · ₹{session.totalAmount.toFixed(2)}
                      </p>
                    </div>
                    <ShieldCheck className="h-6 w-6 text-warning" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* All active sessions */}
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          All Active Sessions ({allSessions.length})
        </h2>
        {allSessions.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ShieldX className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p>No active sessions</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {allSessions.map((session) => (
                <motion.button
                  key={session.id}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                  onClick={() => session.state !== 'ACTIVE' && setSelectedSession(session)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-bold text-foreground">{session.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.items.length} items · ₹{session.totalAmount.toFixed(2)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_COLORS[session.state]}`}>
                      {session.state}
                    </span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashierDashboard;
