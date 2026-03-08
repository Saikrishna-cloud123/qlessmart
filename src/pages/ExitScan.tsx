import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, ShieldCheck, ShieldX, ArrowLeft, ScanBarcode,
  Keyboard, Camera, CheckCircle2, XCircle, Package, User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface SessionData {
  id: string;
  session_code: string;
  state: string;
  total_amount: number;
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
  const [customerName, setCustomerName] = useState('');
  const [verifyResult, setVerifyResult] = useState<'valid' | 'invalid' | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);

  // Get employee's branch
  const [employeeBranchId, setEmployeeBranchId] = useState<string | null>(null);
  const [employeeMartId, setEmployeeMartId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('employees').select('mart_id, branch_id').eq('user_id', user.id).eq('is_active', true).limit(1).single()
      .then(({ data }) => {
        if (data) {
          setEmployeeMartId(data.mart_id);
          setEmployeeBranchId(data.branch_id);
        }
      });
  }, [user]);

  const handleScan = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setVerifyResult(null);

    // Parse receipt QR - format is "receipt:<session_id>"
    const sessionId = code.replace('receipt:', '').trim();

    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!data || error) {
      setVerifyResult('invalid');
      toast.error('Session not found');
      setLoading(false);
      return;
    }

    const sess = data as SessionData;
    setSession(sess);

    // Verify conditions
    if (sess.state !== 'PAID') {
      setVerifyResult('invalid');
      toast.error(`Invalid: Session state is ${sess.state}`);
      setLoading(false);
      return;
    }

    // Get customer name
    const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', sess.user_id).single();
    setCustomerName(prof?.display_name || 'Customer');

    setVerifyResult('valid');
    setLoading(false);
  };

  const closeSession = async () => {
    if (!session || !user) return;
    setLoading(true);
    
    const { error } = await supabase
      .from('sessions')
      .update({ state: 'CLOSED' as any })
      .eq('id', session.id)
      .eq('state', 'PAID' as any);

    if (error) {
      toast.error('Failed to close session');
      setLoading(false);
      return;
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      action: 'EXIT_VALIDATED',
      user_id: user.id,
      session_id: session.id,
      details: { verified_by: user.id, branch_id: employeeBranchId },
    });

    toast.success('Exit validated! Customer may leave.');
    setSession(null);
    setVerifyResult(null);
    setScanInput('');
    setLoading(false);
  };

  // Camera scanner
  useEffect(() => {
    if (scanMode !== 'camera' || !videoRef.current) return;
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
  }, [scanMode]);

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
              <p className="text-sm text-muted-foreground">Scan customer receipt QR</p>
            </div>
          </div>
          <Shield className="h-6 w-6 text-primary" />
        </div>
      </header>

      <div className="mx-auto max-w-md p-6">
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

        {/* Result */}
        {verifyResult === 'valid' && session && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 text-center"
          >
            <ShieldCheck className="mx-auto mb-3 h-16 w-16 text-primary" />
            <h2 className="mb-1 text-2xl font-bold text-foreground">Valid Receipt</h2>
            <div className="mb-4 space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center justify-center gap-2">
                <User className="h-4 w-4" />
                <span>{customerName}</span>
              </div>
              <p className="font-mono text-xs">{session.session_code}</p>
              <p className="text-lg font-bold text-primary">₹{session.total_amount.toFixed(2)}</p>
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

        {!verifyResult && !loading && (
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
