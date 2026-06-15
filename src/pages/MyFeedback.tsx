import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bug, Plus, Loader2, MessageSquare } from 'lucide-react';
import { BugReportDialog } from '@/components/BugReportDialog';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen', in_progress: 'In Bearbeitung', waiting: 'Wartet auf Rückmeldung',
  resolved: 'Gelöst', closed: 'Geschlossen',
};
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-[hsl(var(--status-open))]', in_progress: 'bg-[hsl(var(--status-working))]',
  waiting: 'bg-[hsl(var(--status-planning))]', resolved: 'bg-[hsl(var(--status-done))]',
  closed: 'bg-muted-foreground',
};
const KIND_LABELS: Record<string, string> = {
  bug: 'Bug', idee: 'Idee', frage: 'Frage', sonstige: 'Sonstiges',
};
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch',
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-[hsl(var(--priority-critical))] text-white',
  high: 'bg-[hsl(var(--priority-high))] text-white',
  medium: 'bg-[hsl(var(--priority-medium))] text-white',
  low: 'bg-[hsl(var(--priority-low))] text-white',
};

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  kind: string | null;
  created_at: string;
  updated_at: string;
  case_id: string | null;
}

export default function MyFeedback() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);

  const fetchTickets = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, title, status, priority, kind, created_at, updated_at, case_id')
      .eq('source', 'intern' as any)
      .eq('reporter_user_id', user.id)
      .order('created_at', { ascending: false });
    setTickets((data as Ticket[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
    if (!user?.id) return;
    const ch = supabase.channel(`my-feedback-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `reporter_user_id=eq.${user.id}` }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'waiting').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Meine Meldungen</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Eigene Bug-, Ideen- und Fragenmeldungen an das MSL-Team</p>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setOpenDialog(true)}>
            <Plus className="h-3.5 w-3.5" />Neue Meldung
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <Bug className="h-5 w-5 text-primary" />
            <div><p className="text-[11px] text-muted-foreground">Gesamt</p><p className="text-xl font-bold">{tickets.length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-[hsl(var(--status-working))]" />
            <div><p className="text-[11px] text-muted-foreground">In Bearbeitung</p><p className="text-xl font-bold">{openCount}</p></div>
          </CardContent></Card>
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-[hsl(var(--status-done))]" />
            <div><p className="text-[11px] text-muted-foreground">Erledigt</p><p className="text-xl font-bold">{resolvedCount}</p></div>
          </CardContent></Card>
        </div>

        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nr.</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Art</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Titel</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Priorität</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Laden…</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Noch keine eigenen Meldungen.</td></tr>
              ) : tickets.map(t => (
                <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-3 py-2 font-mono">
                    <Link to={`/support/${t.id}`} className="text-primary hover:underline">{t.ticket_number}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.kind ? KIND_LABELS[t.kind] : '–'}</td>
                  <td className="px-3 py-2 text-foreground max-w-[400px] truncate">
                    <Link to={`/support/${t.id}`} className="hover:text-primary">{t.title}</Link>
                    {t.case_id && <span className="ml-2 text-[10px] text-muted-foreground">(Vorgangsbezug)</span>}
                  </td>
                  <td className="px-3 py-2"><Badge className={cn(PRIORITY_COLORS[t.priority], 'text-[10px] px-1.5 py-0')}>{PRIORITY_LABELS[t.priority]}</Badge></td>
                  <td className="px-3 py-2"><Badge className={cn(STATUS_COLORS[t.status], 'text-white text-[10px] px-1.5 py-0')}>{STATUS_LABELS[t.status]}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: de })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{tickets.length} Meldung(en)</p>
      </div>

      <BugReportDialog open={openDialog} onOpenChange={setOpenDialog} />
    </AppLayout>
  );
}
