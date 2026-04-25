import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useNavigate, Navigate } from 'react-router-dom';
import ecartLogo from '@/assets/ecart-logo.png';
import { auth } from '@/integrations/firebase/firebase';
import emailjs from '@emailjs/browser';

export default function VerifyEmail() {
  const { user, refreshUser, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(60);
  const navigate = useNavigate();

  // Timer for resend button
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Redirect if verified
  if (user?.emailVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect if not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ otp })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      toast.success("Email verified! Welcome aboard.");
      await refreshUser(); // This will trigger re-evaluation of user status and profile creation
    } catch (error: any) {
      console.error("OTP Verification Error:", error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!user) return;
    setResending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generate-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ email: user.email, displayName: user.displayName || 'Shopper' })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resend OTP');
      }

      // Send OTP email from browser via EmailJS
      const { otp, expiresAt } = await res.json();
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_VERIFY_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (serviceId && templateId && publicKey) {
        await emailjs.send(serviceId, templateId, {
          to_email: user.email,
          to_name: user.displayName || 'Shopper',
          passcode: otp,
          time: new Date(expiresAt).toLocaleTimeString(),
          reply_to: 'no-reply@qlessmart.com',
        }, publicKey);
      }

      toast.success("New OTP sent to your email!");
      setCountdown(60);
    } catch (error: any) {
      console.error("Resend OTP Error:", error);
      toast.error(error.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-xl"
      >
        <div className="flex flex-col items-center text-center">
          <img src={ecartLogo} alt="eCart" className="mb-4 h-16 w-16" />
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Verify your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a 6-digit verification code to <span className="font-semibold text-foreground">{user.email}</span>
          </p>
        </div>

        <div className="rounded-lg bg-primary/5 p-4 text-sm text-primary">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Please check your inbox (and spam folder) for the OTP code. Enter it below to access your dashboard.</p>
          </div>
        </div>

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <Input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-widest"
              maxLength={6}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="group relative w-full gradient-primary border-0 text-white"
          >
            {loading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
            )}
            Verify OTP
          </Button>

          <div className="pt-2 text-center text-sm">
            <span className="text-muted-foreground">Didn't receive the code? </span>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={countdown > 0 || resending}
              className={`font-medium ${countdown > 0 || resending ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:underline'}`}
            >
              {resending ? 'Sending...' : countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
            </button>
          </div>

          <div className="pt-4 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out and try another email
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
