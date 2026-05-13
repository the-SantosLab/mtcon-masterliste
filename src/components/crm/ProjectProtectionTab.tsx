import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Shield } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  id: string; distributor_name: string | null; scope_type: string;
  scope_detail: string | null; valid_until: string | null; status: string; notes: string | null;
};

const SCOPE_LABEL: Record<string, string> = { global: 'Global (Konzern)', department: 'Abteilung', subsidiary: 'Tochtergesellschaft' };
const STATUS_LABEL: Record<string, string> = { aktiv: 'Aktiv', abgelaufen: 'Abgelaufen', strittig: 'Strittig' };
const STATUS_COLOR: Record<string, string> = { aktiv: 'bg-emerald-500/15 text-emerald-400', abgelaufen: 'bg-muted text-muted-foreground', strittig: 'bg-amber-500/15 text-amber-400' };

export function ProjectProtectionTab({ companyId }: { companyId: string }) {
  const { user, role } = useAuth();
  const canWrite = role === 'admin' || role === 'staff';
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ distributor_name: '', scope_type: 'global', scope_detail: '', valid_until: '', status: 'aktiv', notes: '' });

  useEffect(() => { void load(); }, [companyId]);
  const load = async () => {
    const { data } = await supabase.from('project_protection').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setRows((data ?? []) as Row[]);
  };

  const create = async () => {
    if (!form.distributor_name.trim()) { toast.error('Distributor erforderlich'); return; }
    const { error } = await supabase.from('project_protection').insert({
      company_id: companyId,
      distributor_name: form.distributor_name.trim(),
      scope_type: form.scope_type as any,
      scope_detail: form.scope_detail || null,
      valid_until: form.valid_until || null,
      status: form.status as any,
      notes: form.notes || null,
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Schutz angelegt');
    setOpen(false);
    setForm({ distributor_name: '', scope_type: 'global', scope_detail: '', valid_until: '', status: 'aktiv', notes: '' });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm('Schutz löschen?')) return;
    const { error } = await supabase.from('project_protection').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />Projektschutz</h3>
        {canWrite && <Button size="sm" onClick={() => setOpen(true)} className="h-7 text-[11px] gap-1.5"><Plus className="h-3 w-3" />Neu</Button>}
      </div>

      {rows.length === 0 ? <p className="text-xs text-muted-foreground">Keine Schutzeinträge.</p> : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="p-3 rounded border border-border bg-card/40 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{r.distributor_name ?? '—'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLOR[r.status] ?? ''}`}>{STATUS_LABEL[r.status]}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{SCOPE_LABEL[r.scope_type]}</span>
                  </div>
                  {r.scope_detail && <p className="text-[11px] text-muted-foreground mt-1">Scope: {r.scope_detail}</p>}
                  {r.valid_until && <p className="text-[11px] text-muted-foreground">Gültig bis: {new Date(r.valid_until).toLocaleDateString('de-DE')}</p>}
                  {r.notes && <p className="text-[11px] text-foreground mt-1">{r.notes}</p>}
                </div>
                {canWrite && <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="h-6 w-6 p-0 text-destructive"><Trash2 className="h-3 w-3" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Projektschutz</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Distributor *"><Input value={form.distributor_name} onChange={e => setForm({ ...form, distributor_name: e.target.value })} className="h-8 text-xs" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Scope-Typ">
                <Select value={form.scope_type} onValueChange={v => setForm({ ...form, scope_type: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global (Konzern)</SelectItem>
                    <SelectItem value="department">Abteilung</SelectItem>
                    <SelectItem value="subsidiary">Tochtergesellschaft</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="abgelaufen">Abgelaufen</SelectItem>
                    <SelectItem value="strittig">Strittig</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Scope-Detail"><Input value={form.scope_detail} onChange={e => setForm({ ...form, scope_detail: e.target.value })} placeholder="z.B. Siemens Energy Deutschland" className="h-8 text-xs" /></Field>
            <Field label="Gültig bis"><Input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} className="h-8 text-xs" /></Field>
            <Field label="Notizen"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="text-xs min-h-[60px]" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} size="sm" className="h-8 text-xs">Abbrechen</Button>
            <Button onClick={create} size="sm" className="h-8 text-xs">Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>
);
