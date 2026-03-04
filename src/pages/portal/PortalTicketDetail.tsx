import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Send, Loader2, Paperclip, X, FileText, Download } from 'lucide-react';
import { FileAttachments } from '@/components/FileAttachments';
import { formatDistanceToNow, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

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
    const { data } = await supabase.from('support_tickets').select('*').eq('id', id).single();
    setTicket(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('ticket_messages').select('*').eq('ticket_id', id).eq('is_internal', false)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSend = async () => {
    if (!newMessage.trim() && files.length === 0) return;
    setSending(true);
    try {
      const attachmentPaths: string[] = [];
      for (const file of files) {
        const path = `tickets/${id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('support-attachments').upload(path, file);
        if (!error) attachmentPaths.push(path);
      }
      const body = newMessage.trim() + (attachmentPaths.length > 0
        ? '\n\n📎 Anhänge: ' + attachmentPaths.map(p => p.split('/').pop()).join(', ') : '');
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: id, sender_type: 'customer', sender_id: customer!.auth_user_id, body, is_internal: false,
      });
      if (error) throw error;
      setNewMessage('');
      setFiles([]);
      fetchMessages();
    } catch {
      toast.error('Nachricht konnte nicht gesendet werden');
    } finally {
      setSending(false);
    }
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

  if (!ticket) {
    return (
      <PortalLayout>
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'hsl(var(--portal-text-secondary))' }}>Ticket nicht gefunden</p>
          <button onClick={() => navigate('/portal/tickets')} className="portal-btn-primary mt-4">Zurück</button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/portal/tickets')}
            className="flex items-center gap-1.5 text-xs font-medium mb-4 transition-colors hover:opacity-80"
            style={{ color: 'hsl(var(--portal-accent))' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurück zu Tickets
          </button>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="font-mono text-xs" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                  {ticket.ticket_number}
                </span>
                <span className={`portal-badge ${STATUS_BADGE_CLASS[ticket.status] || 'portal-badge-open'}`}>
                  {STATUS_LABELS[ticket.status]}
                </span>
                <span className="portal-badge portal-badge-open">
                  {PRIORITY_LABELS[ticket.priority]}
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'hsl(var(--portal-text))' }}>
                {ticket.title}
              </h1>
              <p className="text-xs mt-1" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Erstellt {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="portal-glass-strong p-6">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--portal-text))' }}>
            Nachrichten ({messages.length})
          </h2>

          {messages.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
              Noch keine Nachrichten.
            </p>
          ) : (
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`px-4 py-3 text-sm ${
                    msg.sender_type === 'customer' ? 'portal-msg-customer ml-8' : 'portal-msg-support mr-8'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text))' }}>
                      {msg.sender_type === 'customer' ? 'Sie' : 'Support-Team'}
                    </span>
                    <span className="text-[11px]" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                      {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'hsl(var(--portal-text) / 0.85)' }}>
                    {msg.body}
                  </p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Reply */}
          {ticket.status !== 'closed' && (
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid hsl(var(--portal-glass-border) / 0.3)' }}>
              <textarea
                placeholder="Ihre Nachricht..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                rows={3}
                className="portal-textarea"
                disabled={sending}
              />
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px]"
                      style={{ background: 'hsl(var(--portal-surface))', color: 'hsl(var(--portal-text-secondary))' }}>
                      <Paperclip className="h-3 w-3" />
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button className="portal-btn-primary" onClick={handleSend} disabled={sending || (!newMessage.trim() && files.length === 0)}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Senden
                </button>
                <label className="cursor-pointer transition-opacity hover:opacity-70" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                  <Paperclip className="h-4 w-4" />
                  <input type="file" className="hidden" onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} multiple disabled={sending} />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
