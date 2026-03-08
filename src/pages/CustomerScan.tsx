import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanBarcode, Plus, Minus, Trash2, Lock, ShoppingCart, Package, ArrowLeft, Keyboard, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useECartStore } from '@/lib/store';
import { lookupProduct } from '@/lib/products';
import { toast } from 'sonner';

const CustomerScan = () => {
  const navigate = useNavigate();
  const {
    activeSessionId,
    createSession,
    addItem,
    removeItem,
    updateQuantity,
    lockCart,
    getSession,
  } = useECartStore();

  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanMode, setScanMode] = useState<'manual' | 'camera'>('manual');
  const [showQR, setShowQR] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);

  // Create session on mount if none exists
  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  const session = activeSessionId ? getSession(activeSessionId) : undefined;

  const handleScan = useCallback(async (code: string) => {
    if (!code.trim() || !activeSessionId) return;
    setLoading(true);

    try {
      const product = await lookupProduct(code.trim());
      if (product) {
        addItem(activeSessionId, product);
        toast.success(`Added: ${product.title}`);
        setBarcode('');
      } else {
        toast.error('Product not found. Try another barcode.');
      }
    } catch {
      toast.error('Failed to look up product');
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, addItem]);

  const handleLockCart = () => {
    if (!activeSessionId || !session || session.items.length === 0) return;
    lockCart(activeSessionId);
    setShowQR(true);
    toast.success('Cart locked! Show QR to cashier.');
  };

  // Camera scanner setup
  useEffect(() => {
    if (scanMode !== 'camera' || !videoRef.current) return;

    let html5QrCode: any;

    const startScanner = async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      html5QrCode = new Html5Qrcode('barcode-reader');
      scannerRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 100 } },
          (decodedText: string) => {
            handleScan(decodedText);
            // Brief pause after scan
            html5QrCode.pause();
            setTimeout(() => {
              try { html5QrCode.resume(); } catch {}
            }, 2000);
          },
          () => {}
        );
      } catch (err) {
        toast.error('Camera access denied. Use manual entry.');
        setScanMode('manual');
      }
    };

    startScanner();

    return () => {
      if (html5QrCode) {
        try { html5QrCode.stop(); } catch {}
      }
    };
  }, [scanMode, handleScan]);

  if (!session) return null;

  // QR checkout screen
  if (showQR && session.state === 'LOCKED') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-card rounded-3xl p-8"
        >
          <Lock className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="mb-2 text-2xl font-bold text-foreground">Cart Locked</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Show this QR code to the cashier for verification
          </p>
          <div className="mx-auto mb-4 inline-block rounded-2xl bg-background p-4 shadow-inner">
            <QRCodeSVG value={session.id} size={200} level="H" />
          </div>
          <p className="mb-1 font-mono text-sm font-bold text-foreground">{session.id}</p>
          <p className="mb-6 text-xs text-muted-foreground">
            Cart Hash: {session.cartHash} · {session.items.length} items · ₹{session.totalAmount.toFixed(2)}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowQR(false)}>
              View Cart
            </Button>
          </div>
        </motion.div>

        {session.state === 'LOCKED' && (
          <p className="mt-6 animate-pulse text-sm text-muted-foreground">
            Waiting for cashier verification...
          </p>
        )}
      </div>
    );
  }

  // Verified / Paid states
  if (session.state === 'VERIFIED' || session.state === 'PAID') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-card rounded-3xl p-8"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <ShoppingCart className="h-8 w-8 text-success" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-foreground">
            {session.state === 'VERIFIED' ? 'Cart Verified!' : 'Payment Complete!'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {session.state === 'VERIFIED'
              ? `Verified by ${session.verifiedBy}. Please proceed to payment.`
              : 'Thank you for shopping with us!'}
          </p>
          <p className="font-mono text-2xl font-bold text-primary">₹{session.totalAmount.toFixed(2)}</p>
          {session.state === 'PAID' && (
            <Button className="mt-6" onClick={() => { createSession(); setShowQR(false); }}>
              New Shopping Session
            </Button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">Scan & Cart</h1>
              <p className="text-xs text-muted-foreground font-mono">{session.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary">{session.items.length}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Scanner area */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex gap-2 mb-3">
          <Button
            variant={scanMode === 'manual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScanMode('manual')}
            className={scanMode === 'manual' ? 'gradient-primary border-0 text-primary-foreground' : ''}
          >
            <Keyboard className="mr-1.5 h-4 w-4" />
            Manual
          </Button>
          <Button
            variant={scanMode === 'camera' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScanMode('camera')}
            className={scanMode === 'camera' ? 'gradient-primary border-0 text-primary-foreground' : ''}
          >
            <Camera className="mr-1.5 h-4 w-4" />
            Camera
          </Button>
        </div>

        {scanMode === 'manual' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScan(barcode);
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              placeholder="Enter barcode number..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="font-mono text-lg"
              autoFocus
            />
            <Button
              type="submit"
              disabled={loading || !barcode.trim()}
              className="gradient-primary border-0 text-primary-foreground"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              ) : (
                <ScanBarcode className="h-5 w-5" />
              )}
            </Button>
          </form>
        ) : (
          <div
            id="barcode-reader"
            ref={videoRef}
            className="overflow-hidden rounded-xl"
          />
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Try: 8901138510022, 8904004400250, 8901396315803
        </p>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-auto p-4">
        {session.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">Your cart is empty</p>
            <p className="text-sm text-muted-foreground/70">Scan a barcode to add items</p>
          </div>
        ) : (
          <AnimatePresence>
            {session.items.map((item) => (
              <motion.div
                key={item.product.barcode}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                {item.product.image ? (
                  <img
                    src={item.product.image}
                    alt={item.product.title}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.product.title}</p>
                  <p className="text-xs text-muted-foreground">{item.product.brand || 'Unknown brand'}</p>
                  <p className="text-sm font-bold text-primary">₹{item.product.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(activeSessionId!, item.product.barcode, item.quantity - 1)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(activeSessionId!, item.product.barcode, item.quantity + 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeItem(activeSessionId!, item.product.barcode)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Bottom bar */}
      {session.items.length > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {session.items.reduce((s, i) => s + i.quantity, 0)} items
            </span>
            <span className="text-xl font-bold text-foreground">₹{session.totalAmount.toFixed(2)}</span>
          </div>
          <Button
            className="w-full gradient-primary border-0 text-primary-foreground text-base font-semibold py-6"
            onClick={handleLockCart}
          >
            <Lock className="mr-2 h-5 w-5" />
            Lock Cart & Generate QR
          </Button>
        </div>
      )}
    </div>
  );
};

export default CustomerScan;
