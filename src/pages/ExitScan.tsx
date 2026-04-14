import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, ShieldCheck, ShieldX, ArrowLeft, ScanBarcode,
  Keyboard, Camera, CheckCircle2, XCircle, Package, User,
  AlertTriangle, Store, MapPin, LogOut,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/integrations/firebase/firebase';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, limit } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { CartItem } from '@/hooks/useSession';

interface SessionData {
  id: string;
  session_code: string;
  state: string;
  total_amount: number;
  cart_hash: string | null;
  branch_id: string;
  mart_id: string;
  user_id: string;
}

const ExitScan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scanInput, setScanInput] = useState('');
  const [scanMode, setScanMode] = useState<'manual' | 'camera'>('manual');
  const [session, setSession] = useState<SessionData | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [verifyResult, setVerifyResult] = useState<'valid' | 'invalid' | 'hash_mismatch' | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);

  const [employeeBranchId, setEmployeeBranchId] = useState<string | null>(null);
  const [employeeMartId, setEmployeeMartId] = useState<string | null>(null);
  const [martName, setMartName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'employees'), 
      where('user_id', '==', user.uid), 
      where('is_active', '==', true), 
      limit(1)
    );
    
    getDocs(q).then(async (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setEmployeeMartId(data.mart_id);
        setEmployeeBranchId(data.branch_id);
        
        const martDoc = await getDoc(doc(db, 'marts', data.mart_id));
        if (martDoc.exists()) setMartName(martDoc.data().name);
        
        if (data.branch_id) {
          const branchDoc = await getDoc(doc(db, 'branches', data.branch_id));
          if (branchDoc.exists()) {
            setBranchName(branchDoc.data().branch_name);
            setBranchAddress(branchDoc.data().address || '');
          }
        }
      }
    });
  }, [user]);

  // Recalculate SHA256 hash from cart items
  const computeCartHash = async (items: CartItem[]): Promise<string> => {
    const hashData = items.map(i => `${i.barcode}:${i.quantity}:${i.price}`).sort().join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(hashData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
  };

  const handleScan = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setVerifyResult(null);
    setCartItems([]);

    const sessionId = code.replace('receipt:', '').trim();

    const sessionRef = doc(db, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      setVerifyResult('invalid');
      toast.error('Session not found');
      setLoading(false);
      return;
    }

    const sess = { id: sessionSnap.id, ...sessionSnap.data() } as SessionData;
    setSession(sess);

    if (sess.state !== 'PAID') {
      setVerifyResult('invalid');
      toast.error(`Invalid: Session state is ${sess.state}`);
      setLoading(false);
      return;
    }

    // Load cart items and verify hash
    const itemsQuery = query(collection(db, 'cart_items'), where('session_id', '==', sess.id));
    const itemsSnap = await getDocs(itemsQuery);
    const sessionItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CartItem));
    setCartItems(sessionItems);

    // Recompute hash and compare
    if (sess.cart_hash && sessionItems.length > 0) {
      const computedHash = await computeCartHash(sessionItems);
      if (computedHash !== sess.cart_hash) {
        setVerifyResult('hash_mismatch');
        toast.error('Cart hash mismatch — cart may have been tampered with!');
        setLoading(false);

        // Audit log the mismatch
        if (user) {
          await addDoc(collection(db, 'audit_logs'), {
            action: 'CART_HASH_MISMATCH',
            user_id: user.uid,
            session_id: sess.id,
            details: { stored_hash: sess.cart_hash, computed_hash: computedHash },
            created_at: new Date().toISOString()
          });
        }
        return;
      }
    }

    const profDoc = await getDoc(doc(db, 'profiles', sess.user_id));
    if (profDoc.exists()) {
      setCustomerName(profDoc.data().display_name || 'Customer');
    } else {
      setCustomerName('Customer');
    }

    setVerifyResult('valid');
    setLoading(false);
  };

  const closeSession = async () => {
    if (!session || !user) return;
    setLoading(true);

    try {
      const sessionRef = doc(db, 'sessions', session.id);
      await updateDoc(sessionRef, { state: 'CLOSED' });

      await addDoc(collection(db, 'audit_logs'), {
        action: 'EXIT_VALIDATED',
        user_id: user.uid,
        session_id: session.id,
        details: { verified_by: user.uid, branch_id: employeeBranchId, cart_hash_verified: true },
        created_at: new Date().toISOString()
      });
    } catch(error) {
      toast.error('Failed to close session');
      setLoading(false);
      return;
    }

    toast.success('Exit validated! Customer may leave.');
    setShowSuccess(true);
    setLoading(false);

    // Auto-reset after 2 seconds
    setTimeout(() => {
      setSession(null);
      setVerifyResult(null);
      setCartItems([]);
      setScanInput('');
      setShowSuccess(false);
    }, 2000);
  };

  // Camera scanner - stop when result is showing, restart when cleared
  useEffect(() => {
    if (scanMode !== 'camera' || !videoRef.current || verifyResult !== null) return;
    let html5QrCode: any;
    const startScanner = async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCode = new Html5Qrcode('exit-reader');
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            handleScan(decodedText);
            html5QrCode.pause();
            setTimeout(() => { try { html5QrCode.resume(); } catch {} }, 3000);
          },
          () => {}
        );
      } catch {
        toast.error('Camera access denied');
        setScanMode('manual');
      }
    };
    startScanner();
    return () => { if (html5QrCode) { try { html5QrCode.stop(); } catch {} } };
  }, [scanMode, verifyResult]);

  if (!employeeMartId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground mb-2">Not Assigned</h1>
          <p className="text-muted-foreground mb-4">You need employee access to use exit validation.</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Exit Validation</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {martName && (
                  <span className="flex items-center gap-1">
                    <Store className="h-3.5 w-3.5" /> {martName}
                  </span>
                )}
                {branchName && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {branchName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Shield className="h-6 w-6 text-primary" />
        </div>
      </header>

      <div className="mx-auto max-w-md p-6">
        {/* Scanner - hidden when result is showing */}
        {!verifyResult && !loading && (
          <>
            {/* Scanner mode toggle */}
            <div className="mb-4 flex gap-2">
              <Button
                variant={scanMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScanMode('manual')}
                className={scanMode === 'manual' ? 'gradient-primary border-0 text-primary-foreground' : ''}
              >
                <Keyboard className="mr-1.5 h-4 w-4" /> Manual
              </Button>
              <Button
                variant={scanMode === 'camera' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setScanMode('camera')}
                className={scanMode === 'camera' ? 'gradient-primary border-0 text-primary-foreground' : ''}
              >
                <Camera className="mr-1.5 h-4 w-4" /> Camera
              </Button>
            </div>

            {scanMode === 'manual' ? (
              <form onSubmit={(e) => { e.preventDefault(); handleScan(scanInput); }} className="mb-6 flex gap-2">
                <Input
                  placeholder="Scan receipt QR or enter session ID..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  className="font-mono"
                  autoFocus
                />
                <Button type="submit" disabled={loading || !scanInput.trim()} className="gradient-primary border-0 text-primary-foreground">
                  <ScanBarcode className="h-5 w-5" />
                </Button>
              </form>
            ) : (
              <div id="exit-reader" ref={videoRef} className="mb-6 overflow-hidden rounded-xl" />
            )}
          </>
        )}

        {/* Valid result */}
        {verifyResult === 'valid' && session && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 text-center"
          >
            <ShieldCheck className="mx-auto mb-3 h-16 w-16 text-primary" />
            <h2 className="mb-1 text-2xl font-bold text-foreground">Valid Receipt</h2>
            <p className="mb-1 text-xs text-primary font-medium">✓ Cart hash verified</p>
            <div className="mb-4 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center justify-center gap-2">
                <User className="h-4 w-4" />
                <span>{customerName}</span>
              </div>
              <p className="font-mono text-xs">{session.session_code}</p>
              <p className="text-lg font-bold text-primary">₹{session.total_amount.toFixed(2)}</p>
              <p className="text-xs">{cartItems.length} items</p>
            </div>

            {/* Show cart items summary */}
            <div className="mb-4 max-h-40 overflow-y-auto rounded-lg bg-background/50 p-2 text-left">
              {cartItems.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-foreground">{idx + 1}. {item.title} × {item.quantity}</span>
                  <span className="text-muted-foreground">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <Button
              className="w-full gradient-primary border-0 text-primary-foreground py-5 text-base"
              onClick={closeSession}
              disabled={loading}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" /> Approve Exit
            </Button>
          </motion.div>
        )}

        {/* Hash mismatch */}
        {verifyResult === 'hash_mismatch' && session && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-6 text-center"
          >
            <AlertTriangle className="mx-auto mb-3 h-16 w-16 text-destructive" />
            <h2 className="mb-1 text-2xl font-bold text-foreground">Cart Tampered!</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              The cart hash does not match. Items may have been modified after verification.
            </p>
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-left">
              <p className="text-xs text-destructive font-medium mb-1">Stored hash: <span className="font-mono">{session.cart_hash}</span></p>
              <p className="text-xs text-muted-foreground">Session: {session.session_code}</p>
              <p className="text-xs text-muted-foreground">Amount: ₹{session.total_amount.toFixed(2)}</p>
            </div>
            <p className="mb-4 text-xs text-destructive font-medium">⚠ Do NOT allow exit. Escalate to management.</p>
            <Button variant="outline" onClick={() => { setVerifyResult(null); setSession(null); setScanInput(''); setCartItems([]); }}>
              <XCircle className="mr-2 h-4 w-4" /> Scan Another
            </Button>
          </motion.div>
        )}

        {/* Invalid */}
        {verifyResult === 'invalid' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-6 text-center"
          >
            <ShieldX className="mx-auto mb-3 h-16 w-16 text-destructive" />
            <h2 className="mb-1 text-2xl font-bold text-foreground">Invalid Receipt</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {session ? `Session state: ${session.state}` : 'Session not found'}
            </p>
            <Button variant="outline" onClick={() => { setVerifyResult(null); setSession(null); setScanInput(''); }}>
              <XCircle className="mr-2 h-4 w-4" /> Try Again
            </Button>
          </motion.div>
        )}

        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Success!</h2>
            <p className="text-muted-foreground">Exit approved. Ready for next scan.</p>
          </motion.div>
        )}

        {!verifyResult && !loading && !showSuccess && (
          <div className="py-16 text-center">
            <Shield className="mx-auto mb-4 h-20 w-20 text-muted-foreground/20" />
            <p className="text-muted-foreground">Scan a receipt QR to validate exit</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ExitScan;