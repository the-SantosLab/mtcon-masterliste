import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';

const empty = { visit_date: new Date().toISOString().slice(0, 10), participants: '', purpose: '', result: '', next_steps: '' };

export function VisitReports({ companyId, dealId }: { companyId?: string | null; dealId?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<any>(empty);
  const [open, setOpen] = useState(false);

  const load = async () => {
    let q = supabase.from('crm_visit_reports').select('*').order('visit_date', { ascending: false });
    q = dealId ? q.eq('deal_id', dealId) : q.eq('company_id', companyId!);
    const { data } = await q;
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, [companyId, dealId]);

  const save = async () => {
    if (!form.purpose.trim() && !form.result.trim()) return toast.error('Anlass oder Ergebnis angeben');
    const { error } = await supabase.from('crm_visit_reports').insert({ ...form, company_id: companyId ?? null, deal_id: dealId ?? null });
    if (error) return toast.error(error.message);
    toast.success('Besuchsbericht gespeichert'); setForm(empty); setOpen(false); void load();
  };
  const del = async (id: string) => { await supabase.from('crm_visit_reports').delete().eq('id', id); void load(); };

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Besuchsberichte</h3>
        <Button size="sm" variant={open ? 'ghost' : 'default'} className="h-8 text-xs gap-1" onClick={() => setOpen(o => !o)}>{open ? 'Abbrechen' : <><Plus className="h-3 w-3" />Neuer Bericht</>}</Button>
      </div>
      {open && (
        <div className="glass-card rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Besuchsdatum</Label><Input type="date" value={form.visit_date} onChange={e => setForm({ ...form, visit_date: e.target.value })} className="h-8 text-xs" /></div>
          <div className="space-y-1"><Label className="text-xs">Teilnehmer</Label><Input value={form.participants} onChange={e => setForm({ ...form, participants: e.target.value })} className="h-8 text-xs" /></div>
          <div className="space-y-1 md:col-span-2"><Label className="text-xs">Anlass</Label><Textarea rows={2} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="text-xs" /></div>
          <div className="space-y-1 md:col-span-2"><Label className="text-xs">Ergebnis / Gesprächsinhalt</Label><Textarea rows={4} value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} className="text-xs" /></div>
          <div className="space-y-1 md:col-span-2"><Label className="text-xs">Nächste Schritte</Label><Textarea rows={2} value={form.next_steps} onChange={e => setForm({ ...form, next_steps: e.target.value })} className="text-xs" /></div>
          <Button size="sm" className="h-8 text-xs md:col-span-2" onClick={save}>Speichern</Button>
        </div>
      )}
      {rows.length === 0 && !open && <p className="text-xs text-muted-foreground">Noch keine Besuchsberichte.</p>}
      {rows.map(r => (
        <div key={r.id} className="glass-card rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between items-start">
            <p className="font-semibold">{new Date(r.visit_date).toLocaleDateString('de-DE')}{r.participants ? ` · ${r.participants}` : ''}</p>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => del(r.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
          {r.purpose && <p><span className="text-muted-foreground">Anlass: </span>{r.purpose}</p>}
          {r.result && <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Ergebnis: </span>{r.result}</p>}
          {r.next_steps && <p><span className="text-muted-foreground">Nächste Schritte: </span>{r.next_steps}</p>}
        </div>
      ))}
    </div>
  );
}
