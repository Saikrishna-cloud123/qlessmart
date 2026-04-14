import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Store, ArrowLeft, Plus, MapPin, Upload, CheckCircle2, Settings,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/integrations/firebase/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { z } from 'zod';
import { DEFAULT_STORE_CONFIG } from '@/lib/storeConfig';

const martSchema = z.object({
  name: z.string().trim().min(2, 'Store name must be at least 2 characters').max(100, 'Store name too long'),
});

type Step = 'name' | 'branch' | 'config' | 'done';

const RegisterMart = () => {
  const navigate = useNavigate();
  const { user, refreshRoles } = useAuth();
  const [step, setStep] = useState<Step>('name');
  const [loading, setLoading] = useState(false);
  const [martId, setMartId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1
  const [martName, setMartName] = useState('');

  // Step 2: Branch
  const [branchName, setBranchName] = useState('');
  const [branchUrl, setBranchUrl] = useState('');
  const [branchAddr, setBranchAddr] = useState('');
  const [branchQueryParam, setBranchQueryParam] = useState('barcode');

  // Step 3: Config
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [payFromApp, setPayFromApp] = useState(false);
  const [supportedMethods, setSupportedMethods] = useState<string[]>(['cash', 'card', 'upi_counter']);
  const [cartTimeout, setCartTimeout] = useState('30');
  const [maxItems, setMaxItems] = useState('20');

  const toggleMethod = (method: string) => {
    setSupportedMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const createMart = async () => {
    const result = martSchema.safeParse({ name: martName });
    if (!result.success) {
      setErrors({ name: result.error.issues[0].message });
      return;
    }
    setErrors({});
    if (!user) return;
    setLoading(true);

    try {
      const martRef = await addDoc(collection(db, 'marts'), {
        name: result.data.name,
        owner_id: user.uid,
        config: JSON.parse(JSON.stringify(DEFAULT_STORE_CONFIG)),
      });

      setMartId(martRef.id);
      toast.success('Store created!');
      setStep('branch');
    } catch(error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const addBranch = async () => {
    if (!branchName.trim()) {
      setErrors({ branch_name: 'Branch name is required' });
      return;
    }
    setErrors({});
    if (!martId) return;
    setLoading(true);

    try {
      await addDoc(collection(db, 'branches'), {
        mart_id: martId,
        branch_name: branchName.trim(),
        inventory_api_url: branchUrl.trim() || null,
        address: branchAddr.trim() || null,
        is_default: true,
      });

      toast.success('Branch added!');
      setStep('config');
    } catch(error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!martId) return;
    setLoading(true);

    const methods = payFromApp && !supportedMethods.includes('upi_app')
      ? [...supportedMethods, 'upi_app']
      : supportedMethods;

    const config = {
      ...DEFAULT_STORE_CONFIG,
      cart_timeout_minutes: parseInt(cartTimeout) || 30,
      max_items_per_cart: parseInt(maxItems) || 20,
      payment_config: {
        supported_methods: methods,
        ...(upiId.trim() ? {
          upi: {
            pa: upiId.trim(),
            pn: merchantName.trim() || martName,
            currency: 'INR',
            url_format: 'upi://pay?pa={pa}&pn={pn}&am={amount}&cu=INR',
          },
        } : {}),
      },
      security: { cart_hash_algorithm: 'SHA256' as const },
    };

    try {
      await updateDoc(doc(db, 'marts', martId), {
        config: JSON.parse(JSON.stringify(config)),
        upi_id: upiId.trim() || null,
        merchant_name: merchantName.trim() || null,
        customer_pay_from_app: payFromApp,
      });

      toast.success('Configuration saved!');
      setStep('done');
    } catch(error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { key: 'name', label: 'Store' },
    { key: 'branch', label: 'Branch' },
    { key: 'config', label: 'Config' },
    { key: 'done', label: 'Done' },
  ];

  const currentIdx = STEPS.findIndex(s => s.key === step);

  const PAYMENT_METHOD_OPTIONS = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    { value: 'upi_counter', label: 'UPI at Counter' },
    { value: 'upi_app', label: 'UPI via App' },
    { value: 'razorpay', label: 'Online Payment' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Register Your Store</h1>
        </div>
      </header>

      {/* Progress */}
      <div className="mx-auto max-w-lg px-6 pt-6">
        <div className="mb-8 flex items-center justify-between">
          {STEPS.map((s, idx) => (
            <div key={s.key} className="flex items-center">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                idx <= currentIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {idx < currentIdx ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </div>
              <span className={`ml-1.5 text-xs font-medium hidden sm:inline ${
                idx <= currentIdx ? 'text-foreground' : 'text-muted-foreground'
              }`}>{s.label}</span>
              {idx < STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 w-8 sm:w-12 ${
                  idx < currentIdx ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-lg px-6">
        {/* Step 1: Name */}
        {step === 'name' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Store className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">What's your store called?</h2>
              <p className="mt-1 text-sm text-muted-foreground">This will be visible to customers</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createMart(); }}>
              <Input
                placeholder="e.g. Fresh Mart, Daily Needs"
                value={martName}
                onChange={(e) => setMartName(e.target.value)}
                className="mb-1 text-lg"
                autoFocus
                maxLength={100}
              />
              {errors.name && <p className="mb-3 text-xs text-destructive">{errors.name}</p>}
              <Button
                type="submit"
                disabled={loading || !martName.trim()}
                className="mt-4 w-full gradient-primary border-0 text-primary-foreground py-5 text-base"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                  <>Create Store <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></>
                )}
              </Button>
            </form>
          </motion.div>
        )}

        {/* Step 2: Branch */}
        {step === 'branch' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <MapPin className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Add your first branch</h2>
              <p className="mt-1 text-sm text-muted-foreground">You can add more branches later</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addBranch(); }} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Branch name *</label>
                <Input
                  placeholder="e.g. Main Street, Mall of India"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
                {errors.branch_name && <p className="mt-1 text-xs text-destructive">{errors.branch_name}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Inventory API URL</label>
                <Input
                  placeholder="https://api.yourmart.com/products?barcode={barcode}"
                  value={branchUrl}
                  onChange={(e) => setBranchUrl(e.target.value)}
                  className="font-mono text-sm"
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-muted-foreground">Use {'{barcode}'} as placeholder. Leave empty for demo products.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Address</label>
                <Input
                  placeholder="Street address, city"
                  value={branchAddr}
                  onChange={(e) => setBranchAddr(e.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={loading || !branchName.trim()} className="flex-1 gradient-primary border-0 text-primary-foreground py-5 text-base">
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  ) : (
                    <>Add Branch <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></>
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep('config')}>
                  Skip
                </Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Step 3: Config */}
        {step === 'config' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Settings className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Store Configuration</h2>
              <p className="mt-1 text-sm text-muted-foreground">Configure payment, cart limits, and more</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); saveConfig(); }} className="space-y-5">
              {/* Cart settings */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Cart Settings</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Timeout (minutes)</label>
                    <Input type="number" value={cartTimeout} onChange={e => setCartTimeout(e.target.value)} min="5" max="120" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Max items per cart</label>
                    <Input type="number" value={maxItems} onChange={e => setMaxItems(e.target.value)} min="1" max="100" />
                  </div>
                </div>
              </div>

              {/* Payment methods */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Payment Methods</h3>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHOD_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        supportedMethods.includes(opt.value)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground'
                      }`}
                      onClick={() => toggleMethod(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* UPI Config */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">UPI Settings</h3>
                <Input
                  placeholder="UPI ID (e.g. yourstore@upi)"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  maxLength={100}
                />
                <Input
                  placeholder="Merchant Name"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  maxLength={100}
                />
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payFromApp}
                    onChange={(e) => setPayFromApp(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm text-foreground">Allow in-app payments</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={loading} className="flex-1 gradient-primary border-0 text-primary-foreground py-5 text-base">
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep('done')}>
                  Skip
                </Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">You're all set!</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Your store is registered. Head to the admin dashboard to manage branches, employees, and advanced configuration.
            </p>
            <div className="flex flex-col gap-3">
              <Button className="w-full gradient-primary border-0 text-primary-foreground py-5 text-base" onClick={() => navigate('/admin/dashboard')}>
                Go to Admin Dashboard
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default RegisterMart;
