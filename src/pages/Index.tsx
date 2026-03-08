import { motion } from 'framer-motion';
import { ShoppingCart, ScanBarcode, Shield, Zap, ArrowRight, Store, LogIn, LogOut, User, Receipt, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import ecartLogo from '@/assets/ecart-logo.png';

const Index = () => {
  const { user, profile, signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 gradient-primary opacity-[0.03]" />
        <nav className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src={ecartLogo} alt="eCart" className="h-9 w-9" />
            <span className="text-xl font-bold text-foreground">eCart</span>
          </div>
          <div className="flex gap-2 items-center">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  <User className="inline h-4 w-4 mr-1" />
                  {profile?.display_name || 'User'}
                </span>
                {hasRole('cashier') && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/cashier')}>
                      Cashier
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/exit-scan')}>
                      <ShieldCheck className="h-4 w-4 mr-1" /> Exit
                    </Button>
                  </>
                )}
                {hasRole('admin') && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                    Admin
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate('/bills')}>
                  <Receipt className="h-4 w-4 mr-1" /> Bills
                </Button>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
                <ThemeToggle />
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
                <LogIn className="h-4 w-4 mr-1" /> Sign In
              </Button>
              <ThemeToggle />
            )}
          </div>
        </nav>

        <div className="container mx-auto px-6 pb-20 pt-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Zap className="h-3.5 w-3.5" />
              Queue-Less Smart Billing
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Scan. Cart.{' '}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Checkout.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              Skip the queue. Scan items on your phone, build your cart, and get verified at checkout in seconds.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Button
              size="lg"
              className="gradient-primary border-0 px-8 text-base font-semibold text-primary-foreground shadow-lg hover:opacity-90"
              onClick={() => navigate('/scan')}
            >
              <ScanBarcode className="mr-2 h-5 w-5" />
              Start Scanning
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 text-base"
              onClick={() => navigate('/register-mart')}
            >
              <Store className="mr-2 h-5 w-5" />
              Register Your Store
            </Button>
          </motion.div>
        </div>
      </header>

      {/* Features */}
      <section className="border-t border-border bg-card py-20">
        <div className="container mx-auto px-6">
          <h2 className="mb-12 text-center text-2xl font-bold text-foreground">How It Works</h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                icon: ScanBarcode,
                title: 'Scan Items',
                description: 'Use your phone camera to scan barcodes as you shop. Products are instantly added to your cart.',
                step: '01',
              },
              {
                icon: ShoppingCart,
                title: 'Review & Lock Cart',
                description: 'Review your cart, adjust quantities, then lock it to generate a secure checkout QR code.',
                step: '02',
              },
              {
                icon: Shield,
                title: 'Quick Verification',
                description: 'Show your QR at the counter. The cashier verifies your cart and you pay — no rescanning needed.',
                step: '03',
              },
            ].map((feature, idx) => (
              <motion.div
                key={feature.title}
                className="group relative rounded-2xl border border-border bg-background p-8 transition-shadow hover:shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * idx }}
              >
                <div className="mb-4 text-5xl font-black text-primary/10">{feature.step}</div>
                <div className="mb-3 inline-flex rounded-xl bg-primary/10 p-3 text-primary">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>eCart — Smart Self-Scan Billing System</p>
      </footer>
    </div>
  );
};

export default Index;
