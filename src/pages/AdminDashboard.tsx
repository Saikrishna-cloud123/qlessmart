import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, MapPin, Users, Plus, ArrowLeft, Settings, Trash2, Save,
  BarChart3, History, TrendingUp, DollarSign, ShoppingCart, Calendar,
  FileText, Package, Upload, Search, Edit2, Check, X,
  User, Mail, Camera, LogOut,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface Mart { id: string; name: string; config: any; upi_id: string | null; merchant_name: string | null; customer_pay_from_app: boolean; logo_url: string | null; }
interface Branch { id: string; branch_name: string; inventory_api_url: string | null; address: string | null; is_default: boolean; }
interface Employee { id: string; employee_name: string; user_id: string; branch_id: string | null; is_active: boolean; }
interface SessionRow { id: string; session_code: string; state: string; total_amount: number; payment_method: string | null; created_at: string; user_id: string; }
interface AuditLog { id: string; action: string; user_id: string | null; session_id: string | null; details: any; created_at: string; }
type Tab = 'details' | 'branches' | 'employees' | 'config' | 'analytics' | 'history' | 'audit' | 'profile';

const CHART_COLORS = ['hsl(160, 60%, 30%)', 'hsl(38, 92%, 55%)', 'hsl(200, 70%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 72%, 51%)'];
const STATE_BADGE: Record<string, string> = {
  ACTIVE: 'bg-accent/20 text-accent-foreground', LOCKED: 'bg-warning/20 text-warning-foreground',
  VERIFIED: 'bg-primary/20 text-primary', PAID: 'bg-success/20 text-success-foreground', CLOSED: 'bg-muted text-muted-foreground',
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, profile: authProfile, updateProfile, signOut } = useAuth();
  const [mart, setMart] = useState<Mart | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<Tab>('details');
  const [loading, setLoading] = useState(true);

  // Forms
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchUrl, setNewBranchUrl] = useState('');
  const [newBranchAddr, setNewBranchAddr] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'cashier' | 'exit_guard'>('cashier');
  const [configJson, setConfigJson] = useState('');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [payFromApp, setPayFromApp] = useState(false);

  // Analytics
  const [allSessions, setAllSessions] = useState<SessionRow[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);


  // Profile settings
  const [profileName, setProfileName] = useState(authProfile?.display_name || '');
  const [profileAvatar, setProfileAvatar] = useState(authProfile?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const fetchMart = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('marts').select('*').eq('owner_id', user.id).limit(1).single();
    if (data) {
      setMart(data as Mart);
      setConfigJson(JSON.stringify(data.config, null, 2));
      setUpiId(data.upi_id || '');
      setMerchantName(data.merchant_name || '');
      setPayFromApp(data.customer_pay_from_app);
      const { data: b } = await supabase.from('branches').select('*').eq('mart_id', data.id);
      setBranches((b || []) as Branch[]);
      if (b && b.length > 0 && !selectedBranch) setSelectedBranch(b[0].id);
      const { data: e } = await supabase.from('employees').select('*').eq('mart_id', data.id);
      setEmployees((e || []) as Employee[]);
      const { data: sess } = await supabase.from('sessions').select('id, session_code, state, total_amount, payment_method, created_at, user_id').eq('mart_id', data.id).order('created_at', { ascending: false });
      const sessions = (sess || []) as SessionRow[];
      setAllSessions(sessions);
      const paid = sessions.filter(s => s.state === 'PAID' || s.state === 'CLOSED');
      setTotalRevenue(paid.reduce((sum, s) => sum + s.total_amount, 0));
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('mart_id', data.id);
      setInvoiceCount(count || 0);
    } else {
      navigate('/register-mart');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMart(); }, [fetchMart]);

  // Fetch audit logs
  useEffect(() => {
    if (tab !== 'audit' || !user) return;
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setAuditLogs((data || []) as AuditLog[]));
  }, [tab, user]);


  // Analytics data
  const paidSessions = allSessions.filter(s => s.state === 'PAID' || s.state === 'CLOSED');
  const revenueByDay = (() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = 0; }
    paidSessions.forEach(s => { const key = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); if (key in days) days[key] += s.total_amount; });
    return Object.entries(days).map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }));
  })();
  const paymentDist = (() => {
    const counts: Record<string, number> = {};
    paidSessions.forEach(s => { counts[s.payment_method || 'cash'] = (counts[s.payment_method || 'cash'] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();
  const stateDist = (() => {
    const counts: Record<string, number> = {};
    allSessions.forEach(s => { counts[s.state] = (counts[s.state] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();

  // CRUD operations
  const addBranch = async () => {
    if (!mart || !newBranchName.trim()) return;
    const { error } = await supabase.from('branches').insert({ mart_id: mart.id, branch_name: newBranchName.trim(), inventory_api_url: newBranchUrl.trim() || null, address: newBranchAddr.trim() || null, is_default: branches.length === 0 });
    if (error) { toast.error(error.message); return; }
    toast.success('Branch added'); setNewBranchName(''); setNewBranchUrl(''); setNewBranchAddr(''); fetchMart();
  };
  const removeBranch = async (id: string) => { await supabase.from('branches').delete().eq('id', id); setBranches(prev => prev.filter(b => b.id !== id)); toast.success('Branch removed'); };
  const addEmployee = async () => {
    if (!mart || !newEmpName.trim() || !newEmpEmail.trim()) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('email', newEmpEmail.trim()).single();
    if (!prof) { toast.error('User not found. They must create an account first.'); return; }
    const { error } = await supabase.from('employees').insert({ mart_id: mart.id, user_id: prof.id, employee_name: newEmpName.trim() });
    if (error) { toast.error(error.message); return; }
    await supabase.from('user_roles').insert({ user_id: prof.id, role: newEmpRole as any });
    toast.success(`${newEmpRole === 'exit_guard' ? 'Exit Guard' : 'Cashier'} added`); setNewEmpName(''); setNewEmpEmail(''); setNewEmpRole('cashier'); fetchMart();
  };
  const removeEmployee = async (emp: Employee) => {
    await supabase.from('employees').delete().eq('id', emp.id);
    await supabase.from('user_roles').delete().eq('user_id', emp.user_id).eq('role', 'cashier' as any);
    setEmployees(prev => prev.filter(e => e.id !== emp.id)); toast.success('Employee removed');
  };
  const saveConfig = async () => {
    if (!mart) return;
    try {
      const parsed = JSON.parse(configJson);
      const { error } = await supabase.from('marts').update({ config: parsed, upi_id: upiId || null, merchant_name: merchantName || null, customer_pay_from_app: payFromApp }).eq('id', mart.id);
      if (error) throw error; toast.success('Configuration saved');
    } catch (e: any) { toast.error(e.message || 'Invalid JSON'); }
  };


  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" /></div>;

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'details', label: 'Overview', icon: Store },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    
    { key: 'history', label: 'Sessions', icon: History },
    { key: 'audit', label: 'Audit', icon: FileText },
    { key: 'branches', label: 'Branches', icon: MapPin },
    { key: 'employees', label: 'Team', icon: Users },
    { key: 'config', label: 'Config', icon: Settings },
    { key: 'profile', label: 'Profile', icon: User },
  ];

  const pageVariants = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{mart?.name}</h1>
            <p className="text-sm text-muted-foreground">Admin Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Home
            </Button>
          </div>
        </div>
      </header>

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

            {/* Overview */}
            {tab === 'details' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: MapPin, value: branches.length, label: 'Branches', color: 'text-primary' },
                  { icon: Users, value: employees.length, label: 'Employees', color: 'text-primary' },
                  { icon: DollarSign, value: `₹${totalRevenue.toLocaleString()}`, label: 'Total Revenue', color: 'text-success' },
                  { icon: ShoppingCart, value: invoiceCount, label: 'Invoices', color: 'text-accent' },
                ].map((stat, i) => (
                  <motion.div key={stat.label} className="rounded-xl border border-border bg-card p-6 text-center"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <stat.icon className={`mx-auto mb-2 h-8 w-8 ${stat.color}`} />
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Analytics */}
            {tab === 'analytics' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /><h3 className="font-semibold text-foreground">Revenue (Last 7 Days)</h3></div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} formatter={(value: number) => [`₹${value}`, 'Revenue']} />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 font-semibold text-foreground">Payment Methods</h3>
                    {paymentDist.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data yet</p> : (
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart><Pie data={paymentDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{paymentDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 font-semibold text-foreground">Session States</h3>
                    {stateDist.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data yet</p> : (
                      <div className="space-y-3">
                        {stateDist.map(({ name, value }) => {
                          const pct = allSessions.length > 0 ? (value / allSessions.length) * 100 : 0;
                          return (<div key={name}><div className="flex justify-between text-sm mb-1"><span className="text-foreground font-medium">{name}</span><span className="text-muted-foreground">{value}</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} /></div></div>);
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4 text-center"><p className="text-sm text-muted-foreground">Avg. Cart Value</p><p className="text-xl font-bold text-foreground">₹{paidSessions.length > 0 ? (totalRevenue / paidSessions.length).toFixed(2) : '0'}</p></div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center"><p className="text-sm text-muted-foreground">Total Sessions</p><p className="text-xl font-bold text-foreground">{allSessions.length}</p></div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center"><p className="text-sm text-muted-foreground">Conversion Rate</p><p className="text-xl font-bold text-foreground">{allSessions.length > 0 ? ((paidSessions.length / allSessions.length) * 100).toFixed(1) : '0'}%</p></div>
                </div>
              </div>
            )}

            {/* Inventory / Products */}
            {tab === 'inventory' && (
              <div className="space-y-6">
                {/* Branch selector */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-foreground">Branch:</span>
                  {branches.map(b => (
                    <Button key={b.id} variant={selectedBranch === b.id ? 'default' : 'outline'} size="sm"
                      className={selectedBranch === b.id ? 'gradient-primary border-0 text-primary-foreground' : ''}
                      onClick={() => setSelectedBranch(b.id)}>
                      {b.branch_name}
                    </Button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search by name or barcode..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-10" />
                </div>

                {/* Add product form */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground flex items-center gap-2"><Plus className="h-4 w-4" /> Add Product</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input placeholder="Barcode *" value={newProduct.barcode} onChange={e => setNewProduct(p => ({ ...p, barcode: e.target.value }))} className="font-mono" />
                    <Input placeholder="Product name *" value={newProduct.title} onChange={e => setNewProduct(p => ({ ...p, title: e.target.value }))} />
                    <Input placeholder="Brand" value={newProduct.brand} onChange={e => setNewProduct(p => ({ ...p, brand: e.target.value }))} />
                    <Input placeholder="Category" value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))} />
                    <Input placeholder="Price *" type="number" step="0.01" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} />
                    <Input placeholder="Stock" type="number" value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} />
                    <Input placeholder="Image URL" value={newProduct.image_url} onChange={e => setNewProduct(p => ({ ...p, image_url: e.target.value }))} className="sm:col-span-2" />
                  </div>
                  <Button onClick={addProduct} disabled={!newProduct.barcode.trim() || !newProduct.title.trim()} className="mt-3 gradient-primary border-0 text-primary-foreground">
                    <Plus className="mr-2 h-4 w-4" /> Add Product
                  </Button>
                </div>

                {/* Product list */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{filteredProducts.length} products</p>
                  {filteredProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted"><Package className="h-5 w-5 text-muted-foreground" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        {editingProduct === p.id ? (
                          <div className="flex flex-wrap gap-2">
                            <Input className="h-8 w-40" value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                            <Input className="h-8 w-20" type="number" step="0.01" value={editForm.price ?? ''} onChange={e => setEditForm(f => ({ ...f, price: parseFloat(e.target.value) }))} />
                            <Input className="h-8 w-20" type="number" value={editForm.stock ?? ''} onChange={e => setEditForm(f => ({ ...f, stock: parseInt(e.target.value) }))} />
                          </div>
                        ) : (
                          <>
                            <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                            <p className="text-xs text-muted-foreground font-mono">{p.barcode} {p.brand && `· ${p.brand}`}</p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {editingProduct !== p.id && (
                          <>
                            <span className="text-sm font-semibold text-primary">₹{p.price}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{p.stock} in stock</span>
                          </>
                        )}
                        {editingProduct === p.id ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => saveEdit(p.id)}><Check className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingProduct(null)}><X className="h-4 w-4" /></Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteProduct(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="rounded-xl border border-border bg-card p-8 text-center">
                      <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                      <p className="text-muted-foreground">{productSearch ? 'No matching products' : 'No products yet. Add your first product above.'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Session History */}
            {tab === 'history' && (
              <div>
                <div className="mb-4 flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /><h3 className="font-semibold text-foreground">Recent Sessions</h3><span className="ml-auto text-sm text-muted-foreground">{allSessions.length} total</span></div>
                {allSessions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center"><History className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="text-muted-foreground">No sessions yet</p></div>
                ) : (
                  <div className="space-y-2">
                    {allSessions.slice(0, 50).map((sess, i) => (
                      <motion.div key={sess.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><ShoppingCart className="h-4 w-4 text-muted-foreground" /></div>
                          <div>
                            <p className="font-mono text-sm font-medium text-foreground">{sess.session_code}</p>
                            <p className="text-xs text-muted-foreground">{new Date(sess.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">₹{sess.total_amount.toFixed(2)}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_BADGE[sess.state] || 'bg-muted text-muted-foreground'}`}>{sess.state}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Audit Log */}
            {tab === 'audit' && (
              <div>
                <div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><h3 className="font-semibold text-foreground">Audit Log</h3></div>
                {auditLogs.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center"><FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="text-muted-foreground">No audit entries yet</p></div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log, i) => (
                      <motion.div key={log.id} className="rounded-xl border border-border bg-card p-4"
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{log.action}</span>
                          <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {log.session_id && <p className="text-xs text-muted-foreground font-mono">Session: {log.session_id.slice(0, 8)}…</p>}
                        {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
                          <div className="mt-2 rounded-lg bg-muted/50 p-2">
                            {Object.entries(log.details as Record<string, any>).map(([k, v]) => (
                              <p key={k} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{k}:</span> {String(v)}</p>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Branches */}
            {tab === 'branches' && (
              <div>
                <div className="mb-6 space-y-3">
                  {branches.map(b => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                      <div>
                        <p className="font-medium text-foreground">{b.branch_name} {b.is_default && <span className="text-xs text-primary">(Default)</span>}</p>
                        {b.address && <p className="text-xs text-muted-foreground">{b.address}</p>}
                        {b.inventory_api_url && <p className="font-mono text-xs text-muted-foreground truncate max-w-xs">{b.inventory_api_url}</p>}
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeBranch(b.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Add Branch</h3>
                  <div className="space-y-3">
                    <Input placeholder="Branch name *" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} />
                    <Input placeholder="Inventory API URL" value={newBranchUrl} onChange={e => setNewBranchUrl(e.target.value)} className="font-mono text-sm" />
                    <Input placeholder="Address" value={newBranchAddr} onChange={e => setNewBranchAddr(e.target.value)} />
                    <Button onClick={addBranch} disabled={!newBranchName.trim()} className="gradient-primary border-0 text-primary-foreground"><Plus className="mr-2 h-4 w-4" /> Add Branch</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Employees */}
            {tab === 'employees' && (
              <div>
                <div className="mb-6 space-y-3">
                  {employees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
                        <div><p className="font-medium text-foreground">{emp.employee_name}</p><p className="text-xs text-muted-foreground">{emp.is_active ? '● Active' : '○ Inactive'}</p></div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeEmployee(emp)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Add Employee</h3>
                  <p className="mb-3 text-xs text-muted-foreground">The employee must have an account first.</p>
                  <div className="space-y-3">
                    <Input placeholder="Employee name *" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} />
                    <Input placeholder="Employee email *" type="email" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={newEmpRole === 'cashier' ? 'default' : 'outline'}
                        size="sm"
                        className={newEmpRole === 'cashier' ? 'gradient-primary border-0 text-primary-foreground' : ''}
                        onClick={() => setNewEmpRole('cashier')}
                      >
                        Cashier
                      </Button>
                      <Button
                        type="button"
                        variant={newEmpRole === 'exit_guard' ? 'default' : 'outline'}
                        size="sm"
                        className={newEmpRole === 'exit_guard' ? 'gradient-primary border-0 text-primary-foreground' : ''}
                        onClick={() => setNewEmpRole('exit_guard')}
                      >
                        Exit Guard
                      </Button>
                    </div>
                    <Button onClick={addEmployee} disabled={!newEmpName.trim() || !newEmpEmail.trim()} className="gradient-primary border-0 text-primary-foreground"><Plus className="mr-2 h-4 w-4" /> Add Employee</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Config */}
            {tab === 'config' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Payment Settings</h3>
                  <div className="space-y-3">
                    <Input placeholder="UPI ID (e.g. merchant@upi)" value={upiId} onChange={e => setUpiId(e.target.value)} />
                    <Input placeholder="Merchant Name" value={merchantName} onChange={e => setMerchantName(e.target.value)} />
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={payFromApp} onChange={e => setPayFromApp(e.target.checked)} className="h-4 w-4 rounded border-input" />
                      <span className="text-sm text-foreground">Allow customers to pay from app</span>
                    </label>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Store Configuration JSON</h3>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Includes product_schema, normalization, inventory_request, invoice_schema, invoice_delivery, payment_config, and security settings.
                  </p>
                  <textarea className="w-full min-h-[300px] rounded-lg border border-input bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={configJson} onChange={e => setConfigJson(e.target.value)} />
                </div>
                <Button onClick={saveConfig} className="gradient-primary border-0 text-primary-foreground"><Save className="mr-2 h-4 w-4" /> Save Configuration</Button>
              </div>
            )}

            {/* Profile / Settings */}
            {tab === 'profile' && (
              <div className="space-y-6">
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
