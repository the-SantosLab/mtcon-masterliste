import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

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
        <Button onClick={() => setOpen(true)} size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Neu
        </Button>
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
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Typ</th>
                <th className="px-3 py-2 font-normal">Branche</th>
                <th className="px-3 py-2 font-normal">Land</th>
                <th className="px-3 py-2 font-normal">Kundennr.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/crm/companies/${c.id}`)}>
                  <td className="px-3 py-2 text-foreground font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{c.type}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.industry ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.country ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{c.customer_no ?? '–'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Keine Einträge.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

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
