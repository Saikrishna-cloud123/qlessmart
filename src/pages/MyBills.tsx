import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Receipt, ArrowLeft, Store, MapPin, Calendar, Download,
  ChevronRight, Package, X, CreditCard, Banknote, QrCode, Smartphone,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { db } from '@/integrations/firebase/firebase';
import { collection, query, where, getDocs, orderBy, documentId } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  total_quantity: number;
  payment_method: string | null;
  items: any[];
  created_at: string;
  mart_id: string;
  branch_id: string;
  session_id: string;
}

interface MartInfo {
  id: string;
  name: string;
}

interface BranchInfo {
  id: string;
  branch_name: string;
}

const PAYMENT_ICONS: Record<string, any> = {
  cash: Banknote,
  card: CreditCard,
  upi_counter: QrCode,
  upi_app: Smartphone,
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  upi_counter: 'UPI Counter',
  upi_app: 'UPI App',
  razorpay: 'Razorpay',
};

const MyBills = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [marts, setMarts] = useState<Record<string, MartInfo>>({});
  const [branches, setBranches] = useState<Record<string, BranchInfo>>({});
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const invQuery = query(collection(db, 'invoices'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'));
      const invSnap = await getDocs(invQuery);

      const invs = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      setInvoices(invs);

      // Load mart & branch names
      const martIds = [...new Set(invs.map(i => i.mart_id))];
      const branchIds = [...new Set(invs.map(i => i.branch_id))];

      if (martIds.length > 0) {
        try {
          const mQuery = query(collection(db, 'marts'), where(documentId(), 'in', martIds.slice(0, 10)));
          const mSnap = await getDocs(mQuery);
          setMarts(Object.fromEntries(mSnap.docs.map(d => [d.id, { id: d.id, name: d.data().name }])));
        } catch(e) { console.error('Marts fetch error:', e); }
      }
      if (branchIds.length > 0) {
        try {
          const bQuery = query(collection(db, 'branches'), where(documentId(), 'in', branchIds.slice(0, 10)));
          const bSnap = await getDocs(bQuery);
          setBranches(Object.fromEntries(bSnap.docs.map(d => [d.id, { id: d.id, branch_name: d.data().branch_name }])));
        } catch(e) { console.error('Branches fetch error:', e); }
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // Invoice detail view
  if (selectedInvoice) {
    const inv = selectedInvoice;
    const martName = marts[inv.mart_id]?.name || 'Store';
    const branchName = branches[inv.branch_id]?.branch_name || '';
    const PayIcon = PAYMENT_ICONS[inv.payment_method || 'cash'] || CreditCard;
    const items = Array.isArray(inv.items) ? inv.items : [];

    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedInvoice(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">Invoice</h1>
              <p className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedInvoice(null)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-lg p-6">
          {/* Store info */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Store className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{martName}</h2>
            {branchName && <p className="text-sm text-muted-foreground">{branchName}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(inv.created_at)} at {formatTime(inv.created_at)}</p>
          </div>

          {/* Items */}
          <div className="mb-4 rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Items ({inv.total_quantity})</p>
            </div>
            <div className="divide-y divide-border">
              {items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × ₹{Number(item.price).toFixed(2)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    ₹{(Number(item.price) * Number(item.quantity)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Payment & Total */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PayIcon className="h-4 w-4" />
                {PAYMENT_LABELS[inv.payment_method || 'cash'] || inv.payment_method}
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">PAID</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="font-medium text-foreground">Total</span>
              <span className="text-2xl font-bold text-primary">₹{Number(inv.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Invoice list
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">My Bills</h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Receipt className="mb-4 h-16 w-16 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">No bills yet</p>
            <p className="text-sm text-muted-foreground/70">Your invoices will appear here after shopping</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv, idx) => {
              const martName = marts[inv.mart_id]?.name || 'Store';
              const branchName = branches[inv.branch_id]?.branch_name || '';
              return (
                <motion.button
                  key={inv.id}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                  onClick={() => setSelectedInvoice(inv)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Receipt className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{martName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {branchName && <span>{branchName}</span>}
                        <span>·</span>
                        <span>{formatDate(inv.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground">₹{Number(inv.total_amount).toFixed(2)}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">PAID</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyBills;
