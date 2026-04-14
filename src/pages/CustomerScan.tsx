import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanBarcode, Plus, Minus, Trash2, Lock, ShoppingCart, Package,
  ArrowLeft, Keyboard, Camera, Store, MapPin, CreditCard, Banknote,
  Smartphone, QrCode, ChevronRight, Receipt, XCircle, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSession } from '@/hooks/useSession';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/integrations/firebase/firebase';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { toast } from 'sonner';
import type { PaymentConfig } from '@/lib/storeConfig';

type PaymentMethod = 'cash' | 'card' | 'upi_counter' | 'upi_app' | 'razorpay';

const ALL_PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: any }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'upi_counter', label: 'UPI at Counter', icon: QrCode },
  { value: 'upi_app', label: 'UPI via App', icon: Smartphone },
  { value: 'razorpay', label: 'Pay Online', icon: CreditCard },
];

// UPI app deep-link configs
const UPI_APPS = [
  { name: 'Google Pay', scheme: 'tez://upi/pay', color: '#4285F4', abbr: 'GPay' },
  { name: 'PhonePe', scheme: 'phonepe://pay', color: '#5F259F', abbr: 'PhonePe' },
  { name: 'Paytm', scheme: 'paytmmp://pay', color: '#00BAF2', abbr: 'Paytm' },
  { name: 'BHIM UPI', scheme: 'upi://pay', color: '#00796B', abbr: 'BHIM' },
];

interface Mart { id: string; name: string; logo_url: string | null; }
interface Branch { id: string; branch_name: string; address: string | null; is_default: boolean; }

