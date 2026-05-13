import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { formatEUR } from '@/lib/crm';
import { Briefcase, FileText, Trophy, TrendingUp } from 'lucide-react';

interface Kpi { open: number; sent: number; wonWeek: number; pipeline: number; }

export default function CrmDashboard() {
  const { user } = useAuth();
  const [kpi, setKpi] = useState<Kpi>({ open: 0, sent: 0, wonWeek: 0, pipeline: 0 });
  const [overdueActs, setOverdueActs] = useState<any[]>([]);
  const [staleDeals, setStaleDeals] = useState<any[]>([]);

  useEffect(() => { void load(); }, [user?.id]);

  const load = async () => {
    const [{ data: deals }, { data: offers }, { data: acts }] = await Promise.all([
      supabase.from('deals').select('id, title, stage, value_estimated, value_final, stage_changed_at, owner_id, companies(name)'),
      supabase.from('offers').select('id, status, sent_at'),
      supabase.from('crm_activities').select('id, subject, due_at, completed_at, deal_id, owner_id, deals(title)').eq('owner_id', user?.id ?? '').is('completed_at', null),
    ]);
    const all = deals ?? [];
    const open = all.filter(d => !['won','lost'].includes(d.stage)).length;
    const sent = (offers ?? []).filter(o => o.status === 'versendet').length;
    const weekAgo = Date.now() - 7 * 86400000;
    const wonWeek = all.filter(d => d.stage === 'won' && new Date(d.stage_changed_at).getTime() >= weekAgo).length;
    const pipeline = all.filter(d => !['won','lost'].includes(d.stage))
      .reduce((s, d) => s + Number(d.value_estimated ?? 0), 0);
    setKpi({ open, sent, wonWeek, pipeline });

    const today = new Date(); today.setHours(23,59,59,999);
    setOverdueActs((acts ?? []).filter(a => a.due_at && new Date(a.due_at) <= today));

    // Deals without activity 7+ days
    const dealIds = all.map(d => d.id);
    const { data: lastActs } = dealIds.length
      ? await supabase.from('crm_activities').select('deal_id, created_at').in('deal_id', dealIds).order('created_at', { ascending: false })
      : { data: [] as any[] };
    const lastByDeal = new Map<string, string>();
    for (const a of (lastActs ?? [])) if (!lastByDeal.has(a.deal_id)) lastByDeal.set(a.deal_id, a.created_at);
    const stale = all
      .filter(d => !['won','lost'].includes(d.stage))
      .filter(d => {
        const last = lastByDeal.get(d.id);
        const ref = last ? new Date(last).getTime() : new Date(d.stage_changed_at).getTime();
        return Date.now() - ref >= 7 * 86400000;
      })
      .slice(0, 8);
    setStaleDeals(stale);
  };

  const KPI = ({ label, value, icon: Icon }: any) => (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );

  return (
    <CrmLayout>
      <h1 className="text-xl font-semibold text-foreground mb-5">CRM-Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI label="Offene Deals" value={kpi.open} icon={Briefcase} />
        <KPI label="Angebote versendet" value={kpi.sent} icon={FileText} />
        <KPI label="Won (7 Tage)" value={kpi.wonWeek} icon={Trophy} />
        <KPI label="Pipeline-Wert" value={formatEUR(kpi.pipeline)} icon={TrendingUp} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-lg border border-border bg-card/60 backdrop-blur-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Meine offenen Aktivitäten</h2>
          {overdueActs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine fälligen Aktivitäten.</p>
          ) : (
            <ul className="space-y-1">
              {overdueActs.map(a => (
                <li key={a.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <Link to={a.deal_id ? `/crm/deals/${a.deal_id}` : '/crm/activities'} className="text-foreground hover:text-primary truncate">{a.subject}</Link>
                  <span className="text-muted-foreground tabular-nums">{a.due_at ? new Date(a.due_at).toLocaleDateString('de-DE') : '–'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card/60 backdrop-blur-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Deals ohne Aktivität (7+ Tage)</h2>
          {staleDeals.length === 0 ? (
            <p className="text-xs text-muted-foreground">Alle Deals sind aktuell.</p>
          ) : (
            <ul className="space-y-1">
              {staleDeals.map(d => (
                <li key={d.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <Link to={`/crm/deals/${d.id}`} className="text-foreground hover:text-primary truncate">{d.title}</Link>
                  <span className="text-muted-foreground">{(d as any).companies?.name ?? '–'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CrmLayout>
  );
}
