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
      {loading ? <p className="p-4 text-sm text-muted-foreground">Laden…</p>
        : items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{empty}</p>
        : items.map(c => (
          <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
            <StatusBadge status={c.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{c.project_name}</p>
              <p className="text-xs text-muted-foreground font-mono">{c.case_no}</p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{formatDate(c.due_at)}</span>
          </Link>
        ))}
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold text-foreground">Dashboard</h1><p className="text-sm text-muted-foreground">Übersicht aller Vorgänge</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard title="Offen" value={openCount} icon={ClipboardList} iconClassName="text-status-open" />
          <KPICard title="In Arbeit" value={inProgress} icon={Clock} iconClassName="text-status-working" />
          <KPICard title="In Verzug" value={overdue} icon={AlertTriangle} iconClassName="text-status-overdue" />
          <KPICard title="Heute fällig" value={dueToday} icon={CalendarCheck} iconClassName="text-status-planning" />
          <KPICard title="Diese Woche" value={dueWeek} icon={Calendar} iconClassName="text-primary" />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Meine Vorgänge</h2>
              <Link to="/cases?filter=mine"><Button variant="ghost" size="sm" className="text-xs">Alle <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
            </div>
            <CaseList items={myCases} empty="Keine zugewiesenen Vorgänge" />
          </div>
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Frei zum Abholen</h2>
              <Link to="/cases?filter=available"><Button variant="ghost" size="sm" className="text-xs">Alle <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
            </div>
            <CaseList items={available} empty="Keine freien Vorgänge" />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
