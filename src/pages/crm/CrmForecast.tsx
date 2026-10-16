import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Target, Timer, Award, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell } from 'recharts';
import { cn } from '@/lib/utils';

type Deal = {
  id: string;
  title: string;
  stage: string;
  value_estimated: number | null;
  value_final: number | null;
  currency: string;
  owner_id: string | null;
  company_id: string | null;
  companies?: { name: string | null } | null;
  lead_source: string | null;
  probability_override: number | null;
  expected_close_date: string | null;
  stage_changed_at: string;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
};
type StageProb = { stage: string; probability: number };
type Profile = { id: string; display_name: string };
type Goal = {
  id: string; owner_id: string | null; period_year: number; period_month: number | null;
  metric: string; target_value: number;
};

const STAGE_LABEL: Record<string, string> = {
  anfrage: 'Anfrage', qualifikation: 'Qualifikation', angebot_versendet: 'Angebot versendet',
  verhandlung: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren',
};
const STAGE_COLOR: Record<string, string> = {
  anfrage: 'hsl(217 91% 60%)', qualifikation: 'hsl(45 93% 58%)',
  angebot_versendet: 'hsl(280 65% 60%)', verhandlung: 'hsl(25 95% 53%)',
  won: 'hsl(142 71% 45%)', lost: 'hsl(0 84% 60%)',
};
const fmtEUR = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function CrmForecast() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stageProbs, setStageProbs] = useState<StageProb[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [params, setParams] = useSearchParams();
  const companyFilter = params.get('company') || 'all';
  const setCompanyFilter = (v: string) => { const n = new URLSearchParams(params); if (v === 'all') n.delete('company'); else n.set('company', v); setParams(n, { replace: true }); };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [d, sp, p, g] = await Promise.all([
        supabase.from('deals').select('id,title,stage,value_estimated,value_final,currency,owner_id,company_id,companies(name),lead_source,probability_override,expected_close_date,stage_changed_at,won_at,lost_at,created_at').limit(5000),
        supabase.from('crm_stage_probabilities').select('*'),
        supabase.from('users_profile').select('id,display_name').eq('active', true).order('display_name'),
        supabase.from('crm_sales_goals').select('*').eq('period_year', year),
      ]);
      if (!alive) return;
      setDeals((d.data as Deal[]) ?? []);
      setStageProbs((sp.data as StageProb[]) ?? []);
      setProfiles((p.data as Profile[]) ?? []);
      setGoals((g.data as Goal[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [year]);

  const probMap = useMemo(() => {
    const m = new Map<string, number>();
    stageProbs.forEach(s => m.set(s.stage, Number(s.probability)));
    return m;
  }, [stageProbs]);

  const ownerLabel = (id: string | null) => {
    if (!id) return 'Unzugewiesen';
    const p = profiles.find(x => x.id === id);
    return p?.display_name ?? id.slice(0, 8);
  };

  const dealsFiltered = useMemo(() => {
    return deals.filter(d => (ownerFilter === 'all' || d.owner_id === ownerFilter) && (companyFilter === 'all' || (companyFilter === '__none' ? !d.company_id : d.company_id === companyFilter)));
  }, [deals, ownerFilter, companyFilter]);

  const companyOptions = useMemo(() => {
    const m = new Map<string, string>();
    deals.forEach(d => { if (d.company_id) m.set(d.company_id, d.companies?.name || 'Ohne Namen'); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }, [deals]);
  const [companySearch, setCompanySearch] = useState('');

  // Forecast: open pipeline weighted by probability
  const forecast = useMemo(() => {
    let weighted = 0, total = 0;
    const byStage = new Map<string, { count: number; value: number; weighted: number }>();
    for (const d of dealsFiltered) {
      if (d.stage === 'won' || d.stage === 'lost') continue;
      const v = Number(d.value_estimated ?? d.value_final ?? 0);
      const prob = (d.probability_override ?? probMap.get(d.stage) ?? 0) / 100;
      weighted += v * prob;
      total += v;
      const e = byStage.get(d.stage) ?? { count: 0, value: 0, weighted: 0 };
      e.count += 1; e.value += v; e.weighted += v * prob;
      byStage.set(d.stage, e);
    }
    return { weighted, total, byStage };
  }, [dealsFiltered, probMap]);

  // Won this year
  const wonThisYear = useMemo(() => {
    let revenue = 0, count = 0;
    for (const d of dealsFiltered) {
      if (d.stage !== 'won' || !d.won_at) continue;
      const dt = new Date(d.won_at);
      if (dt.getFullYear() !== year) continue;
      revenue += Number(d.value_final ?? d.value_estimated ?? 0);
      count += 1;
    }
    return { revenue, count };
  }, [dealsFiltered, year]);

  // Win rate (overall + per owner)
  const winRate = useMemo(() => {
    const total = dealsFiltered.filter(d => d.stage === 'won' || d.stage === 'lost').length;
    const won = dealsFiltered.filter(d => d.stage === 'won').length;
    const rate = total > 0 ? (won / total) * 100 : 0;
    const perOwner = new Map<string, { won: number; lost: number }>();
    for (const d of dealsFiltered) {
      if (d.stage !== 'won' && d.stage !== 'lost') continue;
      const k = d.owner_id ?? '__none';
      const e = perOwner.get(k) ?? { won: 0, lost: 0 };
      if (d.stage === 'won') e.won += 1; else e.lost += 1;
      perOwner.set(k, e);
    }
    const owners = Array.from(perOwner.entries())
      .map(([id, v]) => ({ id, label: ownerLabel(id === '__none' ? null : id), won: v.won, lost: v.lost, rate: (v.won + v.lost) > 0 ? (v.won / (v.won + v.lost)) * 100 : 0 }))
      .sort((a, b) => b.rate - a.rate);
    return { rate, won, lost: total - won, perOwner: owners };
  }, [dealsFiltered, profiles]);

  // Pipeline velocity: avg days from created_at to won_at
  const velocity = useMemo(() => {
    const won = dealsFiltered.filter(d => d.stage === 'won' && d.won_at);
    if (won.length === 0) return { avgDays: 0, count: 0, perSource: [] as { source: string; avg: number; n: number }[] };
    let totalDays = 0;
    const bySource = new Map<string, { sum: number; n: number }>();
    for (const d of won) {
      const days = Math.max(0, (new Date(d.won_at!).getTime() - new Date(d.created_at).getTime()) / 86400000);
      totalDays += days;
      const s = d.lead_source ?? 'unbekannt';
      const e = bySource.get(s) ?? { sum: 0, n: 0 };
      e.sum += days; e.n += 1;
      bySource.set(s, e);
    }
    return {
      avgDays: totalDays / won.length, count: won.length,
      perSource: Array.from(bySource.entries()).map(([source, v]) => ({ source, avg: v.sum / v.n, n: v.n })).sort((a, b) => a.avg - b.avg),
    };
  }, [dealsFiltered]);

  // Sales goal progress (annual revenue goal for selected owner or team)
  const goalForOwner = useMemo(() => {
    const matchOwner = ownerFilter === 'all' ? null : ownerFilter;
    const annual = goals.find(g => g.owner_id === matchOwner && g.period_month === null && g.metric === 'revenue');
    if (!annual) return null;
    const progress = annual.target_value > 0 ? (wonThisYear.revenue / Number(annual.target_value)) * 100 : 0;
    return { target: Number(annual.target_value), progress: Math.min(100, progress), actualPct: progress };
  }, [goals, ownerFilter, wonThisYear]);

  const stageBars = useMemo(() => {
    const stages = ['anfrage', 'qualifikation', 'angebot_versendet', 'verhandlung'];
    return stages.map(s => {
      const e = forecast.byStage.get(s) ?? { count: 0, value: 0, weighted: 0 };
      return { stage: STAGE_LABEL[s], stageKey: s, count: e.count, value: Math.round(e.value), weighted: Math.round(e.weighted) };
    });
  }, [forecast]);

  return (
    <CrmLayout>
      <div className="p-6 space-y-6 max-w-[1600px]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> CRM · Pipeline-Forecast
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Forecast & Pipeline-Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Gewichteter Forecast aus offenen Deals × Stage-Wahrscheinlichkeit. Win-Rate, Velocity und Ziel-Tracking.
          </p>
        </div>

        <Card className="p-4 border border-border/50 bg-card/40 backdrop-blur-xl">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Jahr</label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[year + 1, year, year - 1, year - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[240px]">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Owner</label>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Owner</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[260px]">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Kunde</label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="h-9" aria-label="Kunde"><SelectValue placeholder="Alle Kunden" /></SelectTrigger>
                <SelectContent>
                  <div className="p-1"><input value={companySearch} onChange={e => setCompanySearch(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Kunde suchen" className="h-8 w-full rounded border border-input bg-background px-2 text-xs" /></div>
                  <SelectItem value="all">Alle Kunden</SelectItem>
                  <SelectItem value="__none">Ohne Kunde</SelectItem>
                  {companyOptions.filter(([id, n]) => id === companyFilter || n.toLowerCase().includes(companySearch.toLowerCase())).map(([id, n]) => (
                    <SelectItem key={id} value={id}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Gewichteter Forecast" value={fmtEUR(forecast.weighted)} icon={<Target className="h-4 w-4" />} accent
                sub={`von ${fmtEUR(forecast.total)} Pipeline`} />
              <Kpi label={`Umsatz Won ${year}`} value={fmtEUR(wonThisYear.revenue)} icon={<Award className="h-4 w-4" />}
                sub={`${wonThisYear.count} Deals`} />
              <Kpi label="Win-Rate (entschieden)" value={`${winRate.rate.toFixed(1)} %`} icon={<TrendingUp className="h-4 w-4" />}
                sub={`${winRate.won} gewonnen / ${winRate.lost} verloren`} />
              <Kpi label="Ø Velocity (Won)" value={`${velocity.avgDays.toFixed(0)} Tage`} icon={<Timer className="h-4 w-4" />}
                sub={`${velocity.count} abgeschlossene Deals`} />
            </div>

            {goalForOwner && (
              <Card className="p-5 border border-border/50 bg-card/40 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium">Jahresziel {year}{ownerFilter !== 'all' && ` · ${ownerLabel(ownerFilter)}`}</div>
                    <div className="text-xs text-muted-foreground">{fmtEUR(wonThisYear.revenue)} von {fmtEUR(goalForOwner.target)}</div>
                  </div>
                  <Badge variant={goalForOwner.actualPct >= 100 ? 'default' : 'outline'} className="text-xs">
                    {goalForOwner.actualPct.toFixed(0)} %
                  </Badge>
                </div>
                <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
                  <div className={cn('h-full transition-all', goalForOwner.actualPct >= 100 ? 'bg-emerald-500' : 'bg-primary')}
                    style={{ width: `${Math.min(100, goalForOwner.actualPct)}%` }} />
                </div>
              </Card>
            )}

            <Card className="p-5 border border-border/50 bg-card/40 backdrop-blur-xl">
              <div className="mb-4">
                <div className="text-sm font-medium">Pipeline pro Stage</div>
                <div className="text-xs text-muted-foreground">Gesamtwert vs. gewichteter Forecast</div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageBars} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, n: any) => [fmtEUR(Number(v)), n === 'value' ? 'Gesamt' : 'Gewichtet']} />
                    <Bar dataKey="value" fill="hsl(var(--muted-foreground))" fillOpacity={0.4} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="weighted" radius={[4, 4, 0, 0]}>
                      {stageBars.map(s => <Cell key={s.stageKey} fill={STAGE_COLOR[s.stageKey]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="p-5 border border-border/50 bg-card/40 backdrop-blur-xl">
                <div className="mb-3">
                  <div className="text-sm font-medium">Win-Rate pro Owner</div>
                  <div className="text-xs text-muted-foreground">Entschiedene Deals (Won + Lost)</div>
                </div>
                <div className="space-y-2">
                  {winRate.perOwner.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">Keine entschiedenen Deals</div>}
                  {winRate.perOwner.map(o => (
                    <div key={o.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground">{o.label}</span>
                        <span className="text-muted-foreground tabular-nums">{o.won}/{o.won + o.lost} · {o.rate.toFixed(0)} %</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${o.rate}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5 border border-border/50 bg-card/40 backdrop-blur-xl">
                <div className="mb-3">
                  <div className="text-sm font-medium">Velocity pro Lead-Quelle</div>
                  <div className="text-xs text-muted-foreground">Ø Tage bis Won</div>
                </div>
                <div className="space-y-2">
                  {velocity.perSource.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">Noch keine Won-Deals</div>}
                  {velocity.perSource.map(s => (
                    <div key={s.source} className="flex justify-between text-xs border-b border-border/40 py-1.5 last:border-0">
                      <span className="capitalize text-foreground">{s.source}</span>
                      <span className="text-muted-foreground tabular-nums">{s.avg.toFixed(0)} Tage · n={s.n}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </CrmLayout>
  );
}

function Kpi({ label, value, icon, accent, sub }: { label: string; value: string; icon: React.ReactNode; accent?: boolean; sub?: string }) {
  return (
    <Card className={cn('p-4 border border-border/50 backdrop-blur-xl', accent ? 'bg-gradient-to-br from-primary/10 via-card/40 to-card/20' : 'bg-card/40')}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        <span className={cn(accent && 'text-primary')}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-2">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
