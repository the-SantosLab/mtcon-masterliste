import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { AnnouncementsWidget } from '@/components/announcements/AnnouncementsWidget';
import { ChatUnreadWidget } from '@/components/ChatUnreadWidget';
import { UnreadBadge } from '@/components/UnreadBadge';
import { useChatUnread } from '@/hooks/useChatUnread';

import { UrgencyDot } from '@/components/UrgencyDot';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { ClipboardList, Clock, AlertTriangle, CalendarCheck, Calendar, ArrowRight, X, UserCheck, Users, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';

type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };

type FilterKey = 'open' | 'in_progress' | 'overdue' | 'today' | 'week';
type ChartRange = 'week' | 'month' | 'year';
type DateRangeFilter = 'all' | 'lastMonth' | 'last2Months' | 'last3Months' | 'last6Months';

const FILTER_LABELS: Record<FilterKey, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  overdue: 'In Verzug',
  today: 'Heute fällig',
  week: 'Diese Woche fällig',
};

// Farbzuweisungen pro Status (HSL, abgestimmt auf bestehende Legende)
const FILTER_COLORS: Record<FilterKey, string> = {
  open: 'hsl(217 91% 60%)',        // blau
  in_progress: 'hsl(160 84% 39%)', // emerald
  overdue: 'hsl(0 84% 60%)',       // rot
  today: 'hsl(45 93% 47%)',        // gelb
  week: 'hsl(270 76% 58%)',        // violett
};

const KPI_DEFS: { key: FilterKey; title: string; icon: typeof ClipboardList }[] = [
  { key: 'open', title: 'Offen', icon: ClipboardList },
  { key: 'in_progress', title: 'In Arbeit', icon: Clock },
  { key: 'overdue', title: 'In Verzug', icon: AlertTriangle },
  { key: 'today', title: 'Heute Fällig', icon: CalendarCheck },
  { key: 'week', title: 'Diese Woche', icon: Calendar },
];


const matchesFilter = (c: CaseRow, k: FilterKey, today: string, weekEnd: string): boolean => {
  switch (k) {
    case 'open': return c.status === 'nicht_begonnen';
    case 'in_progress': return ['in_arbeit', 'in_planung'].includes(c.status);
    case 'overdue': return c.status === 'in_verzug' || (!!c.due_at && c.due_at < today);
    case 'today': return c.due_at === today;
    case 'week': return !!c.due_at && c.due_at >= today && c.due_at <= weekEnd;
  }
};

