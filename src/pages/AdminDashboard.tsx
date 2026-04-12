import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, MapPin, Users, Plus, ArrowLeft, Settings, Trash2, Save,
  BarChart3, TrendingUp, DollarSign, ShoppingCart, Receipt,
  User, Mail, LogOut, QrCode, FileText, Clock, Shield,
  Eye, EyeOff, Globe, CreditCard, Banknote, Smartphone,
  Activity, UserCheck, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import StoreConfigEditor from '@/components/StoreConfigEditor';
import type { StoreConfig } from '@/lib/storeConfig';
import { DEFAULT_STORE_CONFIG } from '@/lib/storeConfig';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db } from '@/integrations/firebase/firebase';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, limit, onSnapshot, orderBy, deleteDoc, writeBatch, setDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Mart {
  id: string; name: string; config: any; upi_id: string | null;
  merchant_name: string | null; customer_pay_from_app: boolean; logo_url: string | null;
}
interface Branch {
  id: string; branch_name: string; inventory_api_url: string | null;
  address: string | null; is_default: boolean;
}
interface Employee {
  id: string; employee_name: string; user_id: string;
  branch_id: string | null; is_active: boolean; email?: string | null;
}
interface SessionRow {
  id: string; session_code: string; state: string; total_amount: number;
  payment_method: string | null; created_at: string; user_id: string;
}
interface AuditLog {
  id: string; action: string; user_id: string | null;
  session_id: string | null; details: any; created_at: string;
}

type Tab = 'overview' | 'employees' | 'store' | 'analytics' | 'integrations' | 'profile';

