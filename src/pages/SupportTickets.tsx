import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Headphones, AlertCircle, CheckCircle, Clock, MessageSquare, UserPlus, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { usePreferences } from '@/contexts/PreferencesContext';

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

type TicketRow = {
  id: string; ticket_number: string; title: string; description: string;
  status: string; priority: string; customer_id: string | null; assigned_to: string | null;
  source: 'intern' | 'extern' | null; kind: string | null; reporter_user_id: string | null;
  case_id: string | null; ai_triage: any;
  created_at: string; updated_at: string; resolved_at: string | null; closed_at: string | null;
  customer: { display_name: string; company_name: string | null } | null;
  assignee: { display_name: string; short_code: string } | null;
  reporter: { display_name: string; short_code: string } | null;
};

const KIND_LABELS: Record<string, string> = {
  bug: 'Bug', idee: 'Idee', frage: 'Frage', sonstige: 'Sonstiges',
};

export default function SupportTickets() {
  const { user, isAdmin } = useAuth();
  const { preferences } = usePreferences();
  const compact = preferences.compactTables;
  const cellCls = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs';
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; display_name: string; short_code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'intern' | 'extern'>('all');
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*, customer:portal_customers!support_tickets_customer_id_fkey(display_name, company_name), assignee:users_profile!support_tickets_assigned_to_fkey(display_name, short_code)')
      .order('created_at', { ascending: false });
    setTickets(((data as any[]) || []) as TicketRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
    supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).then(r => setProfiles(r.data || []));
    const ch = supabase.channel('support-tickets-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleAssign = async (ticketId: string, userId: string) => {
    const { error } = await supabase
      .from('support_tickets')
      .update({ assigned_to: userId, status: 'in_progress' as any, updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    if (error) toast.error('Fehler: ' + error.message);
    else { toast.success('Ticket zugewiesen'); fetchTickets(); }
  };

  const reporterById = (id: string | null) => id ? profiles.find(p => p.id === id) : null;

  const filtered = tickets.filter(t => {
    if (sourceFilter !== 'all' && (t.source ?? 'extern') !== sourceFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (assigneeFilter === 'unassigned' && t.assigned_to !== null) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && t.assigned_to !== assigneeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const reporter = reporterById(t.reporter_user_id);
      if (![t.ticket_number, t.title, t.customer?.display_name, t.customer?.company_name, reporter?.display_name, reporter?.short_code].some(v => v?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const internCount = tickets.filter(t => t.source === 'intern').length;

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Support-Tickets</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Kundenanfragen sowie interne Bug-/Feedback-Meldungen verwalten · {internCount} intern</p>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />Kunden einladen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle className="text-sm">Kunden einladen</DialogTitle></DialogHeader>
              <InviteCustomerForm userId={user?.id || ''} onDone={() => setInviteOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-[hsl(var(--status-overdue))]" />
              <div><p className="text-[11px] text-muted-foreground">Offen</p><p className="text-xl font-bold">{openCount}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-[hsl(var(--status-done))]" />
              <div><p className="text-[11px] text-muted-foreground">Gelöst</p><p className="text-xl font-bold">{resolvedCount}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div><p className="text-[11px] text-muted-foreground">Gesamt</p><p className="text-xl font-bold">{tickets.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-[hsl(var(--status-planning))]" />
              <div><p className="text-[11px] text-muted-foreground">Wartend</p><p className="text-xl font-bold">{tickets.filter(t => t.status === 'waiting').length}</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche" className="pl-9 h-8 text-xs" />
          </div>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Quelle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Quellen</SelectItem>
              <SelectItem value="extern">Extern (Kunde)</SelectItem>
              <SelectItem value="intern">Intern (Bug/Idee)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Priorität" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Bearbeiter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.short_code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Nr.</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Betreff</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Kunde / Melder</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Priorität</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Status</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Bearbeiter</th>
                <th className={cn(cellCls, 'text-left font-medium text-muted-foreground')}>Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Laden…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className={cn(cellCls, 'py-8 text-center text-muted-foreground')}>Keine Tickets gefunden</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                  <td className={cn(cellCls, 'font-mono')}>
                    <Link to={`/support/${t.id}`} className="text-primary hover:underline">{t.ticket_number}</Link>
                  </td>
                  <td className={cn(cellCls, 'text-foreground max-w-[260px]')}>
                    <Link to={`/support/${t.id}`} className="hover:text-primary line-clamp-1">{t.title}</Link>
                    <div className="flex items-center gap-1 mt-0.5">
                      {t.source === 'intern' ? (
                        <>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary">Intern</Badge>
                          {t.kind && <Badge variant="outline" className="text-[9px] px-1 py-0">{KIND_LABELS[t.kind] ?? t.kind}</Badge>}
                          {t.ai_triage?.module && <span className="text-[9px] text-muted-foreground">· {t.ai_triage.module}</span>}
                        </>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">Extern</Badge>
                      )}
                    </div>
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground')}>
                    {t.source === 'intern' ? (
                      <div className="text-[11px]">{reporterById(t.reporter_user_id)?.short_code ?? '—'}</div>
                    ) : (
                      <>
                        <div>{t.customer?.display_name || '–'}</div>
                        {t.customer?.company_name && <div className="text-[10px] text-muted-foreground/60">{t.customer.company_name}</div>}
                      </>
                    )}
                  </td>
                  <td className={cellCls}>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{PRIORITY_LABELS[t.priority]}</Badge>
                    {t.source === 'intern' && t.ai_triage?.severity && t.ai_triage.severity !== t.priority && (
                      <div className="text-[9px] text-muted-foreground mt-0.5">MTIQ: {PRIORITY_LABELS[t.ai_triage.severity] ?? t.ai_triage.severity}</div>
                    )}
                  </td>
                  <td className={cellCls}>
                    <Badge className={`${STATUS_COLORS[t.status]} text-white text-[10px] px-1.5 py-0`}>{STATUS_LABELS[t.status]}</Badge>
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground')}>
                    {t.assignee ? t.assignee.short_code : (
                      <Select onValueChange={v => handleAssign(t.id, v)}>
                        <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue placeholder="Zuweisen" /></SelectTrigger>
                        <SelectContent>
                          {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.short_code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className={cn(cellCls, 'text-muted-foreground tabular-nums')}>
                    {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: de })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{filtered.length} Ticket(s)</p>
      </div>
    </AppLayout>
  );
}

function InviteCustomerForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(-10) + 'A1!');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !displayName) { toast.error('E-Mail und Name sind Pflicht'); return; }
    setSaving(true);
    try {
      const res = await supabase.functions.invoke('invite-portal-customer', {
        body: { email, displayName, companyName: companyName || null, password, invitedBy: userId },
      });
      if (res.error) throw res.error;
      toast.success(`Kunde eingeladen. Passwort: ${password}`, { duration: 10000 });
      onDone();
    } catch (err: any) {
      toast.error('Fehler: ' + (err.message || 'Einladung fehlgeschlagen'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 mt-2">
      <div className="space-y-1"><Label className="text-xs">E-Mail *</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="kunde@firma.de" className="h-8 text-xs" required /></div>
      <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Max Mustermann" className="h-8 text-xs" required /></div>
      <div className="space-y-1"><Label className="text-xs">Firma</Label><Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Firma GmbH" className="h-8 text-xs" /></div>
      <div className="space-y-1">
        <Label className="text-xs">Generiertes Passwort</Label>
        <Input value={password} onChange={e => setPassword(e.target.value)} className="h-8 text-xs font-mono" />
        <p className="text-[10px] text-muted-foreground">Wird dem Kunden mitgeteilt</p>
      </div>
      <Button type="submit" size="sm" className="w-full h-8 text-xs" disabled={saving}>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
        Einladen
      </Button>
    </form>
  );
}
