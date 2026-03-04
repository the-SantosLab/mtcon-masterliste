import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Send, Loader2, Paperclip, X } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen', in_progress: 'In Bearbeitung', waiting: 'Wartend', resolved: 'Gelöst', closed: 'Geschlossen',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-[hsl(var(--status-open))]', in_progress: 'bg-[hsl(var(--status-working))]',
  waiting: 'bg-[hsl(var(--status-planning))]', resolved: 'bg-[hsl(var(--status-done))]',
  closed: 'bg-muted-foreground',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch',
};

export default function PortalTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customer } = usePortalAuth();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (customer && id) {
      fetchData();
      // Realtime subscription
      const channel = supabase
        .channel(`portal-ticket-${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` }, () => fetchMessages())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [customer, id]);

  const fetchData = async () => {
    await Promise.all([fetchTicket(), fetchMessages()]);
    setLoading(false);
  };

  const fetchTicket = async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .single();
    setTicket(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSend = async () => {
    if (!newMessage.trim() && files.length === 0) return;
    setSending(true);
    try {
      // Upload files
      const attachmentPaths: string[] = [];
      for (const file of files) {
        const path = `tickets/${id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('support-attachments').upload(path, file);
        if (!error) attachmentPaths.push(path);
      }

      const body = newMessage.trim() + (attachmentPaths.length > 0
        ? '\n\n📎 Anhänge: ' + attachmentPaths.map(p => p.split('/').pop()).join(', ')
        : '');

      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: id,
        sender_type: 'customer',
        sender_id: customer!.auth_user_id,
        body,
        is_internal: false,
      });
      if (error) throw error;
      setNewMessage('');
      setFiles([]);
      fetchMessages();
    } catch (err: any) {
      toast.error('Nachricht konnte nicht gesendet werden');
    } finally {
      setSending(false);
    }
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

  if (!ticket) {
    return (
      <PortalLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">Ticket nicht gefunden</p>
          <Button size="sm" variant="outline" onClick={() => navigate('/portal/tickets')} className="mt-3">Zurück</Button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-4 max-w-3xl">
        {/* Header */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/portal/tickets')} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1.5" />Zurück
          </Button>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                <Badge className={`${STATUS_COLORS[ticket.status]} text-white text-[10px] px-1.5 py-0`}>
                  {STATUS_LABELS[ticket.status]}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {PRIORITY_LABELS[ticket.priority]}
                </Badge>
              </div>
              <h1 className="text-lg font-semibold text-foreground">{ticket.title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Erstellt {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Nachrichten ({messages.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Noch keine Nachrichten.
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`rounded-lg px-4 py-3 text-sm ${
                      msg.sender_type === 'customer'
                        ? 'bg-primary/10 ml-8'
                        : 'bg-muted mr-8'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-foreground">
                        {msg.sender_type === 'customer' ? 'Sie' : 'Support-Team'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground/90">{msg.body}</p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Reply box - only if ticket is not closed */}
            {ticket.status !== 'closed' && (
              <div className="border-t border-border pt-4 space-y-3">
                <Textarea
                  placeholder="Ihre Nachricht..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  rows={3}
                  className="text-sm"
                  disabled={sending}
                />
                {/* File attachments */}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-[11px]">
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{f.name}</span>
                        <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSend} disabled={sending || (!newMessage.trim() && files.length === 0)}>
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    Senden
                  </Button>
                  <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    <Paperclip className="h-4 w-4" />
                    <input type="file" className="hidden" onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} multiple disabled={sending} />
                  </label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