export default function Dashboard() {
  const { user, profile, isAdmin } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [myTasks, setMyTasks] = useState<Array<{ id: string; title: string; due_at: string | null; status: string; case_id: string; case: { id: string; case_no: string; project_name: string } | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [now, setNow] = useState(new Date());
  const { unreadMap } = useChatUnread(cases.map(c => c.id));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCases = async () => {
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
      .eq('deleted', false)
      .order('created_at', { ascending: false });
    setCases((data as CaseRow[]) || []);
    setLoading(false);
  };

  const fetchMyTasks = async () => {
    if (!user?.id) return;
    const { data: tasks } = await supabase
      .from('case_tasks')
      .select('id, title, due_at, status, case_id')
      .eq('assigned_to', user.id)
      .neq('status', 'done')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(15);
    const list = (tasks as any[]) || [];
    const ids = Array.from(new Set(list.map(t => t.case_id).filter(Boolean)));
    let caseMap: Record<string, any> = {};
    if (ids.length) {
      const { data: cs } = await supabase.from('cases').select('id, case_no, project_name').in('id', ids);
      caseMap = Object.fromEntries(((cs as any[]) || []).map(c => [c.id, c]));
    }
    setMyTasks(list.map(t => ({ ...t, case: caseMap[t.case_id] || null })));
  };

  useEffect(() => {
    fetchCases();
    fetchMyTasks();
    const ch = supabase.channel('dash-cases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks' }, () => fetchMyTasks())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const firstName = profile?.display_name?.split(' ')[0] ?? '';
  const initials = (profile?.display_name ?? '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const timeString = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const active = cases.filter(c => !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status));
  const scopedActive = scope === 'mine' ? active.filter(c => c.assignee_id === user?.id) : active;
  const counts: Record<FilterKey, number> = {
    open: scopedActive.filter(c => c.status === 'nicht_begonnen').length,
    in_progress: scopedActive.filter(c => ['in_arbeit', 'in_planung'].includes(c.status)).length,
    overdue: scopedActive.filter(c => c.status === 'in_verzug' || (c.due_at && c.due_at < today)).length,
    today: scopedActive.filter(c => c.due_at === today).length,
    week: scopedActive.filter(c => c.due_at && c.due_at >= today && c.due_at <= weekEnd).length,
  };

  const available = cases
    .filter(c => !c.assignee_id && !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const [chartRange, setChartRange] = useState<ChartRange>('week');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('all');

  // Load persisted dashboard preferences from server
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('dashboard_status_filters, dashboard_chart_range')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const filters = (data?.dashboard_status_filters ?? [])
        .filter((k: string): k is FilterKey => k in FILTER_LABELS);
      const range = data?.dashboard_chart_range;
      setActiveFilters(filters);
      if (range === 'week' || range === 'month' || range === 'year') setChartRange(range);
      setPrefsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Persist changes to server (debounced via simple effect)
  useEffect(() => {
    if (!user?.id || !prefsLoaded) return;
    const t = setTimeout(() => {
      supabase
        .from('user_preferences')
        .upsert(
          { user_id: user.id, dashboard_status_filters: activeFilters, dashboard_chart_range: chartRange },
          { onConflict: 'user_id' }
        )
        .then(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [user?.id, prefsLoaded, activeFilters, chartRange]);

  // Welche Status werden im Chart als Säulen-Segmente gezeigt
  const visibleStatuses: FilterKey[] = activeFilters.length > 0
    ? activeFilters
    : (Object.keys(FILTER_LABELS) as FilterKey[]);

  const getDateRangeBounds = (filter: DateRangeFilter) => {
    const now = new Date();
    switch (filter) {
      case 'lastMonth':
        return { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) };
      case 'last2Months':
        return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(subMonths(now, 2)) };
      case 'last3Months':
        return { from: startOfMonth(subMonths(now, 2)), to: now };
      case 'last6Months':
        return { from: startOfMonth(subMonths(now, 5)), to: now };
      default:
        return null;
    }
  };

  // Pool für Drilldown / Säulen: aktive Vorgänge, die mindestens einen aktiven Filter erfüllen
  // Falls kein Filter aktiv -> alle aktiven Vorgänge
  const filteredActive = useMemo(() => {
    let pool = active;
    if (activeFilters.length > 0) {
      pool = pool.filter(c => activeFilters.some(k => matchesFilter(c, k, today, weekEnd)));
    }
    if (dateRangeFilter !== 'all') {
      const bounds = getDateRangeBounds(dateRangeFilter);
      if (bounds) {
        pool = pool.filter(c => {
          if (!c.created_at) return false;
          const created = new Date(c.created_at);
          return created >= bounds.from && created <= bounds.to;
        });
      }
    }
    return pool;
  }, [active, activeFilters, today, weekEnd, dateRangeFilter]);

  // Säulendaten: pro Bucket je Status ein Wert (Stacked Bar)
  const weekChart = useMemo(() => {
    const buildBucket = (filter: (c: CaseRow) => boolean, label: string) => {
      const items = filteredActive.filter(filter);
      const row: Record<string, any> = { label, items };
      let total = 0;
      visibleStatuses.forEach(k => {
        const n = items.filter(c => matchesFilter(c, k, today, weekEnd)).length;
        row[k] = n;
        total += n;
      });
      row.value = total;
      return row;
    };

    if (chartRange === 'week') {
      const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
      const startOfWeek = new Date(now);
      const day = (startOfWeek.getDay() + 6) % 7;
      startOfWeek.setDate(startOfWeek.getDate() - day);
      startOfWeek.setHours(0, 0, 0, 0);
      return labels.map((label, i) => buildBucket(c => {
        if (!c.created_at) return false;
        const d = new Date(c.created_at);
        const diff = Math.floor((d.getTime() - startOfWeek.getTime()) / 86400000);
        return diff === i;
      }, label));
    }

    if (chartRange === 'month') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => buildBucket(c => {
        if (!c.created_at) return false;
        const d = new Date(c.created_at);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === i + 1;
      }, String(i + 1)));
    }

    // year view
    const year = now.getFullYear();
    const monthLabels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return monthLabels.map((label, i) => buildBucket(c => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      return d.getFullYear() === year && d.getMonth() === i;
    }, label));
  }, [filteredActive, now, chartRange, visibleStatuses, today, weekEnd]);

  const [barDrill, setBarDrill] = useState<{ label: string; items: CaseRow[] } | null>(null);

  const drilldownItems = useMemo(() => {
    if (activeFilters.length === 0) return [];
    let pool = active;
    if (scope === 'mine') pool = pool.filter(c => c.assignee_id === user?.id);
    return pool.filter(c => activeFilters.some(k => matchesFilter(c, k, today, weekEnd)));
  }, [activeFilters, scope, active, user, today, weekEnd]);

  const toggleFilter = (k: FilterKey) => setActiveFilters(prev =>
    prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
  );


  const CaseList = ({ items, empty }: { items: CaseRow[]; empty: string }) => (
    <div className="divide-y divide-border">
      {loading ? <p className="p-4 text-xs text-muted-foreground">Laden</p>
        : items.length === 0 ? <p className="p-4 text-xs text-muted-foreground">{empty}</p>
        : items.map(c => (
          <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
            <UrgencyDot status={c.status} dueAt={c.due_at} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{c.project_name}</p>
              <p className="text-[11px] text-muted-foreground font-mono inline-flex items-center gap-1.5">
                <span>{c.case_no}</span>
                <UnreadBadge count={unreadMap[c.id] ?? 0} size="xs" />
              </p>
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
          <div className="lg:col-span-3 relative rounded-2xl overflow-hidden border border-border/50 bg-gradient-to-br from-muted/40 to-background min-h-[640px] lg:min-h-[560px]">
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
            <div className="absolute top-0 left-0 right-0 p-6 lg:p-8 z-10 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/70">{dateString}</p>
                <h1 className="mt-2 text-2xl lg:text-3xl font-semibold text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                  {greeting}{firstName ? `, ${firstName}` : ''}
                </h1>
                <p className="mt-1 text-sm tabular-nums text-foreground/70">{timeString} Uhr</p>
              </div>

              {/* Mein / Alle Umschalter — steuert die KPI-Anzeige */}
              <div
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 backdrop-blur-xl p-1 shrink-0"
                role="group"
                aria-label="Anzeige umschalten"
              >
                <button
                  type="button"
                  onClick={() => setScope('mine')}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium transition-colors',
                    scope === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={scope === 'mine'}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Mein
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium transition-colors',
                    scope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={scope === 'all'}
                >
                  <Users className="h-3.5 w-3.5" />
                  Alle
                </button>
              </div>
            </div>

            {/* KPI cards (bottom overlay) */}
            <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5 z-10">
              <div className="grid kpi-grid grid-cols-5 gap-2">
                {KPI_DEFS.map(({ key, title, icon: Icon }) => {
                  const isActive = activeFilters.includes(key);
                  const accent = FILTER_COLORS[key];
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
                      <Icon className="h-3.5 w-3.5 mb-2" style={{ color: accent }} />
                      <div className="text-xl lg:text-2xl font-semibold tabular-nums leading-none" style={{ color: accent }}>{counts[key]}</div>
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
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                  <span>
                    {dateRangeFilter === 'lastMonth'
                      ? 'Erstellte Vorgänge Vormonat'
                      : dateRangeFilter === 'last2Months'
                        ? 'Erstellte Vorgänge Vorvormonat'
                        : dateRangeFilter === 'last3Months'
                          ? 'Erstellte Vorgänge letzte 3 Monate'
                          : dateRangeFilter === 'last6Months'
                            ? 'Erstellte Vorgänge letzte 6 Monate'
                            : chartRange === 'week'
                              ? 'Erstellte Vorgänge diese Woche'
                              : chartRange === 'month'
                                ? 'Erstellte Vorgänge diesen Monat'
                                : 'Erstellte Vorgänge dieses Jahr'}
                  </span>
                  {(activeFilters.length > 0 || dateRangeFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => { setActiveFilters([]); setDateRangeFilter('all'); }}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                      title="Alle Filter zurücksetzen"
                    >
                      {activeFilters.length + (dateRangeFilter !== 'all' ? 1 : 0)} Filter aktiv
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </h2>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Zeitraum-Schnellfilter */}
                  <div className="flex items-center gap-1">
                    {([
                      { key: 'lastMonth', label: 'Vormonat' },
                      { key: 'last2Months', label: 'Vorvormonat' },
                      { key: 'last3Months', label: '3 Monate' },
                      { key: 'last6Months', label: '6 Monate' },
                    ] as { key: DateRangeFilter; label: string }[]).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDateRangeFilter(prev => prev === key ? 'all' : key)}
                        className={cn(
                          'h-7 px-2 rounded-md border text-[10px] font-medium transition-colors shrink-0',
                          dateRangeFilter === key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5">
                    {(['week', 'month', 'year'] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setChartRange(r)}
                        className={cn(
                          'px-2.5 py-0.5 text-[10px] uppercase tracking-wider rounded transition-colors',
                          chartRange === r
                            ? 'bg-card text-foreground shadow-sm border border-border'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {r === 'week' ? 'Woche' : r === 'month' ? 'Monat' : 'Jahr'}
                      </button>
                    ))}
                  </div>
                </div>
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
                    {visibleStatuses.map((k, i) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        stackId="status"
                        fill={FILTER_COLORS[k]}
                        radius={i === visibleStatuses.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                        cursor="pointer"
                        name={FILTER_LABELS[k]}
                        onClick={(d: any) => setBarDrill({ label: d.label, items: d.items || [] })}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                {(Object.keys(FILTER_LABELS) as FilterKey[]).map(k => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: FILTER_COLORS[k] }} />
                    {FILTER_LABELS[k]}
                  </span>
                ))}
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
        {(activeFilters.length > 0 || dateRangeFilter !== 'all') && (
          <div className="glass-card overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-medium text-foreground">
                  {activeFilters.length === 1 ? FILTER_LABELS[activeFilters[0]] : activeFilters.length > 1 ? 'Auswahl' : dateRangeFilter !== 'all' ? 'Zeitraum-Filter' : 'Auswahl'}
                </h2>
                {activeFilters.length > 1 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {activeFilters.map(k => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: `${FILTER_COLORS[k]}22`, color: FILTER_COLORS[k] }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: FILTER_COLORS[k] }} />
                        {FILTER_LABELS[k]}
                      </span>
                    ))}
                  </div>
                )}
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
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setActiveFilters([]); setDateRangeFilter('all'); }} aria-label="Schließen">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <CaseList items={drilldownItems} empty={scope === 'mine' ? 'Keine Vorgänge in deiner Verantwortung' : 'Keine Vorgänge in dieser Kategorie'} />
          </div>
        )}

        {/* Mitteilungen vom Admin-Team */}
        <AnnouncementsWidget />

        {/* Neue Chat-Nachrichten in relevanten Vorgängen */}
        <ChatUnreadWidget caseIds={cases.map(c => c.id)} />






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

        {/* Meine Unteraufgaben — zu bearbeiten */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Meine Unteraufgaben</h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">{myTasks.length}</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {myTasks.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">Keine offenen Unteraufgaben</p>
            ) : myTasks.map(t => {
              const overdue = t.due_at && t.due_at < today;
              return (
                <Link key={t.id} to={`/cases/${t.case_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', overdue ? 'bg-red-500' : 'bg-blue-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {t.case?.case_no} · {t.case?.project_name}
                    </p>
                  </div>
                  {t.due_at && (
                    <span className={cn('text-[11px] tabular-nums shrink-0', overdue ? 'text-red-500' : 'text-muted-foreground')}>
                      Fällig: {new Date(t.due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <Sheet open={!!barDrill} onOpenChange={o => !o && setBarDrill(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
            <SheetTitle className="text-sm font-medium">
              Erstellt am {barDrill?.label} · {barDrill?.items.length ?? 0} Vorgang/Vorgänge
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {!barDrill?.items.length ? (
              <p className="p-5 text-xs text-muted-foreground">Keine Vorgänge in diesem Bereich</p>
            ) : (
              <div className="divide-y divide-border">
                {barDrill.items.map(c => (
                  <Link
                    key={c.id}
                    to={`/cases/${c.id}`}
                    onClick={() => setBarDrill(null)}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <UrgencyDot status={c.status} dueAt={c.due_at} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground font-mono inline-flex items-center gap-1.5">
                        <span>{c.case_no}</span>
                        <UnreadBadge count={unreadMap[c.id] ?? 0} size="xs" />
                      </p>
                      <p className="text-sm text-foreground truncate">{c.project_name}</p>
                    </div>
                    {c.assignee?.short_code && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
                        {c.assignee.short_code}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-16 text-right">{formatDate(c.due_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
