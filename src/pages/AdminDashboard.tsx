import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, STATUS_LABELS } from '@/lib/case-utils';
import { StatusBadge } from '@/components/StatusBadge';
import {
  ClipboardList, AlertTriangle, FolderKanban, User2,
  TrendingUp, ArrowRight, RefreshCw, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { subDays, startOfQuarter, parseISO } from 'date-fns';

interface CaseRow {
  id: string; case_no: string; project_name: string; status: string;
  assignee_id: string | null; due_at: string | null; created_at: string;
  assignee: { id?: string; short_code: string; display_name: string; avatar_url?: string | null } | null;
}

interface ProjectRow { id: string; name: string; project_number: string; status: string; created_at: string; }

const STATUS_COLORS: Record<string, string> = {
  nicht_begonnen: 'hsl(var(--status-open))',
  in_planung: 'hsl(var(--status-planning))',
  in_arbeit: 'hsl(var(--status-working))',
  in_verzug: 'hsl(var(--status-overdue))',
  abgeschlossen: 'hsl(var(--status-done))',
  verworfen: 'hsl(var(--status-rejected))',
  archiv: 'hsl(var(--muted-foreground))',
};

type DateRange = 'all' | '7d' | '30d' | 'quarter';

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: 'all', label: 'Gesamt' },
  { key: '7d', label: '7 Tage' },
  { key: '30d', label: '30 Tage' },
  { key: 'quarter', label: 'Quartal' },
];

function getStartDate(range: DateRange): Date | null {
  const now = new Date();
  if (range === '7d') return subDays(now, 7);
  if (range === '30d') return subDays(now, 30);
  if (range === 'quarter') return startOfQuarter(now);
  return null;
}

