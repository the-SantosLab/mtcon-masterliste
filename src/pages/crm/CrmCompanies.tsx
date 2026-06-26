import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Loader2, Send, Upload, Search, Download, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { BulkEnrollDialog } from '@/components/crm/BulkEnrollDialog';
import { CrmCsvImport, type CrmImportConfig } from '@/components/crm/CrmCsvImport';
import { SavedViewsBar } from '@/components/crm/SavedViewsBar';


const COMPANY_TYPE_MAP: Record<string, string> = {
  customer: 'kunde', kunde: 'kunde',
  distributor: 'distributor',
  competitor: 'mitbewerber', mitbewerber: 'mitbewerber',
  supplier: 'lieferant', lieferant: 'lieferant',
};

const COMPANIES_IMPORT: CrmImportConfig = {
  title: 'Geschäftspartner importieren',
  table: 'companies',
  templateFilename: 'partner-vorlage.csv',
  templateHeaders: ['name', 'partner_role', 'type', 'industry', 'website', 'email', 'phone', 'country', 'customer_no', 'notes'],
  templateExample: ['Beispiel GmbH', 'customer', 'kunde', 'Maschinenbau', 'https://beispiel.de', 'info@beispiel.de', '+49 30 12345', 'DE', '', 'Beispieleintrag'],
  dupKey: 'name',
  fields: [
    { key: 'name', label: 'Name', required: true, aliases: ['firma', 'unternehmen', 'company'] },
    { key: 'partner_role', label: 'Rolle', transform: (v) => {
      const map: Record<string, string> = { kunde: 'customer', customer: 'customer', lieferant: 'supplier', supplier: 'supplier', lead: 'lead', both: 'both', beide: 'both' };
      return map[v.toLowerCase()] ?? 'lead';
    } },
    { key: 'type', label: 'CRM-Typ', transform: (v) => COMPANY_TYPE_MAP[v.toLowerCase()] ?? 'kunde' },
    { key: 'industry', label: 'Branche', aliases: ['branche'] },
    { key: 'website', label: 'Website', aliases: ['url'] },
    { key: 'email', label: 'E-Mail' },
    { key: 'phone', label: 'Telefon' },
    { key: 'address', label: 'Adresse', aliases: ['anschrift'] },
    { key: 'country', label: 'Land' },
    { key: 'customer_no', label: 'Kundennummer', aliases: ['kundennr', 'customer_number'] },
    { key: 'notes', label: 'Notizen', aliases: ['notiz'] },
  ],
};

type Tab = 'all' | 'lead' | 'customer' | 'supplier' | 'distributor' | 'mitbewerber';

const ROLE_LABEL: Record<string, string> = {
  lead: 'Lead', customer: 'Kunde', supplier: 'Lieferant', both: 'Kunde + Lieferant',
};
const ROLE_COLOR: Record<string, string> = {
  lead: 'bg-slate-500/20 text-slate-200 border-slate-500/30',
  customer: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
  supplier: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
  both: 'bg-violet-500/20 text-violet-200 border-violet-500/30',
};

