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
type Profile = { id: string; display_name: string };

const METRIC_LABEL: Record<string, string> = {
  revenue: 'Umsatz (Won)', won_count: 'Anzahl Won-Deals', pipeline: 'Pipeline-Wert',
  activities_done: 'Erledigte Aktivitäten', deals_created: 'Neue Deals',
};
const COUNT_METRICS = ['won_count', 'activities_done', 'deals_created'];
const fmtVal = (metric: string, v: number) => COUNT_METRICS.includes(metric)
  ? v.toLocaleString('de-DE')
  : v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
type DealRow = { owner_id: string | null; stage: string; value_estimated: number | null; value_final: number | null; won_at: string | null; created_at: string };
type ActRow = { owner_id: string | null; completed_by: string | null; completed_at: string };
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function CrmSalesGoals() {
  const { user, isAdmin } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [acts, setActs] = useState<ActRow[]>([]);
  const [form, setForm] = useState<{ owner_id: string; period_month: string; metric: string; target_value: string; notes: string }>({
    owner_id: '__team', period_month: '__year', metric: 'revenue', target_value: '', notes: '',
  });

  const load = async () => {
    const from = `${year}-01-01`, to = `${year + 1}-01-01`;
    const [dl, ac] = await Promise.all([
      supabase.from('deals').select('owner_id, stage, value_estimated, value_final, won_at, created_at').limit(10000),
      supabase.from('crm_activities').select('owner_id, completed_by, completed_at').gte('completed_at', from).lt('completed_at', to).limit(20000),
    ]);
    setDeals((dl.data as DealRow[]) ?? []);
    setActs((ac.data as ActRow[]) ?? []);
    const [g, p] = await Promise.all([
      supabase.from('crm_sales_goals').select('*').eq('period_year', year).order('period_month'),
      supabase.from('users_profile').select('id,display_name').eq('active', true).order('display_name'),
    ]);
    setGoals((g.data as Goal[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
  };
  useEffect(() => { void load(); }, [year]);

  const ownerLabel = (id: string | null) => {
    if (!id) return 'Team-Gesamt';
    const p = profiles.find(x => x.id === id);
    return p?.display_name ?? id.slice(0, 8);
  };

  const inPeriod = (iso: string | null, month: number | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === year && (month == null || d.getMonth() + 1 === month);
  };
  const actual = (metric: string, owner: string | null, month: number | null) => {
    const ds = deals.filter(d => !owner || d.owner_id === owner);
    switch (metric) {
      case 'revenue': return ds.filter(d => d.stage === 'won' && inPeriod(d.won_at, month)).reduce((a, d) => a + Number(d.value_final ?? 0), 0);
      case 'won_count': return ds.filter(d => d.stage === 'won' && inPeriod(d.won_at, month)).length;
      case 'pipeline': return ds.filter(d => !['won', 'lost'].includes(d.stage)).reduce((a, d) => a + Number(d.value_estimated ?? 0), 0);
      case 'deals_created': return ds.filter(d => inPeriod(d.created_at, month)).length;
      case 'activities_done': return acts.filter(a => (!owner || (a.completed_by ?? a.owner_id) === owner) && inPeriod(a.completed_at, month)).length;
      default: return 0;
    }
  };
  // Expected progress for the elapsed part of the period (linear)
  const expectedShare = (month: number | null) => {
    const now = new Date();
    if (now.getFullYear() < year) return 0;
    if (now.getFullYear() > year) return 1;
    if (month == null) return (now.getMonth() + now.getDate() / 31) / 12;
    if (now.getMonth() + 1 < month) return 0;
    if (now.getMonth() + 1 > month) return 1;
    return now.getDate() / new Date(year, month, 0).getDate();
  };
  const leaderboard = profiles
    .map(p => ({
      p,
      revenue: actual('revenue', p.id, null),
      won: actual('won_count', p.id, null),
      pipeline: actual('pipeline', p.id, null),
      acts: actual('activities_done', p.id, null),
      created: actual('deals_created', p.id, null),
    }))
    .filter(r => r.revenue || r.won || r.pipeline || r.acts || r.created)
    .sort((a, b) => b.revenue - a.revenue || b.pipeline - a.pipeline);

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
            <p className="text-xs text-muted-foreground mt-1">Jahres- oder Monatsziele pro Vertriebler oder fürs Team – mit Ist-Stand und Fortschritt. Der Strich zeigt, wo man heute stehen sollte.</p>
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
                <th className="text-right p-2">Ist</th>
                <th className="text-left p-2 w-[220px]">Fortschritt</th>
                <th className="text-left p-2">Notiz</th>
                {isAdmin && <th className="w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {goals.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="p-6 text-center text-muted-foreground">Noch keine Ziele für {year}.</td></tr>
              )}
              {goals.map(g => (
                <tr key={g.id} className="border-t border-border/40">
                  <td className="p-2 text-foreground">{ownerLabel(g.owner_id)}</td>
                  <td className="p-2 text-muted-foreground">{g.period_month ? `${MONTHS[g.period_month - 1]} ${year}` : `Jahr ${year}`}</td>
                  <td className="p-2 text-muted-foreground">{METRIC_LABEL[g.metric]}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtVal(g.metric, Number(g.target_value))}</td>
                  {(() => {
                    const ist = actual(g.metric, g.owner_id, g.period_month);
                    const pct = g.target_value > 0 ? (ist / Number(g.target_value)) * 100 : 0;
                    const exp = g.metric === 'pipeline' ? 1 : expectedShare(g.period_month);
                    const onTrack = pct >= exp * 100 - 0.5;
                    return (
                      <>
                        <td className="p-2 text-right tabular-nums">{fmtVal(g.metric, ist)}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 flex-1 rounded bg-muted/60 overflow-hidden">
                              <div className={onTrack ? 'h-full bg-primary' : 'h-full bg-destructive'} style={{ width: `${Math.min(100, pct)}%` }} />
                              {g.metric !== 'pipeline' && exp > 0 && exp < 1 && (
                                <div className="absolute top-0 h-full w-px bg-foreground/60" style={{ left: `${exp * 100}%` }} title="Soll zum heutigen Tag" />
                              )}
                            </div>
                            <span className={`tabular-nums text-[11px] w-10 text-right ${onTrack ? 'text-foreground' : 'text-destructive'}`}>{Math.round(pct)} %</span>
                          </div>
                        </td>
                      </>
                    );
                  })()}
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

        <h2 className="text-sm font-semibold mt-6 mb-1">Bericht pro Vertriebler {year}</h2>
        <p className="text-xs text-muted-foreground mb-3">Umsatz und Abschlüsse im Jahr, aktuelle offene Pipeline, erledigte Aktivitäten und neu angelegte Deals.</p>
        <Card className="border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="text-left p-2">Vertriebler</th>
                <th className="text-right p-2">Umsatz (Won)</th>
                <th className="text-right p-2">Won-Deals</th>
                <th className="text-right p-2">Offene Pipeline</th>
                <th className="text-right p-2">Aktivitäten</th>
                <th className="text-right p-2">Neue Deals</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Keine Vertriebsdaten für {year}.</td></tr>}
              {leaderboard.map(r => (
                <tr key={r.p.id} className="border-t border-border/40">
                  <td className="p-2 text-foreground">{r.p.display_name}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{fmtVal('revenue', r.revenue)}</td>
                  <td className="p-2 text-right tabular-nums">{r.won}</td>
                  <td className="p-2 text-right tabular-nums">{fmtVal('pipeline', r.pipeline)}</td>
                  <td className="p-2 text-right tabular-nums">{r.acts}</td>
                  <td className="p-2 text-right tabular-nums">{r.created}</td>
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
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
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
                <Label className="text-xs">Zielwert {COUNT_METRICS.includes(form.metric) ? '(Anzahl)' : '(€)'}</Label>
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
