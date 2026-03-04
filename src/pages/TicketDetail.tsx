import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Clock, ArrowRightLeft, UserCheck, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TICKET_STATUSES, TICKET_PRIORITIES,
  STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS,
} from '@/lib/ticket-types';
import type { Ticket, TicketEvent, Department } from '@/lib/ticket-types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Profile { id: string; display_name: string; short_code: string; }

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const fetchAll = async () => {
    if (!id) return;
    const [ticketRes, eventsRes, deptRes, profileRes] = await Promise.all([
      supabase.from('tickets' as any).select('*').eq('id', id).single(),
      supabase.from('ticket_events' as any).select('*').eq('ticket_id', id).order('created_at', { ascending: false }),
      supabase.from('departments').select('*').order('sort_order'),
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).order('display_name'),
    ]);

    const t = ticketRes.data as Ticket | null;
    const evts = (eventsRes.data || []) as TicketEvent[];
    const depts = (deptRes.data || []) as Department[];
    const profs = (profileRes.data || []) as Profile[];

    setDepartments(depts);
    setProfiles(profs);

    const profMap = new Map(profs.map(p => [p.id, p.display_name]));
    const deptMap = new Map(depts.map(d => [d.id, d.name]));

    // Enrich events
    evts.forEach(e => {
      e.actor_name = e.actor_id ? profMap.get(e.actor_id) : undefined;
      e.from_dept_name = e.from_department_id ? deptMap.get(e.from_department_id) : undefined;
      e.to_dept_name = e.to_department_id ? deptMap.get(e.to_department_id) : undefined;
    });
    setEvents(evts);

    if (t) {
      t.assignee_name = t.assigned_to ? profMap.get(t.assigned_to) : undefined;
      t.department_name = deptMap.get(t.department_id);
      setTicket(t);
      setTitle(t.title);
      setDescription(t.description || '');
      setStatus(t.status);
      setPriority(t.priority);
      setAssignedTo(t.assigned_to || '');
      setDepartmentId(t.department_id);
      setDueDate(t.due_date || '');
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const handleSave = async () => {
    if (!ticket || !title.trim()) return toast.error('Titel erforderlich');
    setSaving(true);
    try {
      // Handle department move via RPC if changed
      if (departmentId !== ticket.department_id) {
        await supabase.rpc('move_ticket', { p_ticket_id: ticket.id, p_to_department_id: departmentId });
      }
      // Handle status change via RPC if changed
      if (status !== ticket.status) {
        await supabase.rpc('change_ticket_status', { p_ticket_id: ticket.id, p_to_status: status });
      }
      // Update other fields directly
      const { error } = await supabase.from('tickets' as any).update({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
      }).eq('id', ticket.id);
      if (error) throw error;
      toast.success('Ticket aktualisiert');
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = ticket && (
    title !== ticket.title ||
    description !== (ticket.description || '') ||
    status !== ticket.status ||
    priority !== ticket.priority ||
    assignedTo !== (ticket.assigned_to || '') ||
    departmentId !== ticket.department_id ||
    dueDate !== (ticket.due_date || '')
  );

  if (loading) {
    return <AppLayout><p className="text-xs text-muted-foreground p-8">Laden…</p></AppLayout>;
  }
  if (!ticket) {
    return <AppLayout><p className="text-xs text-muted-foreground p-8">Ticket nicht gefunden</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_key}</span>
              <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[ticket.status])} />
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[ticket.status]}</span>
              <span className={cn('text-xs font-medium', PRIORITY_COLORS[ticket.priority])}>
                {PRIORITY_LABELS[ticket.priority]}
              </span>
            </div>
            <h1 className="text-lg font-semibold text-foreground truncate">{ticket.title}</h1>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs gap-1">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Speichern
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Editable fields */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-md border border-border bg-card p-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Titel</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Beschreibung</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} className="text-xs min-h-[80px]" />
              </div>
            </div>

            {/* History */}
            <div className="rounded-md border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3">Historie</h3>
              {events.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">Keine Einträge</p>
              ) : (
                <div className="space-y-3">
                  {events.map(ev => (
                    <div key={ev.id} className="flex gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        {ev.event_type === 'created' && <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--status-done))]" />}
                        {ev.event_type === 'moved' && <ArrowRightLeft className="h-3.5 w-3.5 text-[hsl(var(--status-planning))]" />}
                        {ev.event_type === 'status_changed' && <Clock className="h-3.5 w-3.5 text-[hsl(var(--status-working))]" />}
                        {ev.event_type === 'assigned' && <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                        {ev.event_type === 'comment' && <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground">
                          {ev.event_type === 'created' && <><span className="font-medium">{ev.actor_name || 'System'}</span> hat das Ticket erstellt</>}
                          {ev.event_type === 'moved' && <><span className="font-medium">{ev.actor_name || 'System'}</span> verschob von <span className="font-medium">{ev.from_dept_name}</span> nach <span className="font-medium">{ev.to_dept_name}</span></>}
                          {ev.event_type === 'status_changed' && <><span className="font-medium">{ev.actor_name || 'System'}</span> änderte Status: <span className="font-medium">{STATUS_LABELS[ev.from_status || ''] || ev.from_status}</span> → <span className="font-medium">{STATUS_LABELS[ev.to_status || ''] || ev.to_status}</span></>}
                          {ev.event_type === 'assigned' && <><span className="font-medium">{ev.actor_name || 'System'}</span> hat Zuweisung geändert</>}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(ev.created_at), 'dd. MMM yyyy, HH:mm', { locale: de })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Sidebar fields */}
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priorität</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Abteilung</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Zugewiesen an</Label>
                <Select value={assignedTo || '_none'} onValueChange={v => setAssignedTo(v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Niemand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none" className="text-xs">Niemand</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fällig am</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-4 space-y-1.5 text-[10px] text-muted-foreground">
              <p>Erstellt: {format(new Date(ticket.created_at), 'dd.MM.yyyy HH:mm')}</p>
              <p>Aktualisiert: {format(new Date(ticket.updated_at), 'dd.MM.yyyy HH:mm')}</p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
