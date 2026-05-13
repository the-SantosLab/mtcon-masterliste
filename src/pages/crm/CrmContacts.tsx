import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Loader2, Pencil, Send, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkEnrollDialog } from '@/components/crm/BulkEnrollDialog';
import { CrmCsvImport, type CrmImportConfig } from '@/components/crm/CrmCsvImport';

let _missingCompany = 0;

const CONTACTS_IMPORT: CrmImportConfig = {
  title: 'Kontakte importieren',
  table: 'contacts',
  templateFilename: 'kontakte-vorlage.csv',
  templateHeaders: ['first_name', 'last_name', 'email', 'phone', 'role', 'company_name', 'notes'],
  templateExample: ['Max', 'Mustermann', 'max@beispiel.de', '+49 30 1234567', 'Einkaufsleiter', 'Beispiel GmbH', 'Erstkontakt Messe'],
  fields: [
    { key: 'first_name', label: 'Vorname', required: true, aliases: ['vorname', 'firstname'] },
    { key: 'last_name', label: 'Nachname', required: true, aliases: ['nachname', 'lastname', 'name'] },
    { key: 'email', label: 'E-Mail', aliases: ['mail'] },
    { key: 'phone', label: 'Telefon', aliases: ['tel'] },
    { key: 'position', label: 'Position', aliases: ['role', 'rolle', 'funktion'] },
    { key: 'company_name', label: 'Unternehmen (Name)', aliases: ['company', 'firma', 'unternehmen'] },
    { key: 'notes', label: 'Notizen', aliases: ['notiz'] },
  ],
  buildContext: async () => {
    const { data } = await supabase.from('companies').select('id, name');
    const map = new Map<string, string>();
    (data ?? []).forEach((c: any) => map.set(String(c.name).toLowerCase().trim(), c.id));
    _missingCompany = 0;
    return { companiesByName: map };
  },
  rowAdapter: async (row, ctx) => {
    const cn = row.company_name;
    if (cn) {
      const id = ctx.companiesByName?.get(String(cn).toLowerCase().trim());
      if (id) row.company_id = id; else _missingCompany++;
    }
    delete row.company_name;
    return row;
  },
  extraSummary: () => _missingCompany > 0
    ? `${_missingCompany} Kontakte ohne zugeordnete Company (Company nicht gefunden)` : null,
};

export default function CrmContacts() {
  const [rows, setRows] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', position: '', company_id: '' });
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('contacts').select('*, companies(name)').order('last_name'),
      supabase.from('companies').select('id, name').order('name'),
    ]);
    setRows(data ?? []); setCompanies(c ?? []); setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm({ first_name: '', last_name: '', email: '', phone: '', position: '', company_id: '' }); setOpen(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ first_name: r.first_name, last_name: r.last_name, email: r.email ?? '', phone: r.phone ?? '', position: r.position ?? '', company_id: r.company_id ?? '' }); setOpen(true); };

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { toast.error('Vor- und Nachname erforderlich'); return; }
    setSaving(true);
    const payload = { ...form, company_id: form.company_id || null };
    const { error } = editing
      ? await supabase.from('contacts').update(payload).eq('id', editing.id)
      : await supabase.from('contacts').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert'); setOpen(false); void load();
  };

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-foreground">Kontakte</h1>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button onClick={() => setBulkOpen(true)} size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <Send className="h-3.5 w-3.5" /> {selected.size} in Sequenz
            </Button>
          )}
          <Button onClick={openNew} size="sm" className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Neu</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-normal w-8">
                  <Checkbox checked={selected.size > 0 && selected.size === rows.length} onCheckedChange={v => setSelected(v ? new Set(rows.map(r => r.id)) : new Set())} />
                </th>
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal">Unternehmen</th>
                <th className="px-3 py-2 font-normal">Position</th>
                <th className="px-3 py-2 font-normal">E-Mail</th>
                <th className="px-3 py-2 font-normal">Telefon</th>
                <th className="px-3 py-2 font-normal w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2 text-foreground font-medium">{r.last_name}, {r.first_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.companies?.name ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.position ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.email ?? '–'}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.phone ?? '–'}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Keine Kontakte.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <BulkEnrollDialog open={bulkOpen} onClose={() => { setBulkOpen(false); setSelected(new Set()); }} contactIds={Array.from(selected)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vorname *"><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Nachname *"><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="h-8 text-xs" /></Field>
            </div>
            <Field label="Unternehmen">
              <Select value={form.company_id} onValueChange={v => setForm({ ...form, company_id: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Position"><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="h-8 text-xs" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-Mail"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-8 text-xs" /></Field>
              <Field label="Telefon"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-8 text-xs" /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Speichern'}
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