export default function CrmCompanies() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', partner_role: 'lead' as 'lead'|'customer'|'supplier'|'both', type: 'kunde', email: '', phone: '', website: '', industry: '', country: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    // PostgREST liefert max. 1000 Zeilen pro Request – seitenweise nachladen
    // bis eine Teilseite unter PAGE zurückkommt.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name')
        .range(from, from + PAGE - 1);
      if (error) { toast.error(error.message); break; }
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    setRows(all);
    setLoading(false);
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name erforderlich'); return; }
    setSaving(true);
    const typeForCrm = form.partner_role === 'supplier' ? 'lieferant' : (form.type || 'kunde');
    const { error } = await supabase.from('companies').insert({
      name: form.name, partner_role: form.partner_role, type: typeForCrm as any,
      email: form.email || null, phone: form.phone || null,
      website: form.website || null, industry: form.industry || null, country: form.country || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Partner angelegt');
    setOpen(false);
    setForm({ name: '', partner_role: 'lead', type: 'kunde', email: '', phone: '', website: '', industry: '', country: '' });
    void load();
  };

  const counts = useMemo(() => ({
    all: rows.length,
    lead: rows.filter(r => r.partner_role === 'lead').length,
    customer: rows.filter(r => r.partner_role === 'customer' || r.partner_role === 'both').length,
    supplier: rows.filter(r => r.partner_role === 'supplier' || r.partner_role === 'both').length,
    distributor: rows.filter(r => r.type === 'distributor').length,
    mitbewerber: rows.filter(r => r.type === 'mitbewerber').length,
  }), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === 'lead') list = list.filter(r => r.partner_role === 'lead');
    else if (tab === 'customer') list = list.filter(r => r.partner_role === 'customer' || r.partner_role === 'both');
    else if (tab === 'supplier') list = list.filter(r => r.partner_role === 'supplier' || r.partner_role === 'both');
    else if (tab === 'distributor') list = list.filter(r => r.type === 'distributor');
    else if (tab === 'mitbewerber') list = list.filter(r => r.type === 'mitbewerber');
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(needle) ||
        (r.customer_no ?? '').toLowerCase().includes(needle) ||
        (r.supplier_code ?? '').toLowerCase().includes(needle) ||
        (r.email ?? '').toLowerCase().includes(needle) ||
        (r.vat_id ?? '').toLowerCase().includes(needle) ||
        (r.industry ?? '').toLowerCase().includes(needle)
      );
    }
    return list;
  }, [rows, tab, q]);

  const exportCsv = () => {
    const headers = ['Name','Rolle','CRM-Typ','Kunden-Nr','Lieferanten-Nr','E-Mail','Telefon','USt-ID','PLZ','Ort','Land','Zahlungsziel'];
    const csvRows = filtered.map(p => [
      p.name, ROLE_LABEL[p.partner_role] ?? p.partner_role ?? '', p.type ?? '',
      p.customer_no ?? '', p.supplier_code ?? '', p.email ?? '', p.phone ?? '', p.vat_id ?? '',
      p.billing_zip ?? '', p.billing_city ?? '', p.billing_country ?? p.country ?? '',
      p.payment_terms_days != null ? `${p.payment_terms_days} T` : '',
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `geschaeftspartner_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <CrmLayout>
      <div className="crm-surface">
        <div className="crm-hero mb-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
              <Building2 className="h-5 w-5" /> Geschäftspartner
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Kunden, Lieferanten, Leads, Mitbewerber und Distributoren – eine Quelle.</p>
          </div>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button onClick={() => setBulkOpen(true)} size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Send className="h-3.5 w-3.5" /> {selected.size} in Sequenz
              </Button>
            )}
            <Button onClick={exportCsv} disabled={!filtered.length} size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button onClick={() => setImportOpen(true)} size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Importieren
            </Button>
            <Button onClick={() => setOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Neu
            </Button>
          </div>
        </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="all">Alle <span className="ml-1.5 text-[10px] opacity-70">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="lead">Leads <span className="ml-1.5 text-[10px] opacity-70">{counts.lead}</span></TabsTrigger>
            <TabsTrigger value="customer">Kunden <span className="ml-1.5 text-[10px] opacity-70">{counts.customer}</span></TabsTrigger>
            <TabsTrigger value="supplier">Lieferanten <span className="ml-1.5 text-[10px] opacity-70">{counts.supplier}</span></TabsTrigger>
            <TabsTrigger value="distributor">Distributoren <span className="ml-1.5 text-[10px] opacity-70">{counts.distributor}</span></TabsTrigger>
            <TabsTrigger value="mitbewerber">Mitbewerber <span className="ml-1.5 text-[10px] opacity-70">{counts.mitbewerber}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, Nummer, E-Mail, USt-ID, Branche…" className="pl-8 h-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="crm-table-wrap">

          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground [&>th]:sticky [&>th]:top-[-0.75rem] sm:[&>th]:top-[-1.25rem] lg:[&>th]:top-[-2rem] [&>th]:z-30 [&>th]:bg-card [&>th]:shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                <th className="px-3 py-2 font-normal w-8">
                  <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={v => setSelected(v ? new Set(filtered.map(c => c.id)) : new Set())} />
                </th>
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Rolle</th>
                <th className="px-3 py-2 font-normal">Nummer</th>
                <th className="px-3 py-2 font-normal">E-Mail</th>
                <th className="px-3 py-2 font-normal">Ort</th>
                <th className="px-3 py-2 font-normal">Branche</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  </td>
                  <td className="px-3 py-2 text-foreground font-medium cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>
                    {c.name}
                    {c.is_active === false && <span className="ml-2 text-[10px] text-muted-foreground">(inaktiv)</span>}
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>
                    {c.partner_role
                      ? <Badge variant="outline" className={`text-[10px] ${ROLE_COLOR[c.partner_role]}`}>{ROLE_LABEL[c.partner_role]}</Badge>
                      : <span className="text-muted-foreground capitalize">{c.type ?? '–'}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>
                    {c.customer_no && <div>{c.customer_no}</div>}
                    {c.supplier_code && <div>{c.supplier_code}</div>}
                    {!c.customer_no && !c.supplier_code && '–'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.email ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{[c.billing_zip, c.billing_city].filter(Boolean).join(' ') || c.country || '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.industry ?? '–'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Keine Einträge.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <BulkEnrollDialog open={bulkOpen} onClose={() => { setBulkOpen(false); setSelected(new Set()); }} companyIds={Array.from(selected)} />
      <CrmCsvImport open={importOpen} onClose={() => setImportOpen(false)} onDone={load} config={COMPANIES_IMPORT} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Geschäftspartner</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rolle">
                <Select value={form.partner_role} onValueChange={v => setForm({ ...form, partner_role: v as any })}>
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
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kunde">Kunde</SelectItem>
                    <SelectItem value="distributor">Distributor</SelectItem>
                    <SelectItem value="mitbewerber">Mitbewerber</SelectItem>
                    <SelectItem value="lieferant">Lieferant</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-Mail"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Telefon"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Branche"><Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Land"><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="h-8 text-xs" placeholder="DE" /></Field>
            </div>
            <Field label="Website"><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="h-8 text-xs" /></Field>
            <p className="text-[10px] text-muted-foreground">Kunden- bzw. Lieferantennummer wird automatisch vergeben, sobald die Rolle Kunde oder Lieferant ist. Stammdaten (Adressen, Bank, Zahlung) im Detail ergänzen.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={create} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </CrmLayout>
  );
}

function Field({ label, children }: any) {
  return <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>;
}
