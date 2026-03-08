import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Store, MapPin, Users, Plus, ArrowLeft, Settings, Trash2, Upload, Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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

type Tab = 'details' | 'branches' | 'employees' | 'config';

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

  const fetchMart = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('marts').select('*').eq('owner_id', user.id).limit(1).single();
    if (data) {
      setMart(data as Mart);
      setConfigJson(JSON.stringify(data.config, null, 2));
      setUpiId(data.upi_id || '');
      setMerchantName(data.merchant_name || '');
      setPayFromApp(data.customer_pay_from_app);
      // Fetch branches & employees
      const { data: b } = await supabase.from('branches').select('*').eq('mart_id', data.id);
      setBranches((b || []) as Branch[]);
      const { data: e } = await supabase.from('employees').select('*').eq('mart_id', data.id);
      setEmployees((e || []) as Employee[]);
    } else {
      // No mart found — redirect to registration
      navigate('/register-mart');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchMart(); }, [fetchMart]);

  const createMart = async () => {
    if (!user || !newMartName.trim()) return;
    const { data, error } = await supabase.from('marts').insert({
      name: newMartName.trim(),
      owner_id: user.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    // Add admin role
    await supabase.from('user_roles').insert({ user_id: user.id, role: 'admin' as any });
    toast.success('Store created!');
    setCreateMode(false);
    fetchMart();
  };

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
    // Look up user by email in profiles
    const { data: prof } = await supabase.from('profiles').select('id').eq('email', newEmpEmail.trim()).single();
    if (!prof) { toast.error('User not found. They must create an account first.'); return; }
    // Add employee
    const { error } = await supabase.from('employees').insert({
      mart_id: mart.id,
      user_id: prof.id,
      employee_name: newEmpName.trim(),
    });
    if (error) { toast.error(error.message); return; }
    // Add cashier role
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

  if (createMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card w-full max-w-sm rounded-2xl p-8">
          <Store className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h1 className="mb-2 text-center text-2xl font-bold text-foreground">Register Your Store</h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">Create your mart to get started</p>
          <form onSubmit={(e) => { e.preventDefault(); createMart(); }}>
            <Input placeholder="Store name" value={newMartName} onChange={(e) => setNewMartName(e.target.value)} className="mb-4" autoFocus />
            <Button type="submit" className="w-full gradient-primary border-0 text-primary-foreground" disabled={!newMartName.trim()}>
              Create Store
            </Button>
          </form>
          <Button variant="ghost" className="mt-3 w-full" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </motion.div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'details', label: 'Overview', icon: Store },
    { key: 'branches', label: 'Branches', icon: MapPin },
    { key: 'employees', label: 'Employees', icon: Users },
    { key: 'config', label: 'Config', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{mart?.name}</h1>
            <p className="text-sm text-muted-foreground">Admin Dashboard</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Home
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-6 py-2">
          {TABS.map(t => (
            <Button
              key={t.key}
              variant={tab === t.key ? 'default' : 'ghost'}
              size="sm"
              className={tab === t.key ? 'gradient-primary border-0 text-primary-foreground' : ''}
              onClick={() => setTab(t.key)}
            >
              <t.icon className="mr-1.5 h-4 w-4" /> {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-3xl p-6">
        {/* Overview */}
        {tab === 'details' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <MapPin className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="text-2xl font-bold text-foreground">{branches.length}</p>
              <p className="text-sm text-muted-foreground">Branches</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="text-2xl font-bold text-foreground">{employees.length}</p>
              <p className="text-sm text-muted-foreground">Employees</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <Settings className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="text-2xl font-bold text-foreground">{payFromApp ? 'Yes' : 'No'}</p>
              <p className="text-sm text-muted-foreground">App Payments</p>
            </div>
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
                <Input placeholder="Inventory API URL (e.g. https://api.mart.com/product/{barcode})" value={newBranchUrl} onChange={(e) => setNewBranchUrl(e.target.value)} className="font-mono text-sm" />
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
                  <div>
                    <p className="font-medium text-foreground">{emp.employee_name}</p>
                    <p className="text-xs text-muted-foreground">{emp.is_active ? 'Active' : 'Inactive'}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeEmployee(emp)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-semibold text-foreground">Add Employee (Cashier)</h3>
              <p className="mb-3 text-xs text-muted-foreground">The employee must have an account first. Enter their registered email.</p>
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
      </div>
    </div>
  );
};

export default AdminDashboard;
