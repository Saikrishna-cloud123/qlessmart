import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Save, Plus, Trash2, Package, FileText, CreditCard, Shield,
  Clock, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { StoreConfig, ProductSchemaMapping, NormalizationConfig, InvoiceSchemaMapping, InvoiceDeliveryConfig, PaymentConfig } from '@/lib/storeConfig';
import { DEFAULT_STORE_CONFIG } from '@/lib/storeConfig';

interface StoreConfigEditorProps {
  config: StoreConfig;
  onSave: (config: StoreConfig) => Promise<void>;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi_counter', label: 'UPI at Counter' },
  { value: 'upi_app', label: 'UPI via App' },
  { value: 'razorpay', label: 'Online Payment' },
] as const;

const PRODUCT_FIELDS = ['barcode', 'product_id', 'title', 'brand', 'category', 'price', 'images'] as const;

type Section = 'cart' | 'product_schema' | 'normalization' | 'inventory' | 'invoice_schema' | 'invoice_delivery' | 'payment' | 'security';

export default function StoreConfigEditor({ config, onSave }: StoreConfigEditorProps) {
  const [cfg, setCfg] = useState<StoreConfig>(config);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<Section>>(new Set(['cart', 'payment']));

  useEffect(() => { setCfg(config); }, [config]);

  const toggleSection = (s: Section) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(cfg);
      toast.success('Configuration saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Path editor helper
  const pathToString = (path: (string | number)[]): string => path.join(' → ');
  const stringToPath = (str: string): (string | number)[] =>
    str.split('→').map(s => s.trim()).filter(Boolean).map(s => /^\d+$/.test(s) ? parseInt(s) : s);

  const updateProductSchemaField = (field: string, value: string) => {
    setCfg(prev => ({
      ...prev,
      product_schema: {
        ...prev.product_schema,
        [field]: stringToPath(value),
      },
    }));
  };

  const SectionHeader = ({ section, label, icon: Icon }: { section: Section; label: string; icon: any }) => (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-muted/50"
      onClick={() => toggleSection(section)}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      {openSections.has(section) ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Cart Settings */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="cart" label="Cart Settings" icon={Clock} />
        {openSections.has('cart') && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Timeout (minutes)</Label>
                <Input
                  type="number"
                  value={cfg.cart_timeout_minutes}
                  onChange={e => setCfg(prev => ({ ...prev, cart_timeout_minutes: parseInt(e.target.value) || 30 }))}
                  min={5}
                  max={120}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Max items per cart</Label>
                <Input
                  type="number"
                  value={cfg.max_items_per_cart}
                  onChange={e => setCfg(prev => ({ ...prev, max_items_per_cart: parseInt(e.target.value) || 20 }))}
                  min={1}
                  max={200}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Schema Mapping */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="product_schema" label="Product Schema Mapping" icon={Package} />
        {openSections.has('product_schema') && (
          <div className="border-t border-border p-4 space-y-3">
            <p className="text-xs text-muted-foreground mb-2">
              Define paths to extract product fields from your inventory API response. Use " → " to separate path segments (e.g. "items → 0 → title").
            </p>
            {PRODUCT_FIELDS.map(field => (
              <div key={field}>
                <Label className="text-xs text-muted-foreground capitalize">{field}</Label>
                <Input
                  value={pathToString(cfg.product_schema[field as keyof ProductSchemaMapping] || [])}
                  onChange={e => updateProductSchemaField(field, e.target.value)}
                  placeholder={`e.g. items → 0 → ${field}`}
                  className="font-mono text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Normalization Settings */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="normalization" label="Normalization & Fallbacks" icon={ArrowRight} />
        {openSections.has('normalization') && (
          <div className="border-t border-border p-4 space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">Fallback Fields</h4>
              <p className="text-xs text-muted-foreground mb-2">
                If a field is missing, try these alternative field names (comma-separated).
              </p>
              {['title', 'category', 'price', 'brand'].map(field => (
                <div key={field} className="mb-2">
                  <Label className="text-xs text-muted-foreground capitalize">{field}</Label>
                  <Input
                    value={(cfg.normalization.fallback_fields[field] || []).join(', ')}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      normalization: {
                        ...prev.normalization,
                        fallback_fields: {
                          ...prev.normalization.fallback_fields,
                          [field]: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                        },
                      },
                    }))}
                    placeholder="e.g. name, item_name, product_name"
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">Default Values</h4>
              <p className="text-xs text-muted-foreground mb-2">
                If still missing after fallbacks, use these defaults.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Brand default</Label>
                  <Input
                    value={String(cfg.normalization.defaults.brand || '')}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      normalization: {
                        ...prev.normalization,
                        defaults: { ...prev.normalization.defaults, brand: e.target.value },
                      },
                    }))}
                    placeholder="Unknown"
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Images default</Label>
                  <Input
                    value="[]"
                    disabled
                    className="text-xs bg-muted"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Request */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="inventory" label="Inventory Request" icon={Clock} />
        {openSections.has('inventory') && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Timeout (ms)</Label>
                <Input
                  type="number"
                  value={cfg.inventory_request.timeout_ms}
                  onChange={e => setCfg(prev => ({
                    ...prev,
                    inventory_request: { ...prev.inventory_request, timeout_ms: parseInt(e.target.value) || 3000 },
                  }))}
                  min={500}
                  max={30000}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Retry attempts</Label>
                <Input
                  type="number"
                  value={cfg.inventory_request.retry_attempts}
                  onChange={e => setCfg(prev => ({
                    ...prev,
                    inventory_request: { ...prev.inventory_request, retry_attempts: parseInt(e.target.value) || 2 },
                  }))}
                  min={0}
                  max={5}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Schema */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="invoice_schema" label="Invoice Schema" icon={FileText} />
        {openSections.has('invoice_schema') && (
          <div className="border-t border-border p-4 space-y-3">
            <p className="text-xs text-muted-foreground mb-2">
              Map internal invoice fields to your store's expected format.
            </p>
            {(['items', 'total_quantity', 'total', 'date'] as const).map(field => (
              <div key={field}>
                <Label className="text-xs text-muted-foreground capitalize">{field.replace('_', ' ')}</Label>
                <Input
                  value={(cfg.invoice_schema[field as keyof InvoiceSchemaMapping] || []).join(' → ')}
                  onChange={e => setCfg(prev => ({
                    ...prev,
                    invoice_schema: {
                      ...prev.invoice_schema,
                      [field]: e.target.value.split('→').map(s => s.trim()).filter(Boolean),
                    },
                  }))}
                  placeholder={field}
                  className="font-mono text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoice Delivery */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="invoice_delivery" label="Invoice Delivery" icon={FileText} />
        {openSections.has('invoice_delivery') && (
          <div className="border-t border-border p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={cfg.invoice_delivery !== null}
                onChange={e => setCfg(prev => ({
                  ...prev,
                  invoice_delivery: e.target.checked
                    ? { url: '', method: 'POST', headers: { 'Content-Type': 'application/json' } }
                    : null,
                }))}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-foreground">Enable invoice delivery to store API</span>
            </label>
            {cfg.invoice_delivery && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">API URL</Label>
                  <Input
                    value={cfg.invoice_delivery.url}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      invoice_delivery: prev.invoice_delivery
                        ? { ...prev.invoice_delivery, url: e.target.value }
                        : null,
                    }))}
                    placeholder="https://api.yourstore.com/v1/invoice"
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Method</Label>
                  <div className="flex gap-2 mt-1">
                    {(['POST', 'PUT'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          cfg.invoice_delivery?.method === m
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-muted-foreground'
                        }`}
                        onClick={() => setCfg(prev => ({
                          ...prev,
                          invoice_delivery: prev.invoice_delivery
                            ? { ...prev.invoice_delivery, method: m }
                            : null,
                        }))}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Headers (JSON)</Label>
                  <Input
                    value={JSON.stringify(cfg.invoice_delivery.headers || {})}
                    onChange={e => {
                      try {
                        const headers = JSON.parse(e.target.value);
                        setCfg(prev => ({
                          ...prev,
                          invoice_delivery: prev.invoice_delivery
                            ? { ...prev.invoice_delivery, headers }
                            : null,
                        }));
                      } catch {}
                    }}
                    placeholder='{"Content-Type":"application/json"}'
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Payment Config */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="payment" label="Payment Configuration" icon={CreditCard} />
        {openSections.has('payment') && (
          <div className="border-t border-border p-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Supported Methods</Label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      cfg.payment_config.supported_methods.includes(opt.value as any)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                    onClick={() => setCfg(prev => ({
                      ...prev,
                      payment_config: {
                        ...prev.payment_config,
                        supported_methods: prev.payment_config.supported_methods.includes(opt.value as any)
                          ? prev.payment_config.supported_methods.filter(m => m !== opt.value)
                          : [...prev.payment_config.supported_methods, opt.value as any],
                      },
                    }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">UPI Settings</h4>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">UPI ID (pa)</Label>
                  <Input
                    value={cfg.payment_config.upi?.pa || ''}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      payment_config: {
                        ...prev.payment_config,
                        upi: {
                          pa: e.target.value,
                          pn: prev.payment_config.upi?.pn || '',
                          currency: prev.payment_config.upi?.currency || 'INR',
                          url_format: prev.payment_config.upi?.url_format || 'upi://pay?pa={pa}&pn={pn}&am={amount}&cu=INR',
                        },
                      },
                    }))}
                    placeholder="merchant@upi"
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Payee Name (pn)</Label>
                  <Input
                    value={cfg.payment_config.upi?.pn || ''}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      payment_config: {
                        ...prev.payment_config,
                        upi: {
                          pa: prev.payment_config.upi?.pa || '',
                          pn: e.target.value,
                          currency: prev.payment_config.upi?.currency || 'INR',
                          url_format: prev.payment_config.upi?.url_format || 'upi://pay?pa={pa}&pn={pn}&am={amount}&cu=INR',
                        },
                      },
                    }))}
                    placeholder="Store Name"
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Currency</Label>
                  <Input
                    value={cfg.payment_config.upi?.currency || 'INR'}
                    onChange={e => setCfg(prev => ({
                      ...prev,
                      payment_config: {
                        ...prev.payment_config,
                        upi: {
                          pa: prev.payment_config.upi?.pa || '',
                          pn: prev.payment_config.upi?.pn || '',
                          currency: e.target.value,
                          url_format: prev.payment_config.upi?.url_format || 'upi://pay?pa={pa}&pn={pn}&am={amount}&cu=INR',
                        },
                      },
                    }))}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Security */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <SectionHeader section="security" label="Security Settings" icon={Shield} />
        {openSections.has('security') && (
          <div className="border-t border-border p-4">
            <Label className="text-xs text-muted-foreground">Cart Hash Algorithm</Label>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              SHA256
            </div>
            <p className="mt-1 text-xs text-muted-foreground">SHA256 is the only supported algorithm.</p>
          </div>
        )}
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full gradient-primary border-0 text-primary-foreground py-5 text-base"
      >
        {saving ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
        ) : (
          <><Save className="mr-2 h-4 w-4" /> Save Configuration</>
        )}
      </Button>
    </div>
  );
}
