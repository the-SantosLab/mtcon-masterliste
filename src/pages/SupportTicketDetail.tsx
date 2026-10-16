import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Send, Loader2, CheckCircle, XCircle, RotateCcw, UserPlus } from 'lucide-react';
import { FileAttachments } from '@/components/FileAttachments';
import { TicketTemplates } from '@/components/TicketTemplates';

import { CreateCaseFromTicket } from '@/components/CreateCaseFromTicket';
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MtiqRequestSuggest } from '@/components/mtiq/MtiqRequestSuggest';

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

export default function SupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; display_name: string; short_code: string }[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchAll();
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).then(r => setProfiles(r.data || []));
      const ch = supabase.channel(`staff-ticket-${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages', filter: `ticket_id=eq.${id}` }, () => fetchMessages())
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    }
  }, [id]);

  const fetchAll = async () => {
    await Promise.all([fetchTicket(), fetchMessages()]);
    setLoading(false);
  };

  const fetchTicket = async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*, customer:portal_customers!support_tickets_customer_id_fkey(display_name, company_name, email), assignee:users_profile!support_tickets_assigned_to_fkey(display_name, short_code)')
      .eq('id', id)
      .single();
    setTicket(data);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleStatusChange = async (newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'resolved') updates.resolved_at = new Date().toISOString();
    if (newStatus === 'closed') updates.closed_at = new Date().toISOString();
    if (newStatus === 'open') { updates.resolved_at = null; updates.closed_at = null; }
    const { error } = await supabase.from('support_tickets').update(updates).eq('id', id);
    if (error) toast.error('Fehler'); else { toast.success(`Status: ${STATUS_LABELS[newStatus]}`); fetchTicket(); }
  };

  const handleAssign = async (userId: string) => {
    // Status NICHT automatisch ändern — Zuweisung und Bearbeitungsstatus sind unabhängig.
    // Nur bei "Offen" wird automatisch auf "In Bearbeitung" gewechselt, weil eine offene
    // Meldung nach Zuweisung de facto in Arbeit ist. Abgeschlossene/gelöste/wartende Tickets
    // bleiben unverändert.
    const updates: any = { assigned_to: userId, updated_at: new Date().toISOString() };
    if (ticket?.status === 'open') updates.status = 'in_progress';
    const { error } = await supabase.from('support_tickets').update(updates).eq('id', id);
    if (error) toast.error('Fehler'); else { toast.success('Zugewiesen'); fetchTicket(); }
  };


  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: id,
        sender_type: 'staff',
        sender_id: user!.id,
        body: replyText,
        is_internal: isInternal,
      });
      if (error) throw error;
      setReplyText('');
      setIsInternal(false);
      fetchMessages();
      toast.success(isInternal ? 'Interne Notiz gespeichert' : 'Antwort gesendet');
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const getSenderName = (msg: any) => {
    if (msg.sender_type === 'customer') return ticket?.customer?.display_name || 'Kunde';
    const prof = profiles.find(p => p.id === msg.sender_id);
    return prof?.display_name || 'Mitarbeiter';
  };

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppLayout>;
  }

  if (!ticket) {
    return <AppLayout><div className="text-center py-16"><p className="text-muted-foreground">Ticket nicht gefunden</p></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-4 max-w-5xl">
        {/* Header */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/support')} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1.5" />Zurück
          </Button>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                <Badge className={`${STATUS_COLORS[ticket.status]} text-white text-[10px] px-1.5 py-0`}>{STATUS_LABELS[ticket.status]}</Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{PRIORITY_LABELS[ticket.priority]}</Badge>
              </div>
              <h1 className="text-lg font-semibold">{ticket.title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ticket.customer?.display_name} {ticket.customer?.company_name && `(${ticket.customer.company_name})`} · {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: de })}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <Card>
          <CardContent className="py-3 px-4 flex flex-wrap gap-2">
            <Select value={ticket.assigned_to || ''} onValueChange={handleAssign}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Zuweisen" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name} ({p.short_code})</SelectItem>)}
              </SelectContent>
            </Select>

            {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleStatusChange('resolved')}>
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Lösen
              </Button>
            )}
            {ticket.status === 'resolved' && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleStatusChange('closed')}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />Schließen
              </Button>
            )}
            {(ticket.status === 'resolved' || ticket.status === 'closed') && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleStatusChange('open')}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Wiedereröffnen
              </Button>
            )}
            {ticket.status !== 'waiting' && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleStatusChange('waiting')}>
                Auf Rückmeldung warten
              </Button>
            )}

            <div className="border-l border-border mx-1" />

            <CreateCaseFromTicket ticket={ticket} messages={messages} profiles={profiles} />
            <MtiqRequestSuggest title={ticket.title} text={[ticket.title, ticket.description, ...messages.filter((m: any) => !m.is_internal).map((m: any) => m.body ?? m.message ?? '')].filter(Boolean).join('\n\n')} />
          </CardContent>
        </Card>


        {/* Attachments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Anhänge</CardTitle>
          </CardHeader>
          <CardContent>
            <FileAttachments
              bucket="support-attachments"
              folder={`tickets/${id}`}
              fallbackFolders={[`internal/${id}`]}
              canUpload
              canDelete
            />

          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Verlauf ({messages.length + 1})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[500px] overflow-y-auto space-y-3 pr-1">
              {ticket.description && (
                <div className="rounded-lg px-4 py-3 text-sm bg-muted mr-12 border border-border">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium">
                      {ticket.customer?.display_name || profiles.find(p => p.id === ticket.reporter_user_id)?.display_name || 'Meldung'}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">Erstmeldung</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(ticket.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground/90">{ticket.description}</p>
                </div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn(
                    'rounded-lg px-4 py-3 text-sm',
                    msg.is_internal
                      ? 'bg-yellow-500/10 border border-yellow-500/20'
                      : msg.sender_type === 'customer'
                        ? 'bg-muted mr-12'
                        : 'bg-primary/10 ml-12'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium">{getSenderName(msg)}</span>
                    {msg.is_internal && <Badge variant="outline" className="text-[9px] px-1 py-0 border-yellow-500/40 text-yellow-600">intern</Badge>}
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground/90">{msg.body}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <TicketTemplates onSelect={(body) => setReplyText(prev => prev ? prev + '\n' + body : body)} />
              </div>
              <Textarea
                placeholder={isInternal ? 'Interne Notiz (nicht sichtbar für den Kunden)...' : 'Antwort an den Kunden...'}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={4}
                className={cn('text-sm', isInternal && 'border-yellow-500/40')}
                disabled={sending}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleReply(); }}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch id="internal" checked={isInternal} onCheckedChange={setIsInternal} />
                  <Label htmlFor="internal" className="text-xs text-muted-foreground cursor-pointer">Interne Notiz</Label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Cmd/Ctrl + Enter</span>
                  <Button size="sm" onClick={handleReply} disabled={sending || !replyText.trim()}>
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    {isInternal ? 'Notiz speichern' : 'Antwort senden'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
