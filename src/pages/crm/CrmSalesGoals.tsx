import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { CrmSettingsTabs } from '@/components/crm/CrmSettingsTabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Target } from 'lucide-react';
import { toast } from 'sonner';

type Goal = {
  id: string; owner_id: string | null; period_year: number; period_month: number | null;
  metric: string; target_value: number; notes: string | null;
};
type Profile = { id: string; first_name: string | null; last_name: string | null; email: string };

const METRIC_LABEL: Record<string, string> = {
  revenue: 'Umsatz (Won)', won_count: 'Anzahl Won-Deals', pipeline: 'Pipeline-Wert',
};
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function CrmSalesGoals() {
  const { user, isAdmin } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ owner_id: string; period_month: string; metric: string; target_value: string; notes: string }>({
    owner_id: '__team', period_month: '__year', metric: 'revenue', target_value: '', notes: '',
  });

  const load = async () => {
    const [g, p] = await Promise.all([
      supabase.from('crm_sales_goals').select('*').eq('period_year', year).order('period_month'),
      supabase.from('users_profile').select('id,first_name,last_name,email').order('first_name'),
    ]);
    setGoals((g.data as Goal[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
  };
  useEffect(() => { void load(); }, [year]);

  const ownerLabel = (id: string | null) => {
    if (!id) return 'Team-Gesamt';
    const p = profiles.find(x => x.id === id);
    return p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.email) : id.slice(0, 8);
  };

  const save = async () => {
    if (!form.target_value || Number(form.target_value) <= 0) { toast.error('Zielwert > 0 erforderlich'); return; }
    const payload = {
      owner_id: form.owner_id === '__team' ? null : form.owner_id,
      period_year: year,
      period_month: form.period_month === '__year' ? null : Number(form.period_month),
      metric: form.metric,
      target_value: Number(form.target_value),
      notes: form.notes || null,
      created_by: user?.id,
    };
    const { error } = await supabase.from('crm_sales_goals').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Ziel gespeichert');
    setOpen(false);
    setForm({ owner_id: '__team', period_month: '__year', metric: 'revenue', target_value: '', notes: '' });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm('Ziel löschen?')) return;
    const { error } = await supabase.from('crm_sales_goals').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  return (
    <CrmLayout>
      <div className="p-6 max-w-[1200px]">
        <CrmSettingsTabs />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Target className="h-4 w-4" />Vertriebsziele {year}</h1>
            <p className="text-xs text-muted-foreground mt-1">Jahres- oder Monatsziele pro Owner oder fürs gesamte Team.</p>
          </div>
          <div className="flex gap-2 items-center">
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year + 1, year, year - 1, year - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" />Neues Ziel</Button>
            )}
          </div>
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="text-left p-2">Owner</th>
                <th className="text-left p-2">Zeitraum</th>
                <th className="text-left p-2">Metrik</th>
                <th className="text-right p-2">Zielwert</th>
                <th className="text-left p-2">Notiz</th>
                {isAdmin && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {goals.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} className="p-6 text-center text-muted-foreground">Noch keine Ziele für {year}.</td></tr>
              )}
              {goals.map(g => (
                <tr key={g.id} className="border-t border-border/40">
                  <td className="p-2 text-foreground">{ownerLabel(g.owner_id)}</td>
                  <td className="p-2 text-muted-foreground">{g.period_month ? `${MONTHS[g.period_month - 1]} ${year}` : `Jahr ${year}`}</td>
                  <td className="p-2 text-muted-foreground">{METRIC_LABEL[g.metric]}</td>
                  <td className="p-2 text-right tabular-nums font-medium">
                    {g.metric === 'won_count'
                      ? `${Number(g.target_value).toLocaleString('de-DE')} Deals`
                      : Number(g.target_value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                  </td>
                  <td className="p-2 text-muted-foreground">{g.notes || '—'}</td>
                  {isAdmin && (
                    <td className="p-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(g.id)}>
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
            <DialogHeader><DialogTitle>Neues Vertriebsziel</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Owner</Label>
                <Select value={form.owner_id} onValueChange={v => setForm({ ...form, owner_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__team">Team-Gesamt</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ') || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Zeitraum</Label>
                  <Select value={form.period_month} onValueChange={v => setForm({ ...form, period_month: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__year">Ganzes Jahr {year}</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m} {year}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Metrik</Label>
                  <Select value={form.metric} onValueChange={v => setForm({ ...form, metric: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(METRIC_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Zielwert {form.metric === 'won_count' ? '(Anzahl Deals)' : '(€)'}</Label>
                <Input type="number" value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notiz (optional)</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-9" />
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
