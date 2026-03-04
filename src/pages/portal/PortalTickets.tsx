import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ticket, Plus, Loader2 } from 'lucide-react';
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

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

export default function PortalTickets() {
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

  if (loading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Meine Tickets</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Ihre Support-Anfragen im Überblick</p>
          </div>
          <Button size="sm" onClick={() => navigate('/portal/tickets/new')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Neues Ticket
          </Button>
        </div>

        {tickets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Ticket className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">Keine Tickets</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Sie haben noch keine Support-Tickets erstellt.
              </p>
              <Button size="sm" onClick={() => navigate('/portal/tickets/new')}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Erstes Ticket erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map(ticket => (
              <Link key={ticket.id} to={`/portal/tickets/${ticket.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">{ticket.ticket_number}</span>
                          <Badge className={`${STATUS_COLORS[ticket.status]} text-white text-[10px] px-1.5 py-0`}>
                            {STATUS_LABELS[ticket.status] || ticket.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                          </Badge>
                        </div>
                        <h3 className="text-sm font-medium text-foreground truncate">{ticket.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ticket.description}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-1">
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