const STATE_BADGE: Record<string, string> = {
  ACTIVE: 'bg-accent/20 text-accent-foreground',
  LOCKED: 'bg-warning/20 text-warning-foreground',
  VERIFIED: 'bg-primary/20 text-primary',
  PAID: 'bg-primary/20 text-primary',
  CLOSED: 'bg-muted text-muted-foreground',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi_counter: 'UPI Counter',
  upi_app: 'UPI App', razorpay: 'Online',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isToday = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

// ─── Component ───────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, profile: authProfile, updateProfile, signOut } = useAuth();
  const [mart, setMart] = useState<Mart | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allSessions, setAllSessions] = useState<SessionRow[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  // Employee form
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'cashier' | 'exit_guard'>('cashier');

  // Branch form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchUrl, setNewBranchUrl] = useState('');
  const [newBranchAddr, setNewBranchAddr] = useState('');

  // Store details form
  const [storeName, setStoreName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [payFromApp, setPayFromApp] = useState(false);
  const [cartTimeout, setCartTimeout] = useState('30');
  const [maxItems, setMaxItems] = useState('20');

  // Profile
  const [profileName, setProfileName] = useState(authProfile?.display_name || '');
  const [profileAvatar, setProfileAvatar] = useState(authProfile?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // ─── Data Loading ────────────────────────────────────────────────────────
  const fetchMart = useCallback(async () => {
    if (!user) return;
    const martQuery = query(collection(db, 'marts'), where('owner_id', '==', user.uid), limit(1));
    const martSnap = await getDocs(martQuery);
    
    if (!martSnap.empty) {
      const data = { id: martSnap.docs[0].id, ...martSnap.docs[0].data() } as Mart;
      setMart(data);
      setStoreName(data.name);
      setUpiId(data.upi_id || '');
      setMerchantName(data.merchant_name || '');
      setPayFromApp(data.customer_pay_from_app);
      const cfg = data.config && typeof data.config === 'object' ? { ...DEFAULT_STORE_CONFIG, ...(data.config as any) } : DEFAULT_STORE_CONFIG;
      setCartTimeout(String(cfg.cart_timeout_minutes));
      setMaxItems(String(cfg.max_items_per_cart));

      const [branchSnap, empSnap, sessSnap] = await Promise.all([
        getDocs(query(collection(db, 'branches'), where('mart_id', '==', data.id))),
        getDocs(query(collection(db, 'employees'), where('mart_id', '==', data.id))),
        getDocs(query(collection(db, 'sessions'), where('mart_id', '==', data.id), orderBy('created_at', 'desc'))),
      ]);
      setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)));
      
      const rawEmps = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
      // Fetch emails from profiles for each employee
      if (rawEmps.length > 0) {
        const userIds = rawEmps.map(e => e.user_id);
        const profilesQuery = query(collection(db, 'profiles'), where('__name__', 'in', userIds.slice(0, 10))); // Simple workaround, 'in' supports max 10
        // for full mapping we would fetch userIds in chunks of 10. For now assuming < 10 branch employees for simplicity
        try {
          const profilesSnap = await getDocs(profilesQuery);
          const emailMap = new Map(profilesSnap.docs.map(d => [d.id, d.data().email]));
          rawEmps.forEach(e => { e.email = emailMap.get(e.user_id) || null; });
        } catch(e) { console.log(e) }
      }
      setEmployees(rawEmps);
      setAllSessions(sessSnap.docs.map(d => ({ id: d.id, ...d.data() } as SessionRow)));
    } else {
      navigate('/register-mart');
    }
    setLoading(false);
  }, [user, navigate]);

  useEffect(() => { fetchMart(); }, [fetchMart]);

  // Realtime: refresh data when sessions change
  useEffect(() => {
    if (!mart) return;
    const unsub = onSnapshot(query(collection(db, 'sessions'), where('mart_id', '==', mart.id)), () => {
      fetchMart();
    });
    return () => unsub();
  }, [mart?.id, fetchMart]);

  // Load audit logs on demand
  useEffect(() => {
    if (tab !== 'integrations' || !user) return;
    const q = query(collection(db, 'audit_logs'), orderBy('created_at', 'desc'), limit(50));
    getDocs(q).then(snap => setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog))));
  }, [tab, user]);

  // ─── Derived Metrics ─────────────────────────────────────────────────────
  const paidSessions = useMemo(() => allSessions.filter(s => s.state === 'PAID' || s.state === 'CLOSED'), [allSessions]);

  const todaysBills = useMemo(() => paidSessions.filter(s => isToday(s.created_at)), [paidSessions]);
  const todaysRevenue = useMemo(() => todaysBills.reduce((sum, s) => sum + s.total_amount, 0), [todaysBills]);
  const activeSessions = useMemo(() => allSessions.filter(s => s.state === 'ACTIVE' || s.state === 'LOCKED'), [allSessions]);
  const pendingVerifications = useMemo(() => allSessions.filter(s => s.state === 'LOCKED'), [allSessions]);
  const todaysCustomers = useMemo(() => new Set(allSessions.filter(s => isToday(s.created_at)).map(s => s.user_id)).size, [allSessions]);
  const totalRevenue = useMemo(() => paidSessions.reduce((sum, s) => sum + s.total_amount, 0), [paidSessions]);

  const weekRevenue = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return paidSessions.filter(s => new Date(s.created_at) >= weekAgo).reduce((sum, s) => sum + s.total_amount, 0);
  }, [paidSessions]);

  const monthRevenue = useMemo(() => {
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    return paidSessions.filter(s => new Date(s.created_at) >= monthAgo).reduce((sum, s) => sum + s.total_amount, 0);
  }, [paidSessions]);

  const avgBillValue = paidSessions.length > 0 ? totalRevenue / paidSessions.length : 0;

  const revenueByDay = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = 0;
    }
    paidSessions.forEach(s => {
      const key = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (key in days) days[key] += s.total_amount;
    });
    return Object.entries(days).map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }));
  }, [paidSessions]);

  const recentTransactions = useMemo(() => paidSessions.slice(0, 8), [paidSessions]);

  // ─── CRUD ────────────────────────────────────────────────────────────────
  const addBranch = async () => {
    if (!mart || !newBranchName.trim()) return;
    try {
      await addDoc(collection(db, 'branches'), {
        mart_id: mart.id, branch_name: newBranchName.trim(),
        inventory_api_url: newBranchUrl.trim() || null,
        address: newBranchAddr.trim() || null,
        is_default: branches.length === 0,
      });
      toast.success('Branch added');
      setNewBranchName(''); setNewBranchUrl(''); setNewBranchAddr('');
      fetchMart();
    } catch(error: any) { toast.error(error.message); return; }
  };

  const removeBranch = async (id: string) => {
    await deleteDoc(doc(db, 'branches', id));
    setBranches(prev => prev.filter(b => b.id !== id));
    toast.success('Branch removed');
  };

  const addEmployee = async () => {
    if (!mart || !newEmpName.trim() || !newEmpEmail.trim()) return;
    const q = query(collection(db, 'profiles'), where('email', '==', newEmpEmail.trim()), limit(1));
    const profSnap = await getDocs(q);
    if (profSnap.empty) { toast.error('User not found. They must create an account first.'); return; }
    const prof = profSnap.docs[0];
    
    try {
      await addDoc(collection(db, 'employees'), {
        mart_id: mart.id, user_id: prof.id, employee_name: newEmpName.trim(), is_active: true
      });
      // Use setDoc with predictable ID for security rules compatibility
      const role = newEmpRole as any;
      await setDoc(doc(db, 'user_roles', `${prof.id}_${role}`), { 
        user_id: prof.id, 
        role: role,
        assigned_at: new Date().toISOString()
      });
      toast.success(`${newEmpRole === 'exit_guard' ? 'Exit Guard' : 'Cashier'} added`);
      setNewEmpName(''); setNewEmpEmail(''); setNewEmpRole('cashier');
      fetchMart();
    } catch(error: any) { toast.error(error.message); return; }
  };

  const toggleEmployeeActive = async (emp: Employee) => {
    const newActive = !emp.is_active;
    await updateDoc(doc(db, 'employees', emp.id), { is_active: newActive });
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: newActive } : e));
    toast.success(newActive ? 'Employee activated' : 'Employee deactivated');
  };

  const removeEmployee = async (emp: Employee) => {
    await deleteDoc(doc(db, 'employees', emp.id));
    // Remove roles
    const rolesQuery = query(collection(db, 'user_roles'), where('user_id', '==', emp.user_id), where('role', 'in', ['cashier', 'exit_guard']));
    const rolesSnap = await getDocs(rolesQuery);
    const batch = writeBatch(db);
    rolesSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    setEmployees(prev => prev.filter(e => e.id !== emp.id));
    toast.success('Employee removed');
  };

  const saveStoreDetails = async () => {
    if (!mart) return;
    const currentConfig = mart.config && typeof mart.config === 'object'
      ? { ...DEFAULT_STORE_CONFIG, ...(mart.config as any) }
      : DEFAULT_STORE_CONFIG;
    const updatedConfig = {
      ...currentConfig,
      cart_timeout_minutes: parseInt(cartTimeout) || 30,
      max_items_per_cart: parseInt(maxItems) || 20,
    };
    try {
      await updateDoc(doc(db, 'marts', mart.id), {
        name: storeName.trim() || mart.name,
        upi_id: upiId.trim() || null,
        merchant_name: merchantName.trim() || null,
        customer_pay_from_app: payFromApp,
        config: JSON.parse(JSON.stringify(updatedConfig)),
      });
      toast.success('Store details updated');
      fetchMart();
    } catch(error: any) { toast.error(error.message); return; }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
    </div>
  );

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'employees', label: 'Team', icon: Users },
    { key: 'store', label: 'Store', icon: Store },
    { key: 'analytics', label: 'Analytics', icon: TrendingUp },
    { key: 'integrations', label: 'Integrations', icon: Globe },
    { key: 'profile', label: 'Profile', icon: User },
  ];

  const pageVariants = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };

  const storeConfig: StoreConfig = mart?.config && typeof mart.config === 'object'
    ? { ...DEFAULT_STORE_CONFIG, ...(mart.config as any) }
    : DEFAULT_STORE_CONFIG;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{mart?.name || 'Store'}</h1>
            <p className="text-sm text-muted-foreground">Store Management</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Home
            </Button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-2 scrollbar-none">
          {TABS.map(t => (
            <Button key={t.key} variant={tab === t.key ? 'default' : 'ghost'} size="sm"
              className={`shrink-0 ${tab === t.key ? 'gradient-primary border-0 text-primary-foreground' : ''}`}
              onClick={() => setTab(t.key)}>
              <t.icon className="mr-1.5 h-4 w-4" /> {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>

            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            {tab === 'overview' && (
              <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                  {[
                    { icon: Receipt, value: todaysBills.length, label: 'Bills Today', color: 'text-primary' },
                    { icon: DollarSign, value: `₹${todaysRevenue.toLocaleString('en-IN')}`, label: 'Revenue Today', color: 'text-primary' },
                    { icon: Activity, value: activeSessions.length, label: 'Active Sessions', color: 'text-accent-foreground' },
                    { icon: AlertCircle, value: pendingVerifications.length, label: 'Pending Verify', color: 'text-warning-foreground' },
                    { icon: UserCheck, value: todaysCustomers, label: 'Customers Today', color: 'text-primary' },
                  ].map((stat, i) => (
                    <motion.div key={stat.label} className="rounded-xl border border-border bg-card p-5 text-center"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <stat.icon className={`mx-auto mb-2 h-7 w-7 ${stat.color}`} />
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Recent transactions */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Receipt className="h-4 w-4 text-primary" /> Recent Transactions
                    </h3>
                    <span className="text-xs text-muted-foreground">{paidSessions.length} total</span>
                  </div>
                  {recentTransactions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No transactions yet</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {recentTransactions.map((sess, i) => (
                        <motion.div key={sess.id} className="flex items-center justify-between px-4 py-3"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                              <ShoppingCart className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-mono text-sm font-medium text-foreground">{sess.session_code}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(sess.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{PAYMENT_LABELS[sess.payment_method || 'cash']}</span>
                            <span className="font-medium text-foreground">₹{sess.total_amount.toFixed(2)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_BADGE[sess.state] || 'bg-muted text-muted-foreground'}`}>{sess.state}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── EMPLOYEES ────────────────────────────────────────────── */}
            {tab === 'employees' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                    <Users className="h-5 w-5 text-primary" /> Team Members
                  </h2>
                  <span className="text-sm text-muted-foreground">{employees.length} employees</span>
                </div>

                {/* Employee list */}
                {employees.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-muted-foreground">No employees yet. Add your first team member below.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {employees.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${emp.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                            <Users className={`h-5 w-5 ${emp.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div>
                            <p className={`font-medium ${emp.is_active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{emp.employee_name}</p>
                            {emp.email && (
                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" /> {emp.email}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">{emp.is_active ? '● Active' : '○ Inactive'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => toggleEmployeeActive(emp)} title={emp.is_active ? 'Deactivate' : 'Activate'}>
                            {emp.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeEmployee(emp)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add employee form */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-3 font-semibold text-foreground">Add Employee</h3>
                  <p className="mb-3 text-xs text-muted-foreground">The employee must have an eCart account first.</p>
                  <div className="space-y-3">
                    <Input placeholder="Employee name *" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} />
                    <Input placeholder="Employee email *" type="email" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} />
                    <div className="flex gap-2">
                      <Button type="button" variant={newEmpRole === 'cashier' ? 'default' : 'outline'} size="sm"
                        className={newEmpRole === 'cashier' ? 'gradient-primary border-0 text-primary-foreground' : ''}
                        onClick={() => setNewEmpRole('cashier')}>
                        Cashier
                      </Button>
                      <Button type="button" variant={newEmpRole === 'exit_guard' ? 'default' : 'outline'} size="sm"
                        className={newEmpRole === 'exit_guard' ? 'gradient-primary border-0 text-primary-foreground' : ''}
                        onClick={() => setNewEmpRole('exit_guard')}>
                        Exit Guard
                      </Button>
                    </div>
                    <Button onClick={addEmployee} disabled={!newEmpName.trim() || !newEmpEmail.trim()}
                      className="gradient-primary border-0 text-primary-foreground">
                      <Plus className="mr-2 h-4 w-4" /> Add Employee
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── STORE DETAILS ────────────────────────────────────────── */}
            {tab === 'store' && mart && (
              <div className="space-y-6">
                {/* Basic info */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <Store className="h-4 w-4 text-primary" /> Store Information
                  </h3>
                  <div>
                    <Label className="text-xs text-muted-foreground">Store Name</Label>
                    <Input value={storeName} onChange={e => setStoreName(e.target.value)} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">UPI ID</Label>
                      <Input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="store@upi" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Merchant Name</Label>
                      <Input value={merchantName} onChange={e => setMerchantName(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Cart Timeout (min)</Label>
                      <Input type="number" value={cartTimeout} onChange={e => setCartTimeout(e.target.value)} min="5" max="120" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Max Items per Cart</Label>
                      <Input type="number" value={maxItems} onChange={e => setMaxItems(e.target.value)} min="1" max="200" className="mt-1" />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={payFromApp} onChange={e => setPayFromApp(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
                    <span className="text-sm text-foreground">Allow in-app payments</span>
                  </label>
                  <Button onClick={saveStoreDetails} className="gradient-primary border-0 text-primary-foreground">
                    <Save className="mr-2 h-4 w-4" /> Save Details
                  </Button>
                </div>

                {/* Branches */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <MapPin className="h-4 w-4 text-primary" /> Branches
                    </h3>
                    <span className="text-xs text-muted-foreground">{branches.length} branches</span>
                  </div>
                  {branches.map(b => (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{b.branch_name} {b.is_default && <span className="text-xs text-primary">(Default)</span>}</p>
                        {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                        {b.inventory_api_url && <p className="font-mono text-xs text-muted-foreground truncate">{b.inventory_api_url}</p>}
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => removeBranch(b.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs font-semibold text-foreground">Add Branch</p>
                    <Input placeholder="Branch name *" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} />
                    <Input placeholder="Inventory API URL" value={newBranchUrl} onChange={e => setNewBranchUrl(e.target.value)} className="font-mono text-sm" />
                    <Input placeholder="Address" value={newBranchAddr} onChange={e => setNewBranchAddr(e.target.value)} />
                    <Button onClick={addBranch} disabled={!newBranchName.trim()} className="gradient-primary border-0 text-primary-foreground">
                      <Plus className="mr-2 h-4 w-4" /> Add Branch
                    </Button>
                  </div>
                </div>

                {/* Store QR Codes */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <QrCode className="h-4 w-4 text-primary" /> Store Entry QR Codes
                  </h3>
                  <p className="mb-4 text-xs text-muted-foreground">Print and place at store entrance. Customers scan to start shopping.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {branches.map(b => (
                      <div key={b.id} className="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
                        <QRCodeSVG value={`store:${mart.id}|branch:${b.id}`} size={120} level="H" />
                        <p className="text-sm font-medium text-foreground">{b.branch_name}</p>
                        <p className="font-mono text-xs text-muted-foreground break-all">store:{mart.id.slice(0, 8)}…|branch:{b.id.slice(0, 8)}…</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Advanced Config Editor */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
                    <Settings className="h-4 w-4 text-primary" /> Advanced Configuration
                  </h3>
                  <StoreConfigEditor
                    config={storeConfig}
                    onSave={async (newConfig) => {
                      try {
                        await updateDoc(doc(db, 'marts', mart.id), {
                          config: JSON.parse(JSON.stringify(newConfig)),
                          upi_id: newConfig.payment_config.upi?.pa || null,
                          merchant_name: newConfig.payment_config.upi?.pn || null,
                          customer_pay_from_app: newConfig.payment_config.supported_methods.includes('upi_app') || newConfig.payment_config.supported_methods.includes('razorpay'),
                        });
                        fetchMart();
                      } catch(error) { throw error; }
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── ANALYTICS ────────────────────────────────────────────── */}
            {tab === 'analytics' && (
              <div className="space-y-6">
                {/* Key metrics */}
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: 'Bills Today', value: todaysBills.length },
                    { label: 'Revenue Today', value: `₹${todaysRevenue.toLocaleString('en-IN')}` },
                    { label: 'Revenue This Week', value: `₹${weekRevenue.toLocaleString('en-IN')}` },
                    { label: 'Revenue This Month', value: `₹${monthRevenue.toLocaleString('en-IN')}` },
                    { label: 'Avg. Bill Value', value: `₹${avgBillValue.toFixed(2)}` },
                  ].map((m, i) => (
                    <motion.div key={m.label} className="rounded-xl border border-border bg-card p-4 text-center"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{m.value}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Daily revenue chart */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Daily Revenue (Last 7 Days)</h3>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                          formatter={(value: number) => [`₹${value}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Conversion stats */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Sessions</p>
                    <p className="text-xl font-bold text-foreground">{allSessions.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-xl font-bold text-foreground">{paidSessions.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground">Conversion Rate</p>
                    <p className="text-xl font-bold text-foreground">
                      {allSessions.length > 0 ? ((paidSessions.length / allSessions.length) * 100).toFixed(1) : '0'}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── INTEGRATIONS ─────────────────────────────────────────── */}
            {tab === 'integrations' && mart && (
              <div className="space-y-6">
                {/* Inventory API */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <Globe className="h-4 w-4 text-primary" /> Inventory API
                  </h3>
                  {branches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No branches configured.</p>
                  ) : (
                    <div className="space-y-2">
                      {branches.map(b => (
                        <div key={b.id} className="rounded-lg border border-border p-3">
                          <p className="text-sm font-medium text-foreground">{b.branch_name}</p>
                          {b.inventory_api_url ? (
                            <p className="font-mono text-xs text-primary break-all">{b.inventory_api_url}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">Using demo products (no API configured)</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invoice Delivery API */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <FileText className="h-4 w-4 text-primary" /> Invoice Delivery
                  </h3>
                  {storeConfig.invoice_delivery ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{storeConfig.invoice_delivery.method}</span>
                        <span className="font-mono text-xs text-foreground break-all">{storeConfig.invoice_delivery.url || 'Not set'}</span>
                      </div>
                      {storeConfig.invoice_delivery.headers && Object.keys(storeConfig.invoice_delivery.headers).length > 0 && (
                        <div className="rounded-lg bg-muted/50 p-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Headers</p>
                          {Object.entries(storeConfig.invoice_delivery.headers).map(([k, v]) => (
                            <p key={k} className="font-mono text-xs text-foreground">{k}: {v}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Not configured. Enable in Store → Advanced Configuration.</p>
                  )}
                </div>

                {/* Payment Config */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <CreditCard className="h-4 w-4 text-primary" /> Payment Configuration
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {storeConfig.payment_config.supported_methods.map(m => (
                      <span key={m} className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                        {PAYMENT_LABELS[m] || m}
                      </span>
                    ))}
                  </div>
                  {storeConfig.payment_config.upi && (
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">UPI ID: <span className="font-mono text-foreground">{storeConfig.payment_config.upi.pa || '—'}</span></p>
                      <p className="text-xs text-muted-foreground">Payee Name: <span className="text-foreground">{storeConfig.payment_config.upi.pn || '—'}</span></p>
                    </div>
                  )}
                </div>

                {/* Audit logs */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <Shield className="h-4 w-4 text-primary" /> Recent Activity Log
                  </h3>
                  {auditLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No audit entries yet</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {auditLogs.map((log, i) => (
                        <div key={log.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{log.action}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {log.session_id && <p className="text-xs text-muted-foreground font-mono">Session: {log.session_id.slice(0, 8)}…</p>}
                          {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
                            <div className="mt-1 rounded bg-muted/50 p-2">
                              {Object.entries(log.details as Record<string, any>).map(([k, v]) => (
                                <p key={k} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{k}:</span> {String(v)}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PROFILE ──────────────────────────────────────────────── */}
            {tab === 'profile' && (
              <div className="space-y-6 max-w-md mx-auto">
                <div className="flex flex-col items-center gap-3">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-border" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border-2 border-border">
                      <User className="h-10 w-10 text-primary" />
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2"><User className="h-4 w-4" /> My Profile</h3>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Display Name</Label>
                    <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Email</Label>
                    <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" /> {user?.email}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Avatar URL</Label>
                    <Input value={profileAvatar} onChange={e => setProfileAvatar(e.target.value)} placeholder="https://..." className="mt-1" />
                  </div>
                  <Button disabled={savingProfile} className="w-full gradient-primary border-0 text-primary-foreground" onClick={async () => {
                    setSavingProfile(true);
                    const { error } = await updateProfile({ display_name: profileName.trim() || null, avatar_url: profileAvatar.trim() || null });
                    setSavingProfile(false);
                    if (error) toast.error('Failed to save'); else toast.success('Profile updated!');
                  }}>
                    <Save className="mr-2 h-4 w-4" /> Save Profile
                  </Button>
                </div>
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

export default AdminDashboard;