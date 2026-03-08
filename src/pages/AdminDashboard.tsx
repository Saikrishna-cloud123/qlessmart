import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, MapPin, Users, Plus, ArrowLeft, Settings, Trash2, Save,
  BarChart3, History, TrendingUp, DollarSign, ShoppingCart, Calendar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

interface Mart {
  id: string;
  name: string;
  config: any;
  upi_id: string | null;
  merchant_name: string | null;
  customer_pay_from_app: boolean;
  logo_url: string | null;
}

interface Branch {
  id: string;
  branch_name: string;
  inventory_api_url: string | null;
  address: string | null;
  is_default: boolean;
}

interface Employee {
  id: string;
  employee_name: string;
  user_id: string;
  branch_id: string | null;
  is_active: boolean;
}

interface SessionRow {
  id: string;
  session_code: string;
  state: string;
  total_amount: number;
  payment_method: string | null;
  created_at: string;
  user_id: string;
}

type Tab = 'details' | 'branches' | 'employees' | 'config' | 'analytics' | 'history';

const CHART_COLORS = [
  'hsl(160, 60%, 30%)',
  'hsl(38, 92%, 55%)',
  'hsl(200, 70%, 50%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 72%, 51%)',
];

const STATE_BADGE: Record<string, string> = {
  ACTIVE: 'bg-accent/20 text-accent-foreground',
  LOCKED: 'bg-warning/20 text-warning-foreground',
  VERIFIED: 'bg-primary/20 text-primary',
  PAID: 'bg-success/20 text-success-foreground',
  CLOSED: 'bg-muted text-muted-foreground',
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mart, setMart] = useState<Mart | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<Tab>('details');
  const [loading, setLoading] = useState(true);

  // Branch form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchUrl, setNewBranchUrl] = useState('');
  const [newBranchAddr, setNewBranchAddr] = useState('');

  // Employee form
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');

  // Config
  const [configJson, setConfigJson] = useState('');
  const [upiId, setUpiId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [payFromApp, setPayFromApp] = useState(false);

  // Analytics
  const [allSessions, setAllSessions] = useState<SessionRow[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

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
      const { data: e } = await supabase.from('employees').select('*').eq('mart_id', data.id);
      setEmployees((e || []) as Employee[]);
      // Fetch sessions for analytics
      const { data: sess } = await supabase
        .from('sessions')
        .select('id, session_code, state, total_amount, payment_method, created_at, user_id')
        .eq('mart_id', data.id)
        .order('created_at', { ascending: false });
      const sessions = (sess || []) as SessionRow[];
      setAllSessions(sessions);
      // Revenue from PAID/CLOSED sessions
      const paid = sessions.filter(s => s.state === 'PAID' || s.state === 'CLOSED');
      setTotalRevenue(paid.reduce((sum, s) => sum + s.total_amount, 0));
      // Invoice count
      const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('mart_id', data.id);
      setInvoiceCount(count || 0);
    } else {
      navigate('/register-mart');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMart(); }, [fetchMart]);

  // --- Analytics data ---
  const paidSessions = allSessions.filter(s => s.state === 'PAID' || s.state === 'CLOSED');

  // Revenue by day (last 7 days)
  const revenueByDay = (() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days[key] = 0;
    }
    paidSessions.forEach(s => {
      const d = new Date(s.created_at);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (key in days) days[key] += s.total_amount;
    });
    return Object.entries(days).map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }));
  })();

  // Payment method distribution
  const paymentDist = (() => {
    const counts: Record<string, number> = {};
    paidSessions.forEach(s => {
      const m = s.payment_method || 'cash';
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();

  // Session state distribution
  const stateDist = (() => {
    const counts: Record<string, number> = {};
    allSessions.forEach(s => {
      counts[s.state] = (counts[s.state] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();

  const addBranch = async () => {
    if (!mart || !newBranchName.trim()) return;
    const { error } = await supabase.from('branches').insert({
      mart_id: mart.id,
      branch_name: newBranchName.trim(),
      inventory_api_url: newBranchUrl.trim() || null,
      address: newBranchAddr.trim() || null,
      is_default: branches.length === 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Branch added');
    setNewBranchName(''); setNewBranchUrl(''); setNewBranchAddr('');
    fetchMart();
  };

  const removeBranch = async (id: string) => {
    await supabase.from('branches').delete().eq('id', id);
    setBranches(prev => prev.filter(b => b.id !== id));
    toast.success('Branch removed');
  };

  const addEmployee = async () => {
    if (!mart || !newEmpName.trim() || !newEmpEmail.trim()) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('email', newEmpEmail.trim()).single();
    if (!prof) { toast.error('User not found. They must create an account first.'); return; }
    const { error } = await supabase.from('employees').insert({
      mart_id: mart.id,
      user_id: prof.id,
      employee_name: newEmpName.trim(),
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from('user_roles').insert({ user_id: prof.id, role: 'cashier' as any });
    toast.success('Employee added');
    setNewEmpName(''); setNewEmpEmail('');
    fetchMart();
  };

  const removeEmployee = async (emp: Employee) => {
    await supabase.from('employees').delete().eq('id', emp.id);
    await supabase.from('user_roles').delete().eq('user_id', emp.user_id).eq('role', 'cashier' as any);
    setEmployees(prev => prev.filter(e => e.id !== emp.id));
    toast.success('Employee removed');
  };

  const saveConfig = async () => {
    if (!mart) return;
    try {
      const parsed = JSON.parse(configJson);
      const { error } = await supabase.from('marts').update({
        config: parsed,
        upi_id: upiId || null,
        merchant_name: merchantName || null,
        customer_pay_from_app: payFromApp,
      }).eq('id', mart.id);
      if (error) throw error;
      toast.success('Configuration saved');
    } catch (e: any) {
      toast.error(e.message || 'Invalid JSON');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'details', label: 'Overview', icon: Store },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'history', label: 'Sessions', icon: History },
    { key: 'branches', label: 'Branches', icon: MapPin },
    { key: 'employees', label: 'Team', icon: Users },
    { key: 'config', label: 'Config', icon: Settings },
  ];

  const pageVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  };

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

      {/* Tabs */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2 scrollbar-none">
          {TABS.map(t => (
            <Button
              key={t.key}
              variant={tab === t.key ? 'default' : 'ghost'}
              size="sm"
              className={`shrink-0 ${tab === t.key ? 'gradient-primary border-0 text-primary-foreground' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <t.icon className="mr-1.5 h-4 w-4" /> {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            {/* Overview */}
            {tab === 'details' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: MapPin, value: branches.length, label: 'Branches', color: 'text-primary' },
                  { icon: Users, value: employees.length, label: 'Employees', color: 'text-primary' },
                  { icon: DollarSign, value: `₹${totalRevenue.toLocaleString()}`, label: 'Total Revenue', color: 'text-success' },
                  { icon: ShoppingCart, value: invoiceCount, label: 'Invoices', color: 'text-accent' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    className="rounded-xl border border-border bg-card p-6 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
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
                {/* Revenue chart */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Revenue (Last 7 Days)</h3>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))',
                          }}
                          formatter={(value: number) => [`₹${value}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Payment method pie */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 font-semibold text-foreground">Payment Methods</h3>
                    {paymentDist.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                    ) : (
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={paymentDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                              {paymentDist.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Session states */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-4 font-semibold text-foreground">Session States</h3>
                    {stateDist.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
                    ) : (
                      <div className="space-y-3">
                        {stateDist.map(({ name, value }) => {
                          const pct = allSessions.length > 0 ? (value / allSessions.length) * 100 : 0;
                          return (
                            <div key={name}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-foreground font-medium">{name}</span>
                                <span className="text-muted-foreground">{value}</span>
                              </div>
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full bg-primary"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.6, delay: 0.1 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Key metrics */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-sm text-muted-foreground">Avg. Cart Value</p>
                    <p className="text-xl font-bold text-foreground">
                      ₹{paidSessions.length > 0 ? (totalRevenue / paidSessions.length).toFixed(2) : '0'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-sm text-muted-foreground">Total Sessions</p>
                    <p className="text-xl font-bold text-foreground">{allSessions.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-sm text-muted-foreground">Conversion Rate</p>
                    <p className="text-xl font-bold text-foreground">
                      {allSessions.length > 0 ? ((paidSessions.length / allSessions.length) * 100).toFixed(1) : '0'}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Session History */}
            {tab === 'history' && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Recent Sessions</h3>
                  <span className="ml-auto text-sm text-muted-foreground">{allSessions.length} total</span>
                </div>
                {allSessions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <History className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">No sessions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allSessions.slice(0, 50).map((sess, i) => (
                      <motion.div
                        key={sess.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-mono text-sm font-medium text-foreground">{sess.session_code}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(sess.created_at).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">₹{sess.total_amount.toFixed(2)}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_BADGE[sess.state] || 'bg-muted text-muted-foreground'}`}>
                            {sess.state}
                          </span>
                        </div>
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
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeBranch(b.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Add Branch</h3>
                  <div className="space-y-3">
                    <Input placeholder="Branch name *" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
                    <Input placeholder="Inventory API URL" value={newBranchUrl} onChange={(e) => setNewBranchUrl(e.target.value)} className="font-mono text-sm" />
                    <Input placeholder="Address" value={newBranchAddr} onChange={(e) => setNewBranchAddr(e.target.value)} />
                    <Button onClick={addBranch} disabled={!newBranchName.trim()} className="gradient-primary border-0 text-primary-foreground">
                      <Plus className="mr-2 h-4 w-4" /> Add Branch
                    </Button>
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
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{emp.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{emp.is_active ? '● Active' : '○ Inactive'}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeEmployee(emp)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Add Employee (Cashier)</h3>
                  <p className="mb-3 text-xs text-muted-foreground">The employee must have an account first.</p>
                  <div className="space-y-3">
                    <Input placeholder="Employee name *" value={newEmpName} onChange={(e) => setNewEmpName(e.target.value)} />
                    <Input placeholder="Employee email *" type="email" value={newEmpEmail} onChange={(e) => setNewEmpEmail(e.target.value)} />
                    <Button onClick={addEmployee} disabled={!newEmpName.trim() || !newEmpEmail.trim()} className="gradient-primary border-0 text-primary-foreground">
                      <Plus className="mr-2 h-4 w-4" /> Add Employee
                    </Button>
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
                    <Input placeholder="UPI ID (e.g. merchant@upi)" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                    <Input placeholder="Merchant Name" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={payFromApp} onChange={(e) => setPayFromApp(e.target.checked)} className="h-4 w-4 rounded border-input" />
                      <span className="text-sm text-foreground">Allow customers to pay from app</span>
                    </label>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 font-semibold text-foreground">Configuration JSON</h3>
                  <p className="mb-2 text-xs text-muted-foreground">Define product schema, invoice schema, and API mappings.</p>
                  <textarea
                    className="w-full min-h-[200px] rounded-lg border border-input bg-background p-3 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                  />
                </div>
                <Button onClick={saveConfig} className="gradient-primary border-0 text-primary-foreground">
                  <Save className="mr-2 h-4 w-4" /> Save Configuration
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminDashboard;
