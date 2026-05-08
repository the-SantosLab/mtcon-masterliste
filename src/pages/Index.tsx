import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { ClipboardList, Clock, AlertTriangle, CalendarCheck, Calendar, ArrowRight, X, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };

type FilterKey = 'open' | 'in_progress' | 'overdue' | 'today' | 'week';

const FILTER_LABELS: Record<FilterKey, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  overdue: 'In Verzug',
  today: 'Heute fällig',
  week: 'Diese Woche fällig',
};

const KPI_DEFS: { key: FilterKey; title: string; icon: typeof ClipboardList }[] = [
  { key: 'open', title: 'Offen', icon: ClipboardList },
  { key: 'in_progress', title: 'In Arbeit', icon: Clock },
  { key: 'overdue', title: 'In Verzug', icon: AlertTriangle },
  { key: 'today', title: 'Heute Fällig', icon: CalendarCheck },
  { key: 'week', title: 'Diese Woche', icon: Calendar },
];

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCases = async () => {
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
      .order('created_at', { ascending: false });
    setCases((data as CaseRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCases();
    const ch = supabase.channel('dash-cases').on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const firstName = profile?.display_name?.split(' ')[0] ?? '';
  const initials = (profile?.display_name ?? '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const timeString = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const active = cases.filter(c => !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status));
  const counts: Record<FilterKey, number> = {
    open: active.filter(c => c.status === 'nicht_begonnen').length,
    in_progress: active.filter(c => ['in_arbeit', 'in_planung'].includes(c.status)).length,
    overdue: active.filter(c => c.status === 'in_verzug' || (c.due_at && c.due_at < today)).length,
    today: active.filter(c => c.due_at === today).length,
    week: active.filter(c => c.due_at && c.due_at >= today && c.due_at <= weekEnd).length,
  };

  const available = cases.filter(c => !c.assignee_id && !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).slice(0, 10);

  // Bar chart: cases created per weekday this week (Mo-Fr)
  const weekChart = useMemo(() => {
    const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
    const startOfWeek = new Date(now);
    const day = (startOfWeek.getDay() + 6) % 7; // Mo=0
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);
    const buckets = [0, 0, 0, 0, 0];
    cases.forEach(c => {
      if (!c.created_at) return;
      const d = new Date(c.created_at);
      const diff = Math.floor((d.getTime() - startOfWeek.getTime()) / 86400000);
      if (diff >= 0 && diff < 5) buckets[diff]++;
    });
    return labels.map((label, i) => ({ label, value: buckets[i] }));
  }, [cases, now]);

  const drilldownItems = useMemo(() => {
    if (!activeFilter) return [];
    let pool = active;
    if (scope === 'mine') pool = pool.filter(c => c.assignee_id === user?.id);
    switch (activeFilter) {
      case 'open': return pool.filter(c => c.status === 'nicht_begonnen');
      case 'in_progress': return pool.filter(c => ['in_arbeit', 'in_planung'].includes(c.status));
      case 'overdue': return pool.filter(c => c.status === 'in_verzug' || (c.due_at && c.due_at < today));
      case 'today': return pool.filter(c => c.due_at === today);
      case 'week': return pool.filter(c => c.due_at && c.due_at >= today && c.due_at <= weekEnd);
      default: return [];
    }
  }, [activeFilter, scope, active, user, today, weekEnd]);

  const toggleFilter = (k: FilterKey) => setActiveFilter(prev => (prev === k ? null : k));

  const CaseList = ({ items, empty }: { items: CaseRow[]; empty: string }) => (
    <div className="divide-y divide-border">
      {loading ? <p className="p-4 text-xs text-muted-foreground">Laden</p>
        : items.length === 0 ? <p className="p-4 text-xs text-muted-foreground">{empty}</p>
        : items.map(c => (
          <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
            <StatusBadge status={c.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{c.project_name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{c.case_no}</p>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatDate(c.due_at)}</span>
          </Link>
        ))}
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1600px]">
        {/* Hero zone — Left 60% / Right 40% */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* LEFT: Hero image with greeting + KPIs overlay */}
          <div className="lg:col-span-3 relative rounded-2xl overflow-hidden border border-border/50 bg-gradient-to-br from-muted/40 to-background min-h-[480px] lg:min-h-[560px]">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name ?? 'Profil'}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover opacity-85"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/60 to-background">
                <span className="text-7xl font-semibold text-muted-foreground/40 tracking-wider">{initials}</span>
              </div>
            )}

            {/* Edge darken + bottom fade so KPIs read */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(var(--background)/0.55)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/85 to-transparent" />

            {/* Greeting (top) */}
            <div className="absolute top-0 left-0 right-0 p-6 lg:p-8 z-10">
              <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/70">{dateString}</p>
              <h1 className="mt-2 text-2xl lg:text-3xl font-semibold text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                {greeting}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="mt-1 text-sm tabular-nums text-foreground/70">{timeString} Uhr</p>
            </div>

            {/* KPI cards (bottom overlay) */}
            <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5 z-10">
              <div className="grid grid-cols-5 gap-2">
                {KPI_DEFS.map(({ key, title, icon: Icon }) => {
                  const isActive = activeFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFilter(key)}
                      className={cn(
                        'group relative rounded-xl border text-left p-3 transition-all',
                        'backdrop-blur-2xl bg-background/40 hover:bg-background/55',
                        isActive ? 'border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.5)]' : 'border-border/40',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground mb-2" />
                      <div className="text-xl lg:text-2xl font-semibold text-foreground tabular-nums leading-none">{counts[key]}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">{title}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Chart on top, "Frei zum Abholen" below */}
          <div className="lg:col-span-2 grid grid-rows-[auto_1fr] gap-4 min-h-[480px] lg:min-h-[560px]">
            <div className="glass-card p-4 lg:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-medium text-foreground">Vorgänge diese Woche</h2>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Mo – Fr</span>
              </div>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekChart} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {weekChart.map((_, i) => (
                        <Cell key={i} fill="hsl(var(--primary))" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
                <h2 className="text-sm font-medium text-foreground">Frei zum Abholen</h2>
                <Link to="/cases?filter=available">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                    Alle anzeigen <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              <div className="flex-1 overflow-auto">
                <CaseList items={available} empty="Keine freien Vorgänge" />
              </div>
            </div>
          </div>
        </div>

        {/* Drilldown panel */}
        {activeFilter && (
          <div className="glass-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium text-foreground">{FILTER_LABELS[activeFilter]}</h2>
                <span className="text-[11px] text-muted-foreground tabular-nums">{drilldownItems.length} Vorgang/Vorgänge</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="inline-flex rounded-md border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setScope('mine')}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors',
                      scope === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <UserCheck className="h-3 w-3" /> Meine
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors',
                      scope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Users className="h-3 w-3" /> Alle
                  </button>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setActiveFilter(null)} aria-label="Schließen">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <CaseList items={drilldownItems} empty={scope === 'mine' ? 'Keine Vorgänge in deiner Verantwortung' : 'Keine Vorgänge in dieser Kategorie'} />
          </div>
        )}

        {/* Meine Vorgänge — moved below the hero zone */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <h2 className="text-sm font-medium text-foreground">Meine Vorgänge</h2>
            <Link to="/cases?filter=mine">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                Alle anzeigen <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
          <CaseList
            items={cases.filter(c => c.assignee_id === user?.id && !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).slice(0, 10)}
            empty="Keine zugewiesenen Vorgänge"
          />
        </div>
      </div>
    </AppLayout>
  );
}
