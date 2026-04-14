import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useNavigate, Navigate } from 'react-router-dom';
import ecartLogo from '@/assets/ecart-logo.png';
import { auth } from '@/integrations/firebase/firebase';

export default function VerifyEmail() {
  const { user, refreshUser, sendVerificationEmail, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  // Redirect if verified
  if (user?.emailVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  // Redirect if not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleRefresh = async () => {
    setLoading(true);
    await refreshUser();
    setLoading(false);
    if (auth.currentUser?.emailVerified) {
      toast.success("Email verified! Welcome aboard.");
    } else {
      toast.info("Still waiting for verification...");
    }
  };

  const handleResend = async () => {
    setResending(true);
    const { error } = await sendVerificationEmail();
    setResending(false);
    if (error) {
      console.error("Firebase Verification Error:", error);
      toast.error(error.message || "Failed to send email");
    } else {
      toast.success("Verification email sent!");
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
            We've sent a verification link to <span className="font-semibold text-foreground">{user.email}</span>
          </p>
        </div>

        <div className="rounded-lg bg-primary/5 p-4 text-sm text-primary">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Please check your inbox (and spam folder) for the verification link. Once clicked, you'll be able to access your dashboard.</p>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            onClick={handleRefresh}
            disabled={loading}
            className="group relative w-full gradient-primary border-0 text-white"
          >
            {loading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
            )}
            I've Verified
          </Button>

          <Button
            variant="outline"
            onClick={handleResend}
            disabled={resending}
            className="w-full"
          >
            {resending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Resend Email
          </Button>

          <div className="pt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out and try another email
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
