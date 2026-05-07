import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { KPICard } from '@/components/KPICard';
import { StatusBadge } from '@/components/StatusBadge';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { ClipboardList, Clock, AlertTriangle, CalendarCheck, Calendar, ArrowRight, X, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };

type FilterKey = 'open' | 'in_progress' | 'overdue' | 'today' | 'week';

const FILTER_LABELS: Record<FilterKey, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  overdue: 'In Verzug',
  today: 'Heute fällig',
  week: 'Diese Woche fällig',
};

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
  const timeString = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const today = new Date().toISOString().split('T')[0];
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const active = cases.filter(c => !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status));
  const openCount = active.filter(c => c.status === 'nicht_begonnen').length;
  const inProgress = active.filter(c => ['in_arbeit', 'in_planung'].includes(c.status)).length;
  const overdue = active.filter(c => c.status === 'in_verzug' || (c.due_at && c.due_at < today)).length;
  const dueToday = active.filter(c => c.due_at === today).length;
  const dueWeek = active.filter(c => c.due_at && c.due_at >= today && c.due_at <= weekEnd).length;

  const myCases = cases.filter(c => c.assignee_id === user?.id && !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).slice(0, 10);
  const available = cases.filter(c => !c.assignee_id && !['abgeschlossen', 'verworfen', 'archiv'].includes(c.status)).slice(0, 10);

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
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar user={profile} size="lg" tooltip={false} />
            <div>
              <h1 className="text-lg font-semibold text-foreground">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{timeString}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard title="Offen" value={openCount} icon={ClipboardList} active={activeFilter === 'open'} onClick={() => toggleFilter('open')} />
          <KPICard title="In Arbeit" value={inProgress} icon={Clock} active={activeFilter === 'in_progress'} onClick={() => toggleFilter('in_progress')} />
          <KPICard title="In Verzug" value={overdue} icon={AlertTriangle} active={activeFilter === 'overdue'} onClick={() => toggleFilter('overdue')} />
          <KPICard title="Heute fällig" value={dueToday} icon={CalendarCheck} active={activeFilter === 'today'} onClick={() => toggleFilter('today')} />
          <KPICard title="Diese Woche" value={dueWeek} icon={Calendar} active={activeFilter === 'week'} onClick={() => toggleFilter('week')} />
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

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h2 className="text-sm font-medium text-foreground">Meine Vorgänge</h2>
              <Link to="/cases?filter=mine">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                  Alle anzeigen <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
            <CaseList items={myCases} empty="Keine zugewiesenen Vorgänge" />
          </div>
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h2 className="text-sm font-medium text-foreground">Frei zum Abholen</h2>
              <Link to="/cases?filter=available">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                  Alle anzeigen <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
            <CaseList items={available} empty="Keine freien Vorgänge" />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
