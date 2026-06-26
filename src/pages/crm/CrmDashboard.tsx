import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { formatEUR, STAGES, stageColor, StageKey } from '@/lib/crm';
import { Briefcase, FileText, Trophy, TrendingUp, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid } from 'recharts';
import { toast } from 'sonner';

const FORECAST_WEIGHT: Partial<Record<StageKey, number>> = { anfrage: 0.1, qualifikation: 0.3, angebot_versendet: 0.5, verhandlung: 0.7, won: 1, lost: 0 };

export default function CrmDashboard() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => { void load(); }, [user?.id]);

  const load = async () => {
    const [{ data: d }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('deals').select('id, title, stage, value_estimated, value_final, stage_changed_at, owner_id, companies(name)'),
      supabase.from('offers').select('id, status, sent_at'),
      supabase.from('crm_activities').select('*, deals(title)').is('completed_at', null),
    ]);
    setDeals(d ?? []); setOffers(o ?? []); setActivities(a ?? []);
  };

  const open = deals.filter(d => !['won', 'lost'].includes(d.stage));
  const won = deals.filter(d => d.stage === 'won');
  const lost = deals.filter(d => d.stage === 'lost');
  const pipelineValue = open.reduce((s, d) => s + Number(d.value_estimated ?? 0), 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthWon = won.filter(d => new Date(d.stage_changed_at) >= monthStart).reduce((s, d) => s + Number(d.value_final ?? 0), 0);
  const monthForecast = monthWon + open.filter(d => d.stage === 'verhandlung').reduce((s, d) => s + Number(d.value_estimated ?? 0) * 0.7, 0);
  const sentOpen = offers.filter(o => o.status === 'versendet').length;
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;

  const chartData = useMemo(() => {
    const months: { key: string; label: string; actual: number; forecast: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months.push({ key, label: d.toLocaleDateString('de-DE', { month: 'short' }), actual: 0, forecast: 0 });
    }
    for (const d of won) {
      const dt = new Date(d.stage_changed_at);
      const k = `${dt.getFullYear()}-${dt.getMonth()}`;
      const m = months.find(x => x.key === k); if (m) m.actual += Number(d.value_final ?? 0);
    }
    // forecast for current month
    const cur = months[months.length - 1];
    cur.forecast = open.reduce((s, d) => s + Number(d.value_estimated ?? 0) * (FORECAST_WEIGHT[d.stage as StageKey] ?? 0), 0);
    return months;
  }, [deals]);

  const funnel = STAGES.filter(s => !['won', 'lost'].includes(s.key)).map((s, i, arr) => {
    const stageDeals = deals.filter(d => d.stage === s.key);
    const value = stageDeals.reduce((sum, d) => sum + Number(d.value_estimated ?? 0), 0);
    let conv: number | null = null;
    if (i === arr.length - 1) {
      const totalAfter = won.length + lost.length;
      conv = totalAfter ? Math.round((won.length / totalAfter) * 100) : null;
    }
    return { ...s, count: stageDeals.length, value, conv };
  });

  const stuckDeals = open.filter(d => Date.now() - new Date(d.stage_changed_at).getTime() > 14 * 86400000);

  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const myToday = activities.filter(a => a.owner_id === user?.id && a.due_at && new Date(a.due_at) <= todayEnd);

  const toggleDone = async (a: any) => {
    const { error } = await supabase.from('crm_activities').update({ completed_at: new Date().toISOString(), completed_by: user?.id }).eq('id', a.id);
    if (error) toast.error(error.message); else void load();
  };

  const KPI = ({ label, value, icon: Icon, color }: any) => (
    <div className="crm-kpi" style={{ ['--kpi-accent' as any]: color }}>
      <div className="flex items-center justify-between mb-2 relative z-10">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <p className="text-2xl font-semibold tabular-nums relative z-10" style={{ color }}>{value}</p>
    </div>
  );

  return (
    <CrmLayout>
      <div className="crm-surface">
        <div className="crm-hero mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">CRM-Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-1">Pipeline, Forecast und tägliche Aktivitäten auf einen Blick.</p>
          </div>
          <Link to="/crm/forecast" className="text-xs px-3 py-1.5 rounded-md border border-border/60 hover:bg-card/60 transition-colors flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Forecast & Pipeline-Analytics
          </Link>
        </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI label="Pipeline-Wert" value={formatEUR(pipelineValue)} icon={Briefcase} color="hsl(var(--status-open))" />
        <KPI label="Forecast Monat" value={formatEUR(monthForecast)} icon={TrendingUp} color="hsl(var(--status-working))" />
        <KPI label="Angebote offen" value={sentOpen} icon={FileText} color="hsl(var(--status-overdue))" />
        <KPI label="Won-Rate" value={`${winRate}%`} icon={Trophy} color="hsl(var(--status-done))" />
      </div>


      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <section className="crm-glass p-5">
          <h2 className="crm-section-title mb-3">Forecast — letzte 6 Monate</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatEUR(Number(v))} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11, borderRadius: 10 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="actual" name="Tatsächlich" fill="hsl(var(--status-done))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="forecast" name="Forecast" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="crm-glass p-5">
          <h2 className="crm-section-title mb-3">Pipeline-Funnel</h2>
          <ul className="space-y-1.5">
            {funnel.map(s => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: stageColor(s.key as StageKey), boxShadow: `0 0 8px ${stageColor(s.key as StageKey)}` }} />
                <span className="text-xs flex-1">{s.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{s.count} · {formatEUR(s.value)}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 pt-2 border-t border-border/50">
              <span className="text-xs flex-1 text-muted-foreground">Angebot → Won</span>
              <span className="text-xs font-semibold tabular-nums">{winRate}%</span>
            </li>
          </ul>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="crm-glass p-5">
          <h2 className="crm-section-title mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Engpass — &gt;14 Tage in Stage
          </h2>
          {stuckDeals.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Engpässe.</p>
          ) : (
            <ul className="space-y-1">
              {stuckDeals.slice(0, 8).map(d => (
                <li key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                  <Link to={`/crm/deals/${d.id}`} className="text-foreground hover:text-primary truncate">{d.title}</Link>
                  <span className="text-muted-foreground">{STAGES.find(s => s.key === d.stage)?.label} · {Math.floor((Date.now() - new Date(d.stage_changed_at).getTime()) / 86400000)}d</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="crm-glass p-5">
          <h2 className="crm-section-title mb-3">Meine Aktivitäten heute</h2>
          {myToday.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nichts offen.</p>
          ) : (
            <ul className="space-y-1">
              {myToday.map(a => (
                <li key={a.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
                  <Checkbox checked={false} onCheckedChange={() => toggleDone(a)} />
                  <span className="flex-1 truncate text-foreground">{a.subject}</span>
                  {a.deals && <Link to={`/crm/deals/${a.deal_id}`} className="text-muted-foreground hover:text-primary text-[11px]">{a.deals.title}</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      </div>
    </CrmLayout>
  );
}