function KPITile({
  icon: Icon, label, value, sub, accent, href,
}: {
  icon: React.ElementType; label: string; value: number | string;
  sub?: string; accent: string; href?: string;
}) {
  const inner = (
    <div className={cn(
      'rounded-md border border-border bg-card px-5 py-4 flex items-start gap-4 transition-colors',
      href && 'hover:bg-muted/40 cursor-pointer',
    )}>
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowRight className="h-4 w-4 text-muted-foreground/40 ml-auto self-center" />}
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

export default function AdminDashboard() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [dateRange, setDateRange] = useState<DateRange>('all');

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin) navigate('/', { replace: true });
  }, [isAdmin, navigate]);

  const fetchData = async () => {
    const [casesRes, projectsRes, usersRes] = await Promise.all([
      supabase.from('cases')
        .select('id, case_no, project_name, status, assignee_id, due_at, created_at, assignee:users_profile!cases_assignee_id_fkey(id, short_code, display_name, avatar_url)')
        .eq('deleted', false)
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, project_number, status, created_at'),
      supabase.from('users_profile').select('id', { count: 'exact', head: true }).eq('active', true),
    ]);
    setCases((casesRes.data || []) as CaseRow[]);
    setProjects((projectsRes.data || []) as ProjectRow[]);
    setUserCount(usersRes.count ?? 0);
    setLoading(false);
    setLastRefresh(new Date());
  };

  useEffect(() => {
    fetchData();
    const ch = supabase.channel('admin-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const today = new Date().toISOString().split('T')[0];

  // Apply date-range filter to cases & projects (computed before early return to satisfy hooks rules)
  const startDate = getStartDate(dateRange);
  const filteredCases = useMemo(() => {
    if (!startDate) return cases;
    return cases.filter(c => parseISO(c.created_at) >= startDate);
  }, [cases, startDate]);

  const filteredProjects = useMemo(() => {
    if (!startDate) return projects;
    return projects.filter(p => parseISO(p.created_at) >= startDate);
  }, [projects, startDate]);

  if (!isAdmin) return null;

  const activeStatuses = ['nicht_begonnen', 'in_planung', 'in_arbeit', 'in_verzug'];
  const activeCases = filteredCases.filter(c => activeStatuses.includes(c.status));
  const openCases = activeCases.filter(c => c.status === 'nicht_begonnen');
  const overdueCases = activeCases.filter(c =>
    c.status === 'in_verzug' || (c.due_at && c.due_at < today && c.status !== 'abgeschlossen')
  );
  const myCases = filteredCases.filter(c => c.assignee_id === user?.id && activeStatuses.includes(c.status));
  const activeProjects = filteredProjects.filter(p => p.status === 'active');

  // Status distribution
  const statusDist = Object.entries(
    activeCases.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([status, count]) => ({
    name: STATUS_LABELS[status as any] ?? status,
    value: count,
    color: STATUS_COLORS[status] ?? 'hsl(var(--muted-foreground))',
  })).sort((a, b) => b.value - a.value);

  // Workload per assignee
  const workloadData = Object.values(
    activeCases
      .filter(c => c.assignee_id && c.assignee)
      .reduce<Record<string, { name: string; count: number; overdue: number }>>((acc, c) => {
        const key = c.assignee_id!;
        if (!acc[key]) {
          acc[key] = { name: c.assignee?.short_code ?? '?', count: 0, overdue: 0 };
        }
        acc[key].count += 1;
        if (c.status === 'in_verzug' || (c.due_at && c.due_at < today)) {
          acc[key].overdue += 1;
        }
        return acc;
      }, {})
  ).sort((a, b) => b.count - a.count);

  const recentOverdue = overdueCases.slice(0, 8);

  const rangeLabel = DATE_RANGE_OPTIONS.find(o => o.key === dateRange)?.label ?? '';

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />Admin Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Echtzeit-Übersicht · Aktualisiert {lastRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range pills */}
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground ml-2 shrink-0" />
              {DATE_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setDateRange(opt.key)}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium rounded transition-colors',
                    dateRange === opt.key
                      ? 'bg-card text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={fetchData} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Aktualisieren
            </Button>
          </div>
        </div>

        {/* Active filter hint */}
        {dateRange !== 'all' && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            Zeigt Vorgänge &amp; Projekte aus den letzten
            {' '}<span className="font-medium text-foreground">{rangeLabel}</span>
            {' '}· erstellt in diesem Zeitraum
          </div>
        )}

        {/* KPI Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPITile
            icon={ClipboardList}
            label="Offene Vorgänge"
            value={openCases.length}
            sub={`${activeCases.length} aktiv gesamt`}
            accent="bg-primary/10 text-primary"
            href="/cases"
          />
          <KPITile
            icon={AlertTriangle}
            label="In Verzug"
            value={overdueCases.length}
            sub="Überfällig oder Status"
            accent="bg-[hsl(var(--status-overdue))]/10 text-[hsl(var(--status-overdue))]"
            href="/cases"
          />
          <KPITile
            icon={FolderKanban}
            label="Aktive Projekte"
            value={activeProjects.length}
            sub={`${filteredProjects.length} Projekte gesamt`}
            accent="bg-[hsl(var(--status-working))]/10 text-[hsl(var(--status-working))]"
            href="/projects"
          />
          <KPITile
            icon={User2}
            label="Eigene Vorgänge"
            value={myCases.length}
            sub="Mir zugewiesen, aktiv"
            accent="bg-[hsl(var(--status-done))]/10 text-[hsl(var(--status-done))]"
            href="/cases?filter=mine"
          />
        </div>

        <div className="grid lg:grid-cols-5 gap-4">
          {/* Status Distribution Chart */}
          <div className="lg:col-span-2 rounded-md border border-border bg-card p-5">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
              Statusverteilung (aktive Vorgänge)
            </h2>
            {activeCases.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
                Keine aktiven Vorgänge
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusDist.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend
                    formatter={(value) => <span style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
                    iconSize={8}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Overdue Cases Table */}
          <div className="lg:col-span-3 rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-overdue))]" />
                Verzögerte Vorgänge ({recentOverdue.length})
              </h2>
              <Link to="/cases" className="text-[11px] text-primary hover:underline">Alle →</Link>
            </div>
            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Laden…</div>
            ) : recentOverdue.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Keine verzögerten Vorgänge 🎉</div>
            ) : (
              <div className="divide-y divide-border">
                {recentOverdue.map(c => (
                  <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <StatusBadge status={c.status as any} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{c.project_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{c.case_no}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.assignee && <UserAvatar user={c.assignee as any} size="md" />}
                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">{c.assignee?.short_code ?? '–'}</p>
                        <p className="text-[10px] text-[hsl(var(--status-overdue))] tabular-nums">{formatDate(c.due_at)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Workload per Assignee */}
        <div className="rounded-md border border-border bg-card p-5">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
            Auslastung pro Bearbeiter (aktive Vorgänge)
          </h2>
          {workloadData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
              Keine zugewiesenen aktiven Vorgänge
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, workloadData.length * 36)}>
              <BarChart
                data={workloadData}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={40}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === 'count' ? 'Aktive Vorgänge' : 'Davon in Verzug',
                  ]}
                  cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                />
                <Bar dataKey="count" name="count" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                <Bar dataKey="overdue" name="overdue" fill="hsl(var(--status-overdue))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bottom: My Cases + Active Projects */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* My Cases */}
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Meine Vorgänge</h2>
              <Link to="/cases?filter=mine" className="text-[11px] text-primary hover:underline">Alle →</Link>
            </div>
            {myCases.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Keine eigenen Vorgänge</div>
            ) : (
              <div className="divide-y divide-border">
                {myCases.slice(0, 6).map(c => (
                  <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <StatusBadge status={c.status as any} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{c.project_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{c.case_no}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatDate(c.due_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Active Projects */}
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktive Projekte</h2>
              <Link to="/projects" className="text-[11px] text-primary hover:underline">Alle →</Link>
            </div>
            {activeProjects.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">Keine aktiven Projekte</div>
            ) : (
              <div className="divide-y divide-border">
                {activeProjects.slice(0, 6).map(p => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="h-7 w-7 rounded-md bg-[hsl(var(--status-working))]/10 flex items-center justify-center shrink-0">
                      <FolderKanban className="h-3.5 w-3.5 text-[hsl(var(--status-working))]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{p.project_number}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
