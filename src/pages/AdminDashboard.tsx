import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, MapPin, Users, Plus, ArrowLeft, Settings, Trash2, Save,
  BarChart3, TrendingUp, DollarSign, ShoppingCart, Receipt, Package,
  User, Mail, LogOut, QrCode, FileText, Clock, Shield,
  Eye, EyeOff, Globe, CreditCard, Banknote, Smartphone,
  Activity, UserCheck, AlertCircle, ChevronDown, ChevronUp, Pencil, X,
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
  role?: string;
}
interface SessionRow {
  id: string; session_code: string; state: string; total_amount: number;
  payment_method: string | null; created_at: string; user_id: string;
}
interface InvoiceRow {
  id: string; invoice_number: string; total_amount: number;
  total_quantity: number; payment_method: string | null;
  created_at: string; user_id: string; session_id: string;
  customer_name?: string; cashier_name?: string; cashier_id?: string;
}
interface AuditLog {
  id: string; action: string; user_id: string | null;
  session_id: string | null; details: any; created_at: string;
}

type Tab = 'overview' | 'employees' | 'store' | 'inventory' | 'analytics' | 'integrations' | 'profile';

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
  const [allInvoices, setAllInvoices] = useState<InvoiceRow[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Employee form
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'cashier' | 'exit_guard'>('cashier');

  // Branch form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchUrl, setNewBranchUrl] = useState('');
  const [newBranchAddr, setNewBranchAddr] = useState('');

  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchUrl, setEditBranchUrl] = useState('');
  const [editBranchAddr, setEditBranchAddr] = useState('');

  // Store details form
  const [storeName, setStoreName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [payFromApp, setPayFromApp] = useState(false);
  const [cartTimeout, setCartTimeout] = useState('30');
  const [maxItems, setMaxItems] = useState('20');

  // Inventory form
  const [products, setProducts] = useState<any[]>([]);
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdTitle, setNewProdTitle] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('');
  const [newProdStock, setNewProdStock] = useState('100');
  const [newProdBranch, setNewProdBranch] = useState('');
  const [inventoryBranchFilter, setInventoryBranchFilter] = useState('all');

  // Profile
  const [profileName, setProfileName] = useState(authProfile?.display_name || '');
  const [profileAvatar, setProfileAvatar] = useState(authProfile?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // ─── Data Loading ────────────────────────────────────────────────────────
  const fetchMart = useCallback(async () => {
    if (!user) return;
    try {
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

        // Use Promise.allSettled to ensure one failing query doesn't crash the whole dashboard
        const [branchRes, empRes, sessRes] = await Promise.allSettled([
          getDocs(query(collection(db, 'branches'), where('mart_id', '==', data.id))),
          getDocs(query(collection(db, 'employees'), where('mart_id', '==', data.id))),
          // Try with orderBy first; fallback without it if composite index is missing
          getDocs(query(collection(db, 'sessions'), where('mart_id', '==', data.id), orderBy('created_at', 'desc')))
            .catch(() => getDocs(query(collection(db, 'sessions'), where('mart_id', '==', data.id)))),
        ]);

        if (branchRes.status === 'fulfilled') {
          setBranches(branchRes.value.docs.map(d => ({ id: d.id, ...d.data() } as Branch)));
        }

        if (empRes.status === 'fulfilled') {
          // The email and role are now stored directly in the employee document
          const rawEmps = empRes.value.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
          setEmployees(rawEmps);
        }

        if (sessRes.status === 'fulfilled') {
          const sessData = sessRes.value.docs.map(d => ({ id: d.id, ...d.data() } as SessionRow));
          // Sort client-side as a safety net
          sessData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setAllSessions(sessData);
        } else {
          console.error("Sessions fetch failed:", sessRes.reason);
        }
      } else {
        navigate('/register-mart');
      }
    } catch (error: any) {
      console.error("Dashboard Load Error:", error);
      toast.error("Failed to load dashboard data. Check yours indexes or connection.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, navigate]);

  useEffect(() => { fetchMart(); }, [fetchMart]);

  // Realtime: refresh sessions
  useEffect(() => {
    if (!mart) return;
    const unsub = onSnapshot(
      query(collection(db, 'sessions'), where('mart_id', '==', mart.id)),
      (snap) => {
        const sessData = snap.docs.map(d => ({ id: d.id, ...d.data() } as SessionRow));
        sessData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllSessions(sessData);
      }
    );
    return () => unsub();
  }, [mart?.id]);

  // Realtime: refresh invoices
  useEffect(() => {
    if (!mart) return;
    const unsub = onSnapshot(
      query(collection(db, 'invoices'), where('mart_id', '==', mart.id)),
      (snap) => {
        const invData = snap.docs.map(d => ({ id: d.id, ...d.data() } as InvoiceRow));
        invData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllInvoices(invData);
      }
    );
    return () => unsub();
  }, [mart?.id]);

  // Load audit logs on demand
  useEffect(() => {
    if (tab !== 'integrations' || !user) return;
    const q = query(collection(db, 'audit_logs'), orderBy('created_at', 'desc'), limit(50));
    getDocs(q).then(snap => setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog))));
  }, [tab, user]);

  // Realtime products
  useEffect(() => {
    if (tab !== 'inventory' || !user) return;
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [tab, user]);

  // ─── Derived Metrics (from Sessions) ────────────────────────────────────
  const paidSessions = useMemo(() => allSessions.filter(s => s.state === 'PAID' || s.state === 'CLOSED'), [allSessions]);
  const activeSessions = useMemo(() => allSessions.filter(s => s.state === 'ACTIVE' || s.state === 'LOCKED' || s.state === 'VERIFIED'), [allSessions]);
  const pendingVerifications = useMemo(() => allSessions.filter(s => s.state === 'LOCKED' || s.state === 'VERIFIED'), [allSessions]);
  const todaysCustomers = useMemo(() => new Set(allSessions.filter(s => isToday(s.created_at)).map(s => s.user_id)).size, [allSessions]);

  // ─── Derived Metrics (from Invoices — the real source of truth) ────────
  const todaysInvoices = useMemo(() => allInvoices.filter(inv => isToday(inv.created_at)), [allInvoices]);
  const todaysRevenue = useMemo(() => todaysInvoices.reduce((sum, inv) => sum + inv.total_amount, 0), [todaysInvoices]);
  const totalRevenue = useMemo(() => allInvoices.reduce((sum, inv) => sum + inv.total_amount, 0), [allInvoices]);

  const weekRevenue = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    return allInvoices.filter(inv => new Date(inv.created_at) >= weekAgo).reduce((sum, inv) => sum + inv.total_amount, 0);
  }, [allInvoices]);

  const monthRevenue = useMemo(() => {
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    return allInvoices.filter(inv => new Date(inv.created_at) >= monthAgo).reduce((sum, inv) => sum + inv.total_amount, 0);
  }, [allInvoices]);

  const avgBillValue = allInvoices.length > 0 ? totalRevenue / allInvoices.length : 0;
  const todaysItems = useMemo(() => todaysInvoices.reduce((sum, inv) => sum + inv.total_quantity, 0), [todaysInvoices]);

  // Payment method breakdown from invoices
  const paymentMethodBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; amount: number }> = {};
    allInvoices.forEach(inv => {
      const method = inv.payment_method || 'cash';
      if (!breakdown[method]) breakdown[method] = { count: 0, amount: 0 };
      breakdown[method].count++;
      breakdown[method].amount += inv.total_amount;
    });
    return Object.entries(breakdown)
      .map(([method, data]) => ({ method, label: PAYMENT_LABELS[method] || method, ...data }))
      .sort((a, b) => b.amount - a.amount);
  }, [allInvoices]);

  const revenueByDay = useMemo(() => {
    const days: Record<string, { revenue: number; bills: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = { revenue: 0, bills: 0 };
    }
    allInvoices.forEach(inv => {
      const key = new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (key in days) {
        days[key].revenue += inv.total_amount;
        days[key].bills++;
      }
    });
    return Object.entries(days).map(([name, data]) => ({ name, revenue: Math.round(data.revenue * 100) / 100, bills: data.bills }));
  }, [allInvoices]);

  const recentTransactions = useMemo(() => allInvoices.slice(0, 8), [allInvoices]);

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
    } catch (error: any) { toast.error(error.message); return; }
  };

  const removeBranch = async (id: string) => {
    await deleteDoc(doc(db, 'branches', id));
    setBranches(prev => prev.filter(b => b.id !== id));
    toast.success('Branch removed');
  };

  const startEditBranch = (b: Branch) => {
    setEditingBranchId(b.id);
    setEditBranchName(b.branch_name || '');
    setEditBranchUrl(b.inventory_api_url || '');
    setEditBranchAddr(b.address || '');
  };

  const saveEditBranch = async () => {
    if (!editingBranchId || !editBranchName.trim()) return;
    try {
      await updateDoc(doc(db, 'branches', editingBranchId), {
        branch_name: editBranchName.trim(),
        inventory_api_url: editBranchUrl.trim() || null,
        address: editBranchAddr.trim() || null,
      });
      toast.success('Branch updated');
      setEditingBranchId(null);
      fetchMart();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const cancelEditBranch = () => {
    setEditingBranchId(null);
  };

  const addEmployee = async () => {
    if (!mart || !newEmpName.trim() || !newEmpEmail.trim()) return;

    try {
      // Save employee with email and role in the employees collection
      // The sync-user-roles API will assign the actual role when this user logs in
      await addDoc(collection(db, 'employees'), {
        mart_id: mart.id,
        employee_name: newEmpName.trim(),
        email: newEmpEmail.trim().toLowerCase(),
        role: newEmpRole,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      toast.success(`${newEmpRole === 'exit_guard' ? 'Exit Guard' : 'Cashier'} added. They will be assigned their role on next login.`);
      setNewEmpName(''); setNewEmpEmail(''); setNewEmpRole('cashier');
      fetchMart();
    } catch (error: any) { toast.error(error.message); return; }
  };

  const toggleEmployeeActive = async (emp: Employee) => {
    const newActive = !emp.is_active;
    await updateDoc(doc(db, 'employees', emp.id), { is_active: newActive });
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: newActive } : e));
    toast.success(newActive ? 'Employee activated' : 'Employee deactivated');
  };

  const removeEmployee = async (emp: Employee) => {
    try {
      await deleteDoc(doc(db, 'employees', emp.id));

      // If the user has already logged in and has a user_id, remove their specialized roles
      if (emp.user_id) {
        const rolesQuery = query(
          collection(db, 'user_roles'),
          where('user_id', '==', emp.user_id),
          where('role', 'in', ['cashier', 'exit_guard'])
        );
        const rolesSnap = await getDocs(rolesQuery);
        const batch = writeBatch(db);
        rolesSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setEmployees(prev => prev.filter(e => e.id !== emp.id));
      toast.success('Employee removed');
    } catch (error: any) {
      toast.error("Error removing employee: " + error.message);
    }
  };

  const addProduct = async () => {
    if (!newProdBarcode.trim() || !newProdTitle.trim() || !newProdPrice.trim()) {
      toast.error('Barcode, title, and price are required');
      return;
    }
    try {
      const docId = newProdBranch ? `${newProdBranch}_${newProdBarcode.trim()}` : newProdBarcode.trim();
      await setDoc(doc(db, 'products', docId), {
        barcode: newProdBarcode.trim(),
        title: newProdTitle.trim(),
        price: parseFloat(newProdPrice),
        brand: newProdBrand.trim() || null,
        category: newProdCategory.trim() || null,
        stock: parseInt(newProdStock, 10) || 0,
        added_at: new Date().toISOString(),
        branch_id: newProdBranch || null
      });
      toast.success('Product added successfully!');
      setNewProdBarcode('');
      setNewProdTitle('');
      setNewProdPrice('');
      setNewProdBrand('');
      setNewProdCategory('');
      setNewProdStock('100');
      setNewProdBranch('');
    } catch (e: any) {
      toast.error(`Error adding product: ${e.message}`);
    }
  };

  const removeProduct = async (barcode: string) => {
    try {
      await deleteDoc(doc(db, 'products', barcode));
      toast.success('Product deleted');
    } catch (e: any) {
      toast.error(`Error deleting product: ${e.message}`);
    }
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
    } catch (error: any) { toast.error(error.message); return; }
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
    { key: 'inventory', label: 'Inventory', icon: Package },
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
                    { icon: Receipt, value: todaysInvoices.length, label: 'Bills Today', color: 'text-primary' },
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

                {/* Quick Stats Row */}
                <div className="grid gap-4 grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Items Sold Today</p>
                    <p className="text-xl font-bold text-foreground">{todaysItems}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">All-Time Invoices</p>
                    <p className="text-xl font-bold text-foreground">{allInvoices.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Avg. Bill Value</p>
                    <p className="text-xl font-bold text-foreground">₹{avgBillValue.toFixed(0)}</p>
                  </div>
                </div>

                {/* Payment Method Breakdown */}
                {paymentMethodBreakdown.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                      <CreditCard className="h-4 w-4 text-primary" /> Payment Methods
                    </h3>
                    <div className="space-y-2">
                      {paymentMethodBreakdown.map(pm => (
                        <div key={pm.method} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{pm.label}</span>
                            <span className="text-xs text-muted-foreground">{pm.count} transactions</span>
                          </div>
                          <span className="font-medium text-foreground">₹{pm.amount.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent transactions (from invoices) */}
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Receipt className="h-4 w-4 text-primary" /> Recent Invoices
                    </h3>
                    <span className="text-xs text-muted-foreground">{allInvoices.length} total</span>
                  </div>
                  {recentTransactions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No invoices yet. Complete a shopping session to see data here.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {recentTransactions.map((inv, i) => (
                        <motion.div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-4 gap-3"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{inv.customer_name || `Customer (${inv.user_id.slice(0, 5)})`}</p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span className="font-mono">{inv.invoice_number}</span>
                                <span>·</span>
                                <span>{new Date(inv.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                {inv.cashier_name && (
                                  <>
                                    <span>·</span>
                                    <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {inv.cashier_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-4">
                            <div className="text-right">
                              <p className="font-bold text-foreground">₹{inv.total_amount.toFixed(2)}</p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{inv.total_quantity} items</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${inv.payment_method?.toLowerCase().includes('upi') ? 'bg-blue-500/10 text-blue-500' :
                                  inv.payment_method?.toLowerCase().includes('cash') ? 'bg-green-500/10 text-green-500' :
                                    'bg-orange-500/10 text-orange-500'
                                }`}>
                                {PAYMENT_LABELS[inv.payment_method || 'cash']}
                              </span>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">PAID</span>
                            </div>
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
                            <div className="flex flex-wrap items-center gap-2">
                              {emp.role && (
                                <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                                  {emp.role.replace('_', ' ')}
                                </span>
                              )}
                              {emp.email && (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" /> {emp.email}
                                </p>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">{emp.is_active ? '● Active' : '○ Inactive'}</p>
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
                    <div key={b.id} className="rounded-lg border border-border p-3">
                      {editingBranchId === b.id ? (
                        <div className="space-y-3">
                          <Input placeholder="Branch name *" value={editBranchName} onChange={e => setEditBranchName(e.target.value)} />
                          <Input placeholder="Inventory API URL" value={editBranchUrl} onChange={e => setEditBranchUrl(e.target.value)} className="font-mono text-sm" />
                          <Input placeholder="Address" value={editBranchAddr} onChange={e => setEditBranchAddr(e.target.value)} />
                          <div className="flex items-center gap-2 pt-2">
                            <Button size="sm" onClick={saveEditBranch} disabled={!editBranchName.trim()} className="gradient-primary border-0 text-primary-foreground">
                              <Save className="mr-2 h-4 w-4" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditBranch}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{b.branch_name} {b.is_default && <span className="text-xs text-primary">(Default)</span>}</p>
                            {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                            {b.inventory_api_url && <p className="font-mono text-xs text-muted-foreground truncate">{b.inventory_api_url}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => startEditBranch(b)} title="Edit Branch">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeBranch(b.id)} title="Delete Branch">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
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

                {/* Advanced Config */}
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
                      } catch (error) { throw error; }
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── INVENTORY ───────────────────────────────────────────── */}
            {tab === 'inventory' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <Package className="h-4 w-4 text-primary" /> Add New Product
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Barcode *</Label>
                      <Input placeholder="e.g. 89012345678" value={newProdBarcode} onChange={e => setNewProdBarcode(e.target.value)} className="mt-1" />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Product Title *</Label>
                      <Input placeholder="e.g. Coca Cola 2L" value={newProdTitle} onChange={e => setNewProdTitle(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Price (₹) *</Label>
                      <Input type="number" placeholder="₹" value={newProdPrice} onChange={e => setNewProdPrice(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Stock Available</Label>
                      <Input type="number" value={newProdStock} onChange={e => setNewProdStock(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Category</Label>
                      <Input placeholder="e.g. Beverages" value={newProdCategory} onChange={e => setNewProdCategory(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Brand</Label>
                      <Input placeholder="e.g. Coca Cola" value={newProdBrand} onChange={e => setNewProdBrand(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Store Branch</Label>
                      <select
                        value={newProdBranch}
                        onChange={e => setNewProdBranch(e.target.value)}
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">All Branches (Default)</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.branch_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Button onClick={addProduct} disabled={!newProdBarcode || !newProdTitle || !newProdPrice} className="w-full sm:w-auto gradient-primary border-0 text-primary-foreground">
                    <Plus className="mr-2 h-4 w-4" /> Add Product
                  </Button>
                </div>

                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border px-4 py-3 gap-3">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <Package className="h-4 w-4 text-primary" /> Current Inventory
                    </h3>
                    <div className="flex items-center gap-3">
                      <select
                        value={inventoryBranchFilter}
                        onChange={e => setInventoryBranchFilter(e.target.value)}
                        className="flex h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="all">All Branches</option>
                        <option value="unassigned">No Branch (Global)</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.branch_name}</option>
                        ))}
                      </select>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                        {products.filter(p =>
                          inventoryBranchFilter === 'all' ? true :
                            inventoryBranchFilter === 'unassigned' ? !p.branch_id :
                              p.branch_id === inventoryBranchFilter
                        ).length} Items
                      </span>
                    </div>
                  </div>
                  {products.filter(p =>
                    inventoryBranchFilter === 'all' ? true :
                      inventoryBranchFilter === 'unassigned' ? !p.branch_id :
                        p.branch_id === inventoryBranchFilter
                  ).length === 0 ? (
                    <div className="p-8 text-center">
                      <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No products found for the selected branch.</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Hint: Scanning unknown barcodes drops fallback demo items into the cart.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 font-medium">Barcode</th>
                            <th className="px-4 py-2 font-medium">Item Name</th>
                            <th className="px-4 py-2 font-medium">Branch</th>
                            <th className="px-4 py-2 font-medium">Price</th>
                            <th className="px-4 py-2 font-medium">Stock</th>
                            <th className="px-4 py-2 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {products.filter(p =>
                            inventoryBranchFilter === 'all' ? true :
                              inventoryBranchFilter === 'unassigned' ? !p.branch_id :
                                p.branch_id === inventoryBranchFilter
                          ).map(p => (
                            <tr key={p.id} className="transition-colors hover:bg-muted/50">
                              <td className="px-4 py-3 font-mono text-xs">{p.barcode || p.id}</td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-foreground">{p.title}</p>
                                {p.brand && <p className="text-xs text-muted-foreground">{p.brand} {p.category && `• ${p.category}`}</p>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground">
                                  {p.branch_id ? branches.find(b => b.id === p.branch_id)?.branch_name || 'Unknown' : 'Global'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-foreground">₹{p.price?.toFixed(2)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.stock < 10 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                                  {p.stock} units
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeProduct(p.id)} title="Delete product">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ANALYTICS ────────────────────────────────────────────── */}
            {tab === 'analytics' && (
              <div className="space-y-6">
                {/* Key metrics */}
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: 'Bills Today', value: todaysInvoices.length },
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
                          formatter={(value: number, name: string) => {
                            if (name === 'revenue') return [`₹${value}`, 'Revenue'];
                            return [value, 'Bills'];
                          }}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Payment method breakdown */}
                {paymentMethodBreakdown.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                      <CreditCard className="h-4 w-4 text-primary" /> Revenue by Payment Method
                    </h3>
                    <div className="space-y-3">
                      {paymentMethodBreakdown.map(pm => {
                        const pct = totalRevenue > 0 ? ((pm.amount / totalRevenue) * 100).toFixed(1) : '0';
                        return (
                          <div key={pm.method}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">{pm.label}</span>
                              <span className="text-sm text-muted-foreground">{pm.count} bills · ₹{pm.amount.toLocaleString('en-IN')} ({pct}%)</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Conversion stats */}
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Sessions</p>
                    <p className="text-xl font-bold text-foreground">{allSessions.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-xl font-bold text-foreground">{paidSessions.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Invoices</p>
                    <p className="text-xl font-bold text-foreground">{allInvoices.length}</p>
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