import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FolderPlus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

interface CreateCaseFromTicketProps {
  ticket: {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    priority: string;
    customer?: { display_name: string; company_name?: string; email?: string } | null;
  };
  messages: { sender_type: string; body: string; is_internal: boolean; created_at: string; sender_id: string }[];
  profiles: { id: string; display_name: string; short_code: string }[];
}

export function CreateCaseFromTicket({ ticket, messages, profiles }: CreateCaseFromTicketProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    project_name: `Ticket ${ticket.ticket_number}: ${ticket.title}`,
    department_id: '',
    assignee_id: '',
    note: '',
  });

  useEffect(() => {
    if (open) {
      supabase.from('departments').select('id, name').eq('is_active', true).order('sort_order').then(r => setDepartments(r.data || []));
    }
  }, [open]);

  const buildConversationLog = () => {
    const getSenderName = (msg: any) => {
      if (msg.sender_type === 'customer') return ticket.customer?.display_name || 'Kunde';
      const p = profiles.find(pr => pr.id === msg.sender_id);
      return p?.display_name || 'Mitarbeiter';
    };

    const header = `--- Ticket-Verlauf: ${ticket.ticket_number} ---\nTitel: ${ticket.title}\nBeschreibung: ${ticket.description}\nKunde: ${ticket.customer?.display_name || 'Unbekannt'}${ticket.customer?.company_name ? ` (${ticket.customer.company_name})` : ''}\n\n`;

    const msgs = messages
      .filter(m => !m.is_internal)
      .map(m => {
        const date = format(new Date(m.created_at), 'dd.MM.yyyy HH:mm', { locale: de });
        return `[${date}] ${getSenderName(m)}:\n${m.body}`;
      })
      .join('\n\n');

    return header + msgs;
  };

  const handleCreate = async () => {
    if (!form.project_name.trim()) return;
    setSaving(true);
    try {
      const conversationLog = buildConversationLog();
      const noteText = form.note
        ? `${form.note}\n\n${conversationLog}`
        : conversationLog;

      const { data: newCase, error } = await supabase.from('cases').insert({
        project_name: form.project_name,
        created_by: user!.id,
        department_id: form.department_id || null,
        assignee_id: form.assignee_id || null,
        note: noteText,
        client_name: ticket.customer?.display_name || null,
        customer_no: ticket.customer?.company_name || null,
      }).select('id').single();

      if (error) throw error;

      // Log activity
      await supabase.from('case_activity').insert({
        case_id: newCase.id,
        actor_id: user!.id,
        action: 'created',
        message: `Vorgang erstellt aus Ticket ${ticket.ticket_number}`,
      });

      try { await supabase.functions.invoke('notify-vorgang-created', { body: { caseId: newCase.id, actorId: user!.id } }); } catch {}

      toast.success('Vorgang erstellt');
      setOpen(false);
      navigate(`/cases/${newCase.id}`);
    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
        <FolderPlus className="h-3.5 w-3.5 mr-1.5" />Vorgang erstellen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Vorgang aus Ticket erstellen</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Der gesamte Ticket-Verlauf ({messages.filter(m => !m.is_internal).length} Nachrichten) wird als Notiz im Vorgang angehängt.
          </p>
          <div className="space-y-3">
            <Input
              placeholder="Vorgangsbezeichnung"
              value={form.project_name}
              onChange={e => setForm(p => ({ ...p, project_name: e.target.value }))}
              className="text-xs h-9"
            />
            <Select value={form.department_id} onValueChange={v => setForm(p => ({ ...p, department_id: v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Abteilung (optional)" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.assignee_id} onValueChange={v => setForm(p => ({ ...p, assignee_id: v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Zuständig (optional)" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name} ({p.short_code})</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Zusätzliche Notiz (optional)"
              value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              rows={3}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !form.project_name.trim()}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Vorgang erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
