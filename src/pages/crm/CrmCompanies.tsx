import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2, Send, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkEnrollDialog } from '@/components/crm/BulkEnrollDialog';
import { CrmCsvImport, type CrmImportConfig } from '@/components/crm/CrmCsvImport';

const COMPANY_TYPE_MAP: Record<string, string> = {
  customer: 'kunde', kunde: 'kunde',
  distributor: 'distributor',
  competitor: 'mitbewerber', mitbewerber: 'mitbewerber',
};

const COMPANIES_IMPORT: CrmImportConfig = {
  title: 'Unternehmen importieren',
  table: 'companies',
  templateFilename: 'companies-vorlage.csv',
  templateHeaders: ['name', 'type', 'industry', 'website', 'address', 'country', 'customer_no', 'notes'],
  templateExample: ['Beispiel GmbH', 'customer', 'Maschinenbau', 'https://beispiel.de', 'Musterstraße 1, 10115 Berlin', 'DE', 'K-1001', 'Beispieleintrag'],
  dupKey: 'name',
  fields: [
    { key: 'name', label: 'Name', required: true, aliases: ['firma', 'unternehmen', 'company'] },
    { key: 'type', label: 'Typ', transform: (v) => COMPANY_TYPE_MAP[v.toLowerCase()] ?? 'kunde' },
    { key: 'industry', label: 'Branche', aliases: ['branche'] },
    { key: 'website', label: 'Website', aliases: ['url'] },
    { key: 'address', label: 'Adresse', aliases: ['anschrift'] },
    { key: 'country', label: 'Land' },
    { key: 'customer_no', label: 'Kundennummer', aliases: ['kundennr', 'customer_number'] },
    { key: 'notes', label: 'Notizen', aliases: ['notiz'] },
  ],
};

const TYPES = [
  { key: 'all', label: 'Alle' },
  { key: 'kunde', label: 'Kunde' },
  { key: 'distributor', label: 'Distributor' },
  { key: 'mitbewerber', label: 'Mitbewerber' },
];

export default function CrmCompanies() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'kunde', website: '', industry: '', country: '', customer_no: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').order('name');
    setRows(data ?? []);
    setLoading(false);
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name erforderlich'); return; }
    setSaving(true);
    const { error } = await supabase.from('companies').insert({ ...form, type: form.type as any });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Unternehmen angelegt');
    setOpen(false);
    setForm({ name: '', type: 'kunde', website: '', industry: '', country: '', customer_no: '' });
    void load();
  };

  const filtered = filter === 'all' ? rows : rows.filter(r => r.type === filter);

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-foreground">Unternehmen</h1>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button onClick={() => setBulkOpen(true)} size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <Send className="h-3.5 w-3.5" /> {selected.size} in Sequenz
            </Button>
          )}
          <Button onClick={() => setOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Neu
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList>{TYPES.map(t => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-normal w-8">
                  <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={v => setSelected(v ? new Set(filtered.map(c => c.id)) : new Set())} />
                </th>
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Typ</th>
                <th className="px-3 py-2 font-normal">Branche</th>
                <th className="px-3 py-2 font-normal">Land</th>
                <th className="px-3 py-2 font-normal">Kundennr.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  </td>
                  <td className="px-3 py-2 text-foreground font-medium cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.type}</td>
                  <td className="px-3 py-2 text-muted-foreground cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.industry ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.country ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>{c.customer_no ?? '–'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Keine Einträge.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <BulkEnrollDialog open={bulkOpen} onClose={() => { setBulkOpen(false); setSelected(new Set()); }} companyIds={Array.from(selected)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neues Unternehmen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Typ">
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kunde">Kunde</SelectItem>
                  <SelectItem value="distributor">Distributor</SelectItem>
                  <SelectItem value="mitbewerber">Mitbewerber</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branche"><Input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Land"><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="h-8 text-xs" /></Field>
            </div>
            <Field label="Kundennummer"><Input value={form.customer_no} onChange={e => setForm({ ...form, customer_no: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Website"><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="h-8 text-xs" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={create} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Anlegen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}

function Field({ label, children }: any) {
  return <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>;
}
