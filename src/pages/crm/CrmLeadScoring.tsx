import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { CrmSettingsTabs } from '@/components/crm/CrmSettingsTabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Zap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type Rule = {
  id: string; name: string; field: string; operator: string;
  value: string | null; points: number; is_active: boolean;
};

const FIELD_LABEL: Record<string, string> = {
  country: 'Land', industry: 'Branche', source: 'Quelle',
  email_domain: 'E-Mail-Domain', website: 'Website',
  has_phone: 'Telefon vorhanden', company_name_contains: 'Firmenname enthält',
};
const OP_LABEL: Record<string, string> = {
  equals: 'gleich', contains: 'enthält', not_empty: 'nicht leer', in: 'in Liste (Komma)',
};

const empty = (): Partial<Rule> => ({
  name: '', field: 'country', operator: 'equals', value: '', points: 10, is_active: true,
});

export default function CrmLeadScoring() {
  const { isAdmin, user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<Rule>>(empty());
  const [recalcBusy, setRecalcBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('crm_lead_scoring_rules').select('*').order('created_at');
    setRules((data as Rule[]) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!edit.name?.trim()) { toast.error('Name erforderlich'); return; }
    const payload: any = {
      name: edit.name, field: edit.field, operator: edit.operator,
      value: edit.operator === 'not_empty' ? null : (edit.value || null),
      points: Number(edit.points ?? 0), is_active: edit.is_active ?? true,
    };
    if (!edit.id) payload.created_by = user?.id;
    const q = edit.id
      ? supabase.from('crm_lead_scoring_rules').update(payload).eq('id', edit.id)
      : supabase.from('crm_lead_scoring_rules').insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success('Regel gespeichert');
    setOpen(false); setEdit(empty()); void load();
  };

  const remove = async (id: string) => {
    if (!confirm('Regel löschen?')) return;
    const { error } = await supabase.from('crm_lead_scoring_rules').delete().eq('id', id);
    if (error) toast.error(error.message); else void load();
  };

  const toggle = async (r: Rule) => {
    await supabase.from('crm_lead_scoring_rules').update({ is_active: !r.is_active }).eq('id', r.id);
    void load();
  };

  // Force-recompute every lead score by no-op update (triggers recompute trigger).
  const recalcAll = async () => {
    if (!confirm('Alle Lead-Scores jetzt neu berechnen? Das kann bei vielen Leads kurz dauern.')) return;
    setRecalcBusy(true);
    try {
      const { data: ids } = await supabase.from('leads').select('id').limit(10000);
      if (!ids || ids.length === 0) { toast.info('Keine Leads vorhanden'); return; }
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        await Promise.all(chunk.map(({ id }) =>
          supabase.from('leads').update({ updated_at: new Date().toISOString() }).eq('id', id)
        ));
      }
      toast.success(`${ids.length} Leads neu bewertet`);
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <CrmLayout>
      <div className="p-6 max-w-[1200px]">
        <CrmSettingsTabs />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Zap className="h-4 w-4" />Lead-Scoring</h1>
            <p className="text-xs text-muted-foreground mt-1">Punktevergabe pro Kriterium. Score wird automatisch beim Anlegen/Bearbeiten berechnet.</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" onClick={recalcAll} disabled={recalcBusy} className="h-8 text-xs gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${recalcBusy ? 'animate-spin' : ''}`} /> Scores neu berechnen
                </Button>
                <Button size="sm" onClick={() => { setEdit(empty()); setOpen(true); }} className="h-8 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Neue Regel
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="text-left p-2 w-16">Aktiv</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Feld</th>
                <th className="text-left p-2">Operator</th>
                <th className="text-left p-2">Wert</th>
                <th className="text-right p-2">Punkte</th>
                {isAdmin && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="p-6 text-center text-muted-foreground">
                  Noch keine Regeln. Beispiel: „Land = DE → 20 Punkte", „E-Mail-Domain enthält gmail.com → −10 Punkte".
                </td></tr>
              )}
              {rules.map(r => (
                <tr key={r.id} className="border-t border-border/40 cursor-pointer hover:bg-muted/20"
                  onClick={() => isAdmin && (setEdit(r), setOpen(true))}>
                  <td className="p-2" onClick={e => e.stopPropagation()}>
                    <Switch checked={r.is_active} onCheckedChange={() => toggle(r)} disabled={!isAdmin} />
                  </td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-muted-foreground">{FIELD_LABEL[r.field]}</td>
                  <td className="p-2 text-muted-foreground">{OP_LABEL[r.operator]}</td>
                  <td className="p-2 text-muted-foreground">{r.value ?? '—'}</td>
                  <td className="p-2 text-right tabular-nums font-medium">
                    <span className={r.points >= 0 ? 'text-emerald-500' : 'text-destructive'}>
                      {r.points >= 0 ? '+' : ''}{r.points}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="p-2" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{edit.id ? 'Regel bearbeiten' : 'Neue Scoring-Regel'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Name</Label>
                <Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} className="h-9" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Feld</Label>
                  <Select value={edit.field} onValueChange={v => setEdit({ ...edit, field: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(FIELD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Operator</Label>
                  <Select value={edit.operator} onValueChange={v => setEdit({ ...edit, operator: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(OP_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {edit.operator !== 'not_empty' && (
                <div className="space-y-1"><Label className="text-xs">Wert</Label>
                  <Input value={edit.value ?? ''} onChange={e => setEdit({ ...edit, value: e.target.value })} className="h-9"
                    placeholder={edit.operator === 'in' ? 'DE, AT, CH' : ''} /></div>
              )}
              <div className="space-y-1"><Label className="text-xs">Punkte (negativ erlaubt)</Label>
                <Input type="number" value={edit.points ?? 0} onChange={e => setEdit({ ...edit, points: Number(e.target.value) })} className="h-9" /></div>
              <div className="flex items-center gap-2">
                <Switch checked={edit.is_active ?? true} onCheckedChange={v => setEdit({ ...edit, is_active: v })} />
                <Label className="text-xs">Aktiv</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button size="sm" onClick={save}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
