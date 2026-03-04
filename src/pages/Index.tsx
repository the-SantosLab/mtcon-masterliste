import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { KPICard } from '@/components/KPICard';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { ClipboardList, Clock, AlertTriangle, CalendarCheck, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };

export default function Dashboard() {
  const { user } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

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
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Übersicht aller Vorgänge</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard title="Offen" value={openCount} icon={ClipboardList} />
          <KPICard title="In Arbeit" value={inProgress} icon={Clock} />
          <KPICard title="In Verzug" value={overdue} icon={AlertTriangle} />
          <KPICard title="Heute fällig" value={dueToday} icon={CalendarCheck} />
          <KPICard title="Diese Woche" value={dueWeek} icon={Calendar} />
        </div>
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
