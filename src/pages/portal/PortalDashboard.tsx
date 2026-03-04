import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from '@/components/KPICard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Ticket, CheckCircle, Clock, AlertTriangle, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  waiting: 'Wartend',
  resolved: 'Gelöst',
  closed: 'Geschlossen',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-[hsl(var(--status-open))]',
  in_progress: 'bg-[hsl(var(--status-working))]',
  waiting: 'bg-[hsl(var(--status-planning))]',
  resolved: 'bg-[hsl(var(--status-done))]',
  closed: 'bg-muted-foreground',
};

export default function PortalDashboard() {
  const { customer } = usePortalAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    if (customer) fetchTickets();
  }, [customer]);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('customer_id', customer!.id)
      .order('created_at', { ascending: false });
    setTickets(data || []);
    setLoading(false);
  };

  const open = tickets.filter(t => t.status === 'open').length;
  const inProgress = tickets.filter(t => ['in_progress', 'waiting'].includes(t.status)).length;
  const resolved = tickets.filter(t => t.status === 'resolved').length;
  const closed = tickets.filter(t => t.status === 'closed').length;
  const recent = tickets.slice(0, 5);

  if (loading) {
    return (
      <PortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Willkommen zurück, {customer?.display_name}
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/portal/tickets/new')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Neues Ticket
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Offen" value={open} icon={Ticket} />
          <KPICard title="In Bearbeitung" value={inProgress} icon={Clock} />
          <KPICard title="Gelöst" value={resolved} icon={CheckCircle} />
          <KPICard title="Geschlossen" value={closed} icon={AlertTriangle} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-foreground">Letzte Tickets</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/portal/tickets')}>
              Alle anzeigen
            </Button>
          </div>

          {recent.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Ticket className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Noch keine Tickets vorhanden.</p>
                <Button size="sm" className="mt-3" onClick={() => navigate('/portal/tickets/new')}>
                  Erstes Ticket erstellen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recent.map(ticket => (
                <Card
                  key={ticket.id}
                  className="hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/portal/tickets/${ticket.id}`)}
                >
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[11px] text-muted-foreground">{ticket.ticket_number}</span>
                        <Badge className={`${STATUS_COLORS[ticket.status]} text-white text-[10px] px-1.5 py-0`}>
                          {STATUS_LABELS[ticket.status] || ticket.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{ticket.title}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
