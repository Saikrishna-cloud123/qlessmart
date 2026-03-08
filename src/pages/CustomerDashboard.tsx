import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanBarcode, Receipt, User, Settings, ArrowLeft, LogOut,
  Mail, Save, Camera, ShoppingCart, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { toast } from 'sonner';
import ecartLogo from '@/assets/ecart-logo.png';

type Tab = 'home' | 'settings';

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, updateProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateProfile({
      display_name: displayName.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated!');
    }
  };

  const pageVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={ecartLogo} alt="eCart" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-bold text-foreground">
                Welcome, {profile?.display_name || 'Shopper'}
              </h1>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-lg gap-1 px-4 py-2">
          {([
            { key: 'home' as Tab, label: 'Home', icon: ShoppingCart },
            { key: 'settings' as Tab, label: 'Settings', icon: Settings },
          ]).map(t => (
            <Button
              key={t.key}
              variant={tab === t.key ? 'default' : 'ghost'}
              size="sm"
              className={`flex-1 ${tab === t.key ? 'gradient-primary border-0 text-primary-foreground' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <t.icon className="mr-1.5 h-4 w-4" /> {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-lg p-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>

            {tab === 'home' && (
              <div className="space-y-4">
                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-4">
                  <motion.button
                    className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
                    onClick={() => navigate('/scan')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                      <ScanBarcode className="h-7 w-7 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground">Scan Items</p>
                      <p className="text-xs text-muted-foreground">Start shopping</p>
                    </div>
                  </motion.button>

                  <motion.button
                    className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
                    onClick={() => navigate('/bills')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
                      <Receipt className="h-7 w-7 text-accent-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground">My Bills</p>
                      <p className="text-xs text-muted-foreground">View receipts</p>
                    </div>
                  </motion.button>
                </div>

                {/* Info card */}
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">How it works</h3>
                  </div>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                      Scan barcodes as you shop
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                      Lock your cart and get a QR code
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
                      Show QR at checkout — pay and go!
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="space-y-6">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-border" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border-2 border-border">
                        <User className="h-10 w-10 text-primary" />
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border">
                      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </div>

                {/* Profile form */}
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4" /> Profile
                  </h3>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Display Name</Label>
                    <Input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Email</Label>
                    <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {user?.email}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Avatar URL</Label>
                    <Input
                      value={avatarUrl}
                      onChange={e => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="mt-1"
                    />
                  </div>

                  <Button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="w-full gradient-primary border-0 text-primary-foreground"
                  >
                    {saving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    ) : (
                      <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                    )}
                  </Button>
                </div>

                {/* Danger zone */}
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
                  <h3 className="mb-3 font-semibold text-destructive">Account</h3>
                  <Button variant="destructive" size="sm" onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                  </Button>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CustomerDashboard;
