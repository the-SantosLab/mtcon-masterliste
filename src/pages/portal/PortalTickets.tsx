import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Ticket, Plus, Loader2, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen', in_progress: 'In Bearbeitung', waiting: 'Wartend', resolved: 'Gelöst', closed: 'Geschlossen',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  open: 'portal-badge-open', in_progress: 'portal-badge-working', waiting: 'portal-badge-waiting',
  resolved: 'portal-badge-done', closed: 'portal-badge-closed',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch',
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
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(var(--portal-text))' }}>
              Meine Tickets
            </h1>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
              Ihre Support-Anfragen im Überblick
            </p>
          </div>
          <button className="portal-btn-primary" onClick={() => navigate('/portal/tickets/new')}>
            <Plus className="h-4 w-4" />
            Neues Ticket
          </button>
        </div>

        {tickets.length === 0 ? (
          <div className="portal-glass text-center py-16 px-6">
            <Ticket className="h-10 w-10 mx-auto mb-3" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
            <h3 className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--portal-text))' }}>Keine Tickets</h3>
            <p className="text-xs mb-5" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
              Sie haben noch keine Support-Tickets erstellt.
            </p>
            <button className="portal-btn-primary" onClick={() => navigate('/portal/tickets/new')}>
              <Plus className="h-4 w-4" />
              Erstes Ticket erstellen
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(ticket => (
              <Link key={ticket.id} to={`/portal/tickets/${ticket.id}`} className="block">
                <div className="portal-glass px-5 py-4 cursor-pointer group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="font-mono text-[11px]" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                          {ticket.ticket_number}
                        </span>
                        <span className={`portal-badge ${STATUS_BADGE_CLASS[ticket.status] || 'portal-badge-open'}`}>
                          {STATUS_LABELS[ticket.status] || ticket.status}
                        </span>
                        <span className="portal-badge portal-badge-open">
                          {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                        </span>
                      </div>
                      <h3 className="text-sm font-medium truncate" style={{ color: 'hsl(var(--portal-text))' }}>
                        {ticket.title}
                      </h3>
                      <p className="text-xs mt-1 line-clamp-1" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                        {ticket.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] whitespace-nowrap" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
                      </span>
                      <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
