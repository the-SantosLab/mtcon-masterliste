import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Ticket, CheckCircle, Clock, AlertTriangle, Plus, ArrowRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen', in_progress: 'In Bearbeitung', waiting: 'Wartend', resolved: 'Gelöst', closed: 'Geschlossen',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  open: 'portal-badge-open', in_progress: 'portal-badge-working', waiting: 'portal-badge-waiting',
  resolved: 'portal-badge-done', closed: 'portal-badge-closed',
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
        </div>
      </PortalLayout>
    );
  }

  const kpis = [
    { label: 'Offen', value: open, icon: Ticket, color: 'hsl(220, 10%, 60%)' },
    { label: 'In Bearbeitung', value: inProgress, icon: Clock, color: 'hsl(210, 80%, 60%)' },
    { label: 'Gelöst', value: resolved, icon: CheckCircle, color: 'hsl(152, 50%, 55%)' },
    { label: 'Geschlossen', value: closed, icon: AlertTriangle, color: 'hsl(220, 10%, 45%)' },
  ];

  return (
    <PortalLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(var(--portal-text))' }}>
              Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
              Willkommen zurück, {customer?.display_name}
            </p>
          </div>
          <button className="portal-btn-primary" onClick={() => navigate('/portal/tickets/new')}>
            <Plus className="h-4 w-4" />
            Neues Ticket
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <div key={kpi.label} className="portal-glass portal-kpi px-5 py-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                  {kpi.label}
                </span>
                <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
              </div>
              <p className="text-3xl font-bold tabular-nums" style={{ color: 'hsl(var(--portal-text))' }}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        {/* Recent tickets */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: 'hsl(var(--portal-text))' }}>
              Letzte Tickets
            </h2>
            <button
              onClick={() => navigate('/portal/tickets')}
              className="text-xs font-medium flex items-center gap-1 transition-colors hover:opacity-80"
              style={{ color: 'hsl(var(--portal-accent))' }}
            >
              Alle anzeigen
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="portal-glass text-center py-16 px-6">
              <Ticket className="h-10 w-10 mx-auto mb-3" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'hsl(var(--portal-text))' }}>
                Noch keine Tickets
              </p>
              <p className="text-xs mb-5" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Erstellen Sie Ihr erstes Support-Ticket.
              </p>
              <button className="portal-btn-primary" onClick={() => navigate('/portal/tickets/new')}>
                <Plus className="h-4 w-4" />
                Ticket erstellen
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map(ticket => (
                <div
                  key={ticket.id}
                  className="portal-glass px-5 py-4 cursor-pointer group"
                  onClick={() => navigate(`/portal/tickets/${ticket.id}`)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="font-mono text-[11px]" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                          {ticket.ticket_number}
                        </span>
                        <span className={`portal-badge ${STATUS_BADGE_CLASS[ticket.status] || 'portal-badge-open'}`}>
                          {STATUS_LABELS[ticket.status] || ticket.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--portal-text))' }}>
                        {ticket.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] whitespace-nowrap" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
                      </span>
                      <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