const CustomerScan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    session, items, loading, storeConfig,
    createSession, lookupAndAddItem, updateQuantity, removeItem,
    setPaymentMethod, lockCart, unlockCart, confirmManualPayment, endSession,
  } = useSession();

  const [marts, setMarts] = useState<Mart[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedMart, setSelectedMart] = useState<string | null>(null);
  const [step, setStep] = useState<'select-mart' | 'select-branch' | 'scan' | 'payment' | 'locked' | 'done'>('select-mart');

  const [barcode, setBarcode] = useState('');
  const [scanMode, setScanMode] = useState<'manual' | 'camera'>('manual');
  const [storeScanMode, setStoreScanMode] = useState<'manual' | 'camera'>('manual');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [upiLink, setUpiLink] = useState<string | null>(null);
  const [upiDetails, setUpiDetails] = useState<{ pa: string; pn: string } | null>(null);
  const [martName, setMartName] = useState<string>('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const storeVideoRef = useRef<HTMLDivElement>(null);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const localTotalAmount = items.reduce((s, i) => s + (i.price * i.quantity), 0);


  // Filter payment options based on store config
  const paymentOptions = ALL_PAYMENT_OPTIONS.filter(opt =>
    storeConfig.payment_config.supported_methods.includes(opt.value)
  );

  useEffect(() => {
    if (session) {
      if (session.state === 'ACTIVE') {
        // Only force 'scan' step if we aren't in 'payment' or 'locked' sub-steps
        if (step !== 'payment' && step !== 'locked') {
          setStep('scan');
        }
      }
      else if (session.state === 'LOCKED' || session.state === 'VERIFIED') setStep('locked');
      else if (['PAID', 'CLOSED'].includes(session.state)) setStep('done');
      // Load mart name for active session
      if (!martName) {
        getDoc(doc(db, 'marts', session.mart_id))
          .then((docSnap) => { if (docSnap.exists()) setMartName(docSnap.data().name); })
          .catch(e => toast.error(`Session mart load error: ${e.message}`));
      }
    } else {
      setStep('select-mart');
      setMartName('');
      setSelectedMart(null);
    }
  }, [session]);

  useEffect(() => {
    getDocs(collection(db, 'marts'))
      .then((snapshot) => {
        const martsData = snapshot.docs.map(d => ({ id: d.id, name: d.data().name, logo_url: d.data().logo_url }));
        setMarts(martsData);
      })
      .catch(e => {
        console.error("Marts fetch error:", e);
        toast.error(`Error loading stores: ${e.message}`);
      });
  }, []);

  useEffect(() => {
    if (!selectedMart) return;
    const q = query(collection(db, 'branches'), where('mart_id', '==', selectedMart));
    getDocs(q)
      .then((snapshot) => {
        const data = snapshot.docs.map(d => ({
          id: d.id,
          branch_name: d.data().branch_name,
          address: d.data().address || null,
          is_default: d.data().is_default
        }));
        if (data.length > 0) {
          setBranches(data);
          if (data.length === 1) {
            handleBranchSelect(data[0].id);
          } else {
            setStep('select-branch');
          }
        }
      })
      .catch(e => {
        console.error("Branches fetch error:", e);
        toast.error(`Error loading branches: ${e.message}`);
      });
  }, [selectedMart]);

  // Phase 5: Parse store QR code format
  const handleStoreQR = async (qrData: string) => {
    // Format: store:{mart_id}|branch:{branch_id}
    const storeMatch = qrData.match(/store:([^|]+)/);
    const branchMatch = qrData.match(/branch:(.+)/);
    if (storeMatch && branchMatch) {
      const martId = storeMatch[1];
      const branchId = branchMatch[1];
      // Validate store and branch
      const martDoc = await getDoc(doc(db, 'marts', martId));
      const branchDoc = await getDoc(doc(db, 'branches', branchId));

      const martData = martDoc.data();
      const branchData = branchDoc.data();
      if (martDoc.exists() && branchDoc.exists() && branchData?.mart_id === martId) {
        setMartName(martData.name);
        const result = await createSession(martId, branchId);
        if (result) {
          toast.success(`Welcome to ${martData.name} — ${branchData.branch_name}`);
          setStep('scan');
        }
      } else {
        toast.error('Invalid store QR code');
      }
      return true;
    }
    return false;
  };

  const handleMartSelect = (martId: string) => {
    const mart = marts.find(m => m.id === martId);
    if (mart) setMartName(mart.name);
    setSelectedMart(martId);
  };

  const handleBranchSelect = async (branchId: string) => {
    if (!selectedMart) return;
    const result = await createSession(selectedMart, branchId);
    if (result) setStep('scan');
  };

  const handleScan = useCallback(async (code: string) => {
    if (!code.trim() || !session) return;
    setBarcode('');
    await lookupAndAddItem(code.trim());
  }, [session, lookupAndAddItem]);

  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  const stableHandleScan = useCallback(async (code: string) => {
    await handleScanRef.current(code);
  }, []);

  const handleUPIPayment = (scheme: string = 'upi://pay') => {
    if (!upiDetails?.pa) {
      toast.error("Payment details not ready");
      return;
    }

    const amount = localTotalAmount.toFixed(2);
    const link = `${scheme}?pa=${encodeURIComponent(upiDetails.pa)}&pn=${encodeURIComponent(upiDetails.pn)}&am=${amount}&cu=INR`;

    // Check if desktop
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
      toast.info("UPI links work best on mobile devices with UPI apps installed.");
    }

    window.location.href = link;
  };

  const handleProceedToPayment = () => setStep('payment');

  const cancelSession = async () => {
    if (!session) return;
    try {
      const itemsQuery = query(
        collection(db, 'cart_items'),
        where('session_id', '==', session.id)
      );
      const itemsSnap = await getDocs(itemsQuery);
      await Promise.all(itemsSnap.docs.map(d => deleteDoc(doc(db, 'cart_items', d.id))));

      await updateDoc(doc(db, 'sessions', session.id), { state: 'CLOSED' });
    } catch (e) {
      console.error(e);
    }
    endSession();
    setMartName('');
    setSelectedMart(null);
    setStep('select-mart');
    setCancelDialogOpen(false);
    toast.success('Cart cancelled');
  };

  const handleLockCart = async (method: PaymentMethod) => {
    await setPaymentMethod(method);
    await lockCart();
    setStep('locked');
  };

  // Razorpay payment
  const initiateRazorpay = async () => {
    if (!session) return;
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/create-razorpay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, amount: localTotalAmount }),
      });
      const data = await res.json();
      if (!res.ok || !data?.order_id) throw new Error(data?.error || 'Failed to create order');

      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay'));
          document.head.appendChild(script);
        });
      }

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: martName || 'eCart',
        description: `Session ${session.session_code}`,
        order_id: data.order_id,
        handler: async (response: any) => {
          const verifyRes = await fetch('/api/verify-razorpay-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              session_id: session.id,
            }),
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData?.success) {
            toast.error('Payment verification failed');
          } else {
            toast.success('Payment successful!');
          }
        },
        prefill: { email: user?.email },
        theme: { color: '#10b981' },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      toast.error(e.message || 'Payment failed');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Generate UPI link from store config or mart settings
  useEffect(() => {
    if (!session || !['ACTIVE', 'LOCKED', 'VERIFIED'].includes(session.state)) return;
    if (session.payment_method !== 'upi_app') return;

    const generateLink = (pa: string, pn: string) => {
      const amount = localTotalAmount.toFixed(2);
      // Standard UPI format: upi://pay?pa=...&pn=...&am=...&cu=INR
      const link = `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${amount}&cu=INR`;
      setUpiLink(link);
      setUpiDetails({ pa, pn });
    };

    const upiConfig = storeConfig.payment_config.upi;
    if (upiConfig?.pa) {
      generateLink(upiConfig.pa, upiConfig.pn || 'Store');
    } else {
      // Fallback to mart table
      getDoc(doc(db, 'marts', session.mart_id))
        .then((docSnap) => {
          const data = docSnap.data();
          if (data?.upi_id) {
            generateLink(data.upi_id, data.merchant_name || data.name || 'Store');
          }
        });
    }
  }, [session?.state, session?.payment_method, session?.mart_id, storeConfig, localTotalAmount]);

  // Camera scanner for product barcodes
  useEffect(() => {
    if (scanMode !== 'camera' || !videoRef.current || step !== 'scan') return;
    let html5QrCode: any;
    const startScanner = async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCode = new Html5Qrcode('barcode-reader');
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 100 } },
          async (decodedText: string) => {
            if (html5QrCode.getState() === 2) { // 2 = scanning
              html5QrCode.pause();
              await stableHandleScan(decodedText);
              // Resume with a slight delay to avoid multi-scans
              setTimeout(() => { try { html5QrCode.resume(); } catch { } }, 1500);
            }
          },
          () => { }
        );
      } catch {
        toast.error('Camera access denied');
        setScanMode('manual');
      }
    };
    startScanner();
    return () => { if (html5QrCode) { try { html5QrCode.stop(); } catch { } } };
  }, [scanMode, stableHandleScan, step]);

  // Camera scanner for store QR selection
  useEffect(() => {
    if (storeScanMode !== 'camera' || step !== 'select-mart' || session) return;
    // Wait for DOM element
    const timer = setTimeout(async () => {
      const el = document.getElementById('store-qr-reader');
      if (!el) return;
      let html5QrCode: any;
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCode = new Html5Qrcode('store-qr-reader');
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText: string) => {
            html5QrCode.pause();
            const handled = await handleStoreQR(decodedText);
            if (!handled) {
              toast.error('Invalid QR format. Expected: store:{id}|branch:{id}');
              setTimeout(() => { try { html5QrCode.resume(); } catch { } }, 2000);
            }
          },
          () => { }
        );
      } catch {
        toast.error('Camera access denied');
        setStoreScanMode('manual');
      }
      // Store cleanup ref
      (el as any).__html5QrCode = html5QrCode;
    }, 100);
    return () => {
      clearTimeout(timer);
      const el = document.getElementById('store-qr-reader');
      if (el && (el as any).__html5QrCode) {
        try { (el as any).__html5QrCode.stop(); } catch { }
      }
    };
  }, [storeScanMode, step, session]);



  // === STEP: Select Mart (with QR scan option) ===
  if (step === 'select-mart' && !session) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">Select Store</h1>
          </div>
        </header>
        <div className="mx-auto max-w-md p-6">
          {/* QR Scan Entry */}
          <div className="mb-6 rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center">
            <QrCode className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-semibold text-foreground mb-2">Scan Store QR Code</p>
            <p className="text-xs text-muted-foreground mb-3">Scan the QR at the store entrance to start</p>

            <div className="flex gap-2 mb-3 justify-center">
              <Button
                variant={storeScanMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStoreScanMode('manual')}
                className={storeScanMode === 'manual' ? 'gradient-primary border-0 text-primary-foreground' : ''}
              >
                <Keyboard className="mr-1.5 h-4 w-4" /> Manual
              </Button>
              <Button
                variant={storeScanMode === 'camera' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStoreScanMode('camera')}
                className={storeScanMode === 'camera' ? 'gradient-primary border-0 text-primary-foreground' : ''}
              >
                <Camera className="mr-1.5 h-4 w-4" /> Camera
              </Button>
            </div>

            {storeScanMode === 'camera' ? (
              <div id="store-qr-reader" className="overflow-hidden rounded-xl mb-3" />
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Paste store QR data..."
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  className="gradient-primary border-0 text-primary-foreground"
                  disabled={!barcode.trim()}
                  onClick={async () => {
                    const handled = await handleStoreQR(barcode.trim());
                    if (!handled) toast.error('Invalid QR format. Expected: store:{id}|branch:{id}');
                    setBarcode('');
                  }}
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or select manually</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="mb-6 flex flex-col items-center gap-3 py-4">
            <Store className="h-12 w-12 text-primary" />
            <p className="text-center text-muted-foreground">Choose a store to start shopping</p>
          </div>
          {marts.length === 0 ? (
            <p className="text-center text-muted-foreground">No stores available yet.</p>
          ) : (
            <div className="space-y-3">
              {marts.map(mart => (
                <motion.button
                  key={mart.id}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                  onClick={() => handleMartSelect(mart.id)}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Store className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{mart.name}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === STEP: Select Branch ===
  if (step === 'select-branch' && !session) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setStep('select-mart'); setSelectedMart(null); }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">Select Branch</h1>
          </div>
        </header>
        <div className="mx-auto max-w-md p-6 space-y-3">
          {branches.map(branch => (
            <motion.button
              key={branch.id}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/50"
              onClick={() => handleBranchSelect(branch.id)}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{branch.branch_name}</p>
                {branch.address && (
                  <p className="text-xs text-muted-foreground">{branch.address}</p>
                )}
                {branch.is_default && (
                  <span className="text-[10px] text-primary uppercase tracking-wider font-semibold">Default branch</span>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  // Helper for digital payment flow
  const isDigital = session?.payment_method === 'upi_app' || session?.payment_method === 'razorpay';
  // === STEP: Locked or Verified — Handle transitions to payment ===
  if (step === 'locked' && (session?.state === 'LOCKED' || session?.state === 'VERIFIED')) {
    const isVerified = session.state === 'VERIFIED';

    // Scenario 1: Cart is verified by cashier (Manual payment confirmation needed)
    if (isVerified) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card rounded-3xl p-8 max-w-sm w-full">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ScanBarcode className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Cart Verified!</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              Your cart has been approved by the cashier.
            </p>
            <p className="font-mono text-2xl font-bold text-primary mb-6">₹{localTotalAmount.toFixed(2)}</p>

            <div className="rounded-xl border border-border bg-muted/30 p-4 mb-6">
              <p className="text-[11px] text-muted-foreground mb-3 text-left leading-relaxed">
                Please pay <strong>₹{localTotalAmount.toFixed(2)}</strong> via {session.payment_method?.replace('_', ' ').toUpperCase()} at the counter. Once finished, tap below:
              </p>
              <Button
                className="w-full gradient-primary border-0 text-primary-foreground py-6 text-base font-bold shadow-md"
                onClick={async () => {
                  setPaymentLoading(true);
                  try {
                    await confirmManualPayment();
                  } finally {
                    setPaymentLoading(false);
                  }
                }}
                disabled={paymentLoading}
              >
                {paymentLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                  "I've Completed Payment"
                )}
              </Button>
            </div>
            
            <p className="animate-pulse text-[10px] text-muted-foreground">Waiting for final confirmation...</p>
          </motion.div>
        </div>
      );
    }

    // Scenario 2: Digital Payment Flow (Razorpay / UPI App)
    if (isDigital) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card rounded-3xl p-8 max-w-sm w-full">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <ShoppingCart className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Ready to Pay!</h2>
            <p className="mb-2 text-sm text-muted-foreground">Complete your digital payment to proceed.</p>
            <p className="font-mono text-2xl font-bold text-primary mb-4">₹{localTotalAmount.toFixed(2)}</p>

            {session.payment_method === 'razorpay' && (
              <Button
                className="w-full gradient-primary border-0 text-primary-foreground py-5 text-base mb-4"
                onClick={() => initiateRazorpay()}
                disabled={paymentLoading}
              >
                {paymentLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                  <><CreditCard className="mr-2 h-5 w-5" /> Pay with Razorpay</>
                )}
              </Button>
            )}

            {session.payment_method === 'upi_app' && (
              <div className="space-y-4 mb-4">
                {upiLink && (
                  <div className="mx-auto flex flex-col items-center">
                    <div className="mb-3 rounded-xl bg-white p-3 shadow-sm border border-border">
                      <QRCodeSVG value={upiLink} size={140} level="H" />
                    </div>
                    {upiDetails && (
                      <div className="mb-2 text-center">
                        <p className="text-sm font-bold text-foreground">{upiDetails.pn}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{upiDetails.pa}</p>
                      </div>
                    )}
                    
                    {/* Individual UPI app buttons */}
                    <div className="grid grid-cols-2 gap-2 w-full mb-3">
                      {UPI_APPS.map(app => (
                        <Button
                          key={app.name}
                          onClick={() => handleUPIPayment(app.scheme)}
                          className="flex items-center justify-center gap-2 rounded-xl h-auto p-2.5 text-white text-xs font-bold border-0 transition-transform hover:scale-[1.02] active:scale-95 shadow-sm"
                          style={{ backgroundColor: app.color }}
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                          {app.abbr}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    After paying in your app, tap below to confirm.
                  </p>
                  <Button
                    className="w-full gradient-primary border-0 text-primary-foreground py-5 text-base font-bold"
                    onClick={async () => {
                      setPaymentLoading(true);
                      try {
                        await confirmManualPayment();
                      } finally {
                        setPaymentLoading(false);
                      }
                    }}
                    disabled={paymentLoading}
                  >
                    {paymentLoading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    ) : (
                      "I've Completed Payment"
                    )}
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary transition-colors"
              onClick={async () => {
                await unlockCart();
                setStep('payment');
              }}
            >
              Change Payment Method
            </Button>
          </motion.div>
        </div>
      );
    }

    // Scenario 3: Counter Payment Flow (Show QR to Cashier)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card rounded-3xl p-8 max-w-sm w-full">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <QrCode className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-foreground">Scan at Counter</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {session.payment_method === 'cash' 
              ? 'Tell the cashier you want to pay by Cash.' 
              : 'Show this QR to the cashier to verify your cart.'}
          </p>
          
          <div className="mx-auto mb-6 flex justify-center rounded-2xl bg-white p-6 shadow-xl border border-border">
            <QRCodeSVG 
              value={`session:${session.id}`} 
              size={180} 
              level="H"
              includeMargin={true}
            />
          </div>

          <div className="mb-6 rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-widest font-bold">Session ID</p>
            <p className="font-mono font-bold text-foreground">{session.session_code}</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-primary transition-colors"
            onClick={async () => {
              await unlockCart();
              setStep('payment');
            }}
          >
            Change Payment Method
          </Button>
        </motion.div>
      </div>
    );
  }

  // === STEP: Done (PAID / CLOSED) ===
  if (step === 'done' || (session && ['PAID', 'CLOSED'].includes(session.state))) {
    const state = session?.state || 'CLOSED';


    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card rounded-3xl p-8 max-w-sm w-full">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ShoppingCart className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-foreground">
            {state === 'PAID' ? 'Payment Complete!' : 'Session Closed'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {state === 'PAID' ? 'Show receipt QR at the exit.' : 'Thank you for shopping!'}
          </p>
          <p className="font-mono text-2xl font-bold text-primary">₹{localTotalAmount.toFixed(2)}</p>
          {state === 'PAID' && session && (
            <div className="mt-4">
              <QRCodeSVG value={`receipt:${session.id}`} size={120} level="H" />
              <p className="mt-2 text-xs text-muted-foreground">Exit receipt QR</p>
            </div>
          )}
          {(state === 'PAID' || state === 'CLOSED') && (
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => navigate('/bills')}>
                <Receipt className="mr-2 h-4 w-4" /> View Invoice
              </Button>
              <Button variant="outline" onClick={() => { endSession(); setStep('select-mart'); }}>
                New Shopping Session
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // === STEP: Payment Method Selection ===
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep('scan')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">Select Payment</h1>
          </div>
        </header>
        <div className="mx-auto max-w-md p-6">
          <div className="mb-6 rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-bold text-primary">₹{localTotalAmount.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{totalQty} items</p>
          </div>
          <div className="space-y-3">
            {paymentOptions.map(opt => (
              <motion.button
                key={opt.value}
                className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/50 transition-colors"
                onClick={() => handleLockCart(opt.value)}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <opt.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="font-medium text-foreground">{opt.label}</span>
                <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // === STEP: Scan & Cart ===
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                {martName || 'Scan & Cart'}
              </h1>
              <p className="text-xs text-muted-foreground font-mono">{session?.session_code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {items.length}/{storeConfig.max_items_per_cart}
            </span>
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary">{items.length}</span>
            </div>
            {session?.state === 'ACTIVE' && (
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setCancelDialogOpen(true)} title="Cancel cart">
                <XCircle className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Scanner */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex gap-2 mb-3">
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
          <form onSubmit={(e) => { e.preventDefault(); handleScan(barcode); }} className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Enter barcode number..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="font-mono text-lg"
              autoFocus
              disabled={session?.state !== 'ACTIVE'}
            />
            <Button type="submit" disabled={loading || !barcode.trim() || session?.state !== 'ACTIVE'} className="gradient-primary border-0 text-primary-foreground">
              {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <ScanBarcode className="h-5 w-5" />}
            </Button>
          </form>
        ) : (
          <div id="barcode-reader" ref={videoRef} className="overflow-hidden rounded-xl" />
        )}
        <p className="mt-2 text-xs text-muted-foreground">Try: 8901138510022, 8904004400250, 8901396315803</p>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">Your cart is empty</p>
            <p className="text-sm text-muted-foreground/70">Scan a barcode to add items</p>
          </div>
        ) : (
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                {item.image_url ? (
                  <img src={item.image_url} alt={item.title} className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.brand || 'Unknown brand'}</p>
                  <p className="text-sm font-bold text-primary">₹{item.price.toFixed(2)}</p>
                </div>
                {session?.state === 'ACTIVE' && (
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.max_stock !== undefined && item.quantity >= item.max_stock}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {item.max_stock !== undefined && (
                      <div className="flex flex-col items-end">
                        {item.quantity >= item.max_stock ? (
                          <span className="text-[10px] font-bold text-destructive flex items-center gap-0.5">
                            <AlertCircle className="h-2.5 w-2.5" /> Stock limit reached
                          </span>
                        ) : item.max_stock < 10 && (
                          <span className="text-[10px] font-medium text-warning-foreground">
                            Only {item.max_stock} units left
                          </span>
                        ) || (
                          <span className="text-[10px] text-muted-foreground">
                            In stock: {item.max_stock}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Bottom bar */}
      {items.length > 0 && session?.state === 'ACTIVE' && (
        <div className="sticky bottom-0 border-t border-border bg-card p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{totalQty} items</span>
            <span className="text-2xl font-bold text-primary">₹{localTotalAmount.toFixed(2)}</span>
          </div>
          <Button className="w-full gradient-primary border-0 text-primary-foreground text-base font-bold py-7 shadow-lg" onClick={handleProceedToPayment}>
            <Lock className="mr-2 h-5 w-5" /> Proceed to Checkout
          </Button>
        </div>
      )}

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this cart? All items will be removed and this action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Shopping</AlertDialogCancel>
            <AlertDialogAction onClick={cancelSession} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CustomerScan;
