import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Sparkles, Save } from 'lucide-react';
import { formatEUR } from '@/lib/crm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectProtectionTab } from '@/components/crm/ProjectProtectionTab';
import { LookalikeDialog } from '@/components/crm/LookalikeDialog';
import { IssosInvoicesTab } from '@/components/IssosInvoicesTab';
import { IssosDeliveriesTab } from '@/components/IssosDeliveriesTab';
import { IssosOffersTab } from '@/components/IssosOffersTab';
import { DocumentSection } from '@/components/documents/DocumentSection';
import { toast } from 'sonner';

const ROLE_LABEL: Record<string, string> = { lead: 'Lead', customer: 'Kunde', supplier: 'Lieferant', both: 'Kunde + Lieferant' };
const ROLE_COLOR: Record<string, string> = {
  lead: 'bg-slate-500/20 text-slate-200 border-slate-500/30',
  customer: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
  supplier: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  both: 'bg-violet-500/20 text-violet-200 border-violet-500/30',
};

export default function CrmCompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [acts, setActs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookalike, setLookalike] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, [id]);
  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: d }, { data: ct }, { data: a }, { data: o }, { data: dl }, { data: inv }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('deals').select('*').eq('company_id', id).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('company_id', id).order('last_name'),
      supabase.from('crm_activities').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
      (supabase as any).from('orders').select('id, order_no, status, total_amount, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(50),
      (supabase as any).from('deliveries').select('id, delivery_no, status, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(50),
      (supabase as any).from('invoices').select('id, invoice_no, status, total_amount, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(50),
    ]);
    setCompany(c); setDeals(d ?? []); setContacts(ct ?? []); setActs(a ?? []);
    setOrders(o ?? []); setDeliveries(dl ?? []); setInvoices(inv ?? []);
    setLoading(false);
  };

  const save = async () => {
    if (!company) return;
    setSaving(true);
    const { id: cid, created_at, updated_at, ...rest } = company;
    const { error } = await supabase.from('companies').update(rest).eq('id', cid);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert');
    void load();
  };

  if (loading) return <CrmLayout><div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div></CrmLayout>;
  if (!company) return <CrmLayout><p className="text-sm text-muted-foreground">Nicht gefunden.</p></CrmLayout>;

  const setC = (patch: any) => setCompany({ ...company, ...patch });

  return (
    <CrmLayout>
      <button onClick={() => navigate('/crm/companies')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück
      </button>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            {company.name}
            {company.partner_role && <Badge variant="outline" className={`text-[10px] ${ROLE_COLOR[company.partner_role]}`}>{ROLE_LABEL[company.partner_role]}</Badge>}
            {company.is_active === false && <Badge variant="outline" className="text-[10px]">inaktiv</Badge>}
          </h1>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">
            {company.type ?? '–'} · {company.country ?? '–'}
            {company.customer_no && <> · {company.customer_no}</>}
            {company.supplier_code && <> · {company.supplier_code}</>}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setLookalike(true)} className="h-8 text-xs gap-1.5"><Sparkles className="h-3.5 w-3.5" />Ähnliche finden</Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="master">Stammdaten</TabsTrigger>
          <TabsTrigger value="documents">Belege <span className="ml-1.5 text-[10px] opacity-70">{orders.length + deliveries.length + invoices.length}</span></TabsTrigger>
          <TabsTrigger value="issos">ISSOS-Rechnungen</TabsTrigger>
          <TabsTrigger value="issos-ls">ISSOS-Lieferscheine</TabsTrigger>
          <TabsTrigger value="protection">Projektschutz</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Section title="Deal-History">
              {deals.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {deals.map(d => (
                    <li key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                      <Link to={`/crm/deals/${d.id}`} className="text-foreground hover:text-primary truncate">{d.title}</Link>
                      <span className="text-muted-foreground tabular-nums">{formatEUR(d.value_final ?? d.value_estimated)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Kontakte">
              {contacts.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {contacts.map(c => (
                    <li key={c.id} className="text-xs py-1.5 border-b border-border/50 last:border-0">
                      <p className="text-foreground">{c.first_name} {c.last_name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.email ?? c.position ?? '–'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Aktivitäten">
              {acts.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {acts.map(a => (
                    <li key={a.id} className="text-xs py-1.5 border-b border-border/50 last:border-0">
                      <p className="text-foreground">{a.subject}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString('de-DE')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          <div className="mt-4">
            <DocumentSection entityType="company" entityId={company.id} />
          </div>
        </TabsContent>

        <TabsContent value="master" className="mt-4 max-w-4xl space-y-5">
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs gap-1.5">
              <Save className="h-3.5 w-3.5" /> {saving ? 'Speichert…' : 'Speichern'}
            </Button>
          </div>

          <SubSection title="Basis">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *"><Input value={company.name ?? ''} onChange={e => setC({ name: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Rolle">
                <Select value={company.partner_role ?? 'lead'} onValueChange={v => setC({ partner_role: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="customer">Kunde</SelectItem>
                    <SelectItem value="supplier">Lieferant</SelectItem>
                    <SelectItem value="both">Kunde + Lieferant</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="CRM-Typ">
                <Select value={company.type ?? 'kunde'} onValueChange={v => setC({ type: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kunde">Kunde</SelectItem>
                    <SelectItem value="distributor">Distributor</SelectItem>
                    <SelectItem value="mitbewerber">Mitbewerber</SelectItem>
                    <SelectItem value="lieferant">Lieferant</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Branche"><Input value={company.industry ?? ''} onChange={e => setC({ industry: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="E-Mail"><Input type="email" value={company.email ?? ''} onChange={e => setC({ email: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="Telefon"><Input value={company.phone ?? ''} onChange={e => setC({ phone: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="Website"><Input value={company.website ?? ''} onChange={e => setC({ website: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="USt-ID"><Input value={company.vat_id ?? ''} onChange={e => setC({ vat_id: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="Steuernummer"><Input value={company.tax_no ?? ''} onChange={e => setC({ tax_no: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="Sprache / Währung">
                <div className="flex gap-2">
                  <Input value={company.language ?? ''} onChange={e => setC({ language: e.target.value || null })} className="h-8 text-xs" placeholder="de" />
                  <Input value={company.default_currency ?? ''} onChange={e => setC({ default_currency: e.target.value || null })} className="h-8 text-xs" placeholder="EUR" />
                </div>
              </Field>
              <Field label="Kunden-Nr."><Input value={company.customer_no ?? ''} disabled className="h-8 text-xs opacity-60" /></Field>
              <Field label="Lieferanten-Nr."><Input value={company.supplier_code ?? ''} disabled className="h-8 text-xs opacity-60" /></Field>
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs">
              <Switch checked={company.is_active !== false} onCheckedChange={v => setC({ is_active: v })} /> Aktiv
            </div>
          </SubSection>

          <SubSection title="Rechnungsadresse">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Straße"><Input value={company.billing_street ?? ''} onChange={e => setC({ billing_street: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="Land"><Input value={company.billing_country ?? ''} onChange={e => setC({ billing_country: e.target.value || null })} className="h-8 text-xs" placeholder="DE" /></Field>
              <Field label="PLZ"><Input value={company.billing_zip ?? ''} onChange={e => setC({ billing_zip: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="Ort"><Input value={company.billing_city ?? ''} onChange={e => setC({ billing_city: e.target.value || null })} className="h-8 text-xs" /></Field>
            </div>
          </SubSection>

          <SubSection title="Lieferadresse">
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Switch checked={!!company.shipping_same_as_billing} onCheckedChange={v => setC({ shipping_same_as_billing: v })} />
              identisch mit Rechnungsadresse
            </label>
            {!company.shipping_same_as_billing && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Straße"><Input value={company.shipping_street ?? ''} onChange={e => setC({ shipping_street: e.target.value || null })} className="h-8 text-xs" /></Field>
                <Field label="Land"><Input value={company.shipping_country ?? ''} onChange={e => setC({ shipping_country: e.target.value || null })} className="h-8 text-xs" /></Field>
                <Field label="PLZ"><Input value={company.shipping_zip ?? ''} onChange={e => setC({ shipping_zip: e.target.value || null })} className="h-8 text-xs" /></Field>
                <Field label="Ort"><Input value={company.shipping_city ?? ''} onChange={e => setC({ shipping_city: e.target.value || null })} className="h-8 text-xs" /></Field>
              </div>
            )}
          </SubSection>

          <SubSection title="Zahlung & Bank">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zahlungsziel (Tage)"><Input type="number" value={company.payment_terms_days ?? ''} onChange={e => setC({ payment_terms_days: e.target.value ? parseInt(e.target.value) : null })} className="h-8 text-xs" /></Field>
              <Field label="Skonto %"><Input type="number" step="0.01" value={company.discount_pct ?? ''} onChange={e => setC({ discount_pct: e.target.value ? parseFloat(e.target.value) : null })} className="h-8 text-xs" /></Field>
              <Field label="Zahlungstext"><Input value={company.payment_terms_text ?? ''} onChange={e => setC({ payment_terms_text: e.target.value || null })} className="h-8 text-xs" placeholder="14 Tage netto, 2% Skonto 7 Tage" /></Field>
              <Field label="Kreditlimit"><Input type="number" step="0.01" value={company.credit_limit ?? ''} onChange={e => setC({ credit_limit: e.target.value ? parseFloat(e.target.value) : null })} className="h-8 text-xs" /></Field>
              <Field label="Bank"><Input value={company.bank_name ?? ''} onChange={e => setC({ bank_name: e.target.value || null })} className="h-8 text-xs" /></Field>
              <Field label="BIC"><Input value={company.bic ?? ''} onChange={e => setC({ bic: e.target.value || null })} className="h-8 text-xs" /></Field>
              <div className="col-span-2">
                <Field label="IBAN"><Input value={company.iban ?? ''} onChange={e => setC({ iban: e.target.value || null })} className="h-8 text-xs font-mono" /></Field>
              </div>
            </div>
          </SubSection>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Section title={`Bestellungen (${orders.length})`}>
              {orders.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {orders.map(o => (
                    <li key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                      <Link to={`/bestellungen?id=${o.id}`} className="text-foreground hover:text-primary truncate">{o.order_no ?? '—'}</Link>
                      <span className="text-muted-foreground tabular-nums">{formatEUR(o.total_amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Lieferscheine (${deliveries.length})`}>
              {deliveries.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {deliveries.map(d => (
                    <li key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                      <Link to={`/lieferscheine?id=${d.id}`} className="text-foreground hover:text-primary truncate">{d.delivery_no ?? '—'}</Link>
                      <span className="text-[11px] text-muted-foreground capitalize">{d.status ?? '–'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Rechnungen (${invoices.length})`}>
              {invoices.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {invoices.map(iv => (
                    <li key={iv.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                      <Link to={`/rechnungen?id=${iv.id}`} className="text-foreground hover:text-primary truncate">{iv.invoice_no ?? '—'}</Link>
                      <span className="text-muted-foreground tabular-nums">{formatEUR(iv.total_amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="issos" className="mt-4">
          <IssosInvoicesTab companyId={company.id} companyName={company.name} />
        </TabsContent>

        <TabsContent value="issos-ls" className="mt-4">
          <IssosDeliveriesTab companyId={company.id} companyName={company.name} />
        </TabsContent>

        <TabsContent value="protection" className="mt-4 max-w-3xl">
          <ProjectProtectionTab companyId={company.id} />
        </TabsContent>
      </Tabs>

      <LookalikeDialog company={company} open={lookalike} onClose={() => setLookalike(false)} />
    </CrmLayout>
  );
}

const Section = ({ title, children }: any) => (
  <section className="rounded-lg border border-border bg-card/40 backdrop-blur-xl p-4">
    <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
    {children}
  </section>
);
const SubSection = ({ title, children }: any) => (
  <section className="rounded-lg border border-border bg-card/40 backdrop-blur-xl p-4">
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{title}</h2>
    {children}
  </section>
);
const Empty = () => <p className="text-xs text-muted-foreground">Keine Einträge.</p>;
const Field = ({ label, children }: any) => (
  <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>
);
