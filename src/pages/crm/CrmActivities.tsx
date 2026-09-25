import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Phone, Mail, Calendar, FileText, ListTodo, Bell, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_ICON: Record<string, any> = { call: Phone, email: Mail, meeting: Calendar, note: FileText, task: ListTodo, followup: Bell };
const TYPE_LABEL: Record<string, string> = { call: 'Anruf', email: 'E-Mail', meeting: 'Meeting', note: 'Notiz', task: 'Task', followup: 'Follow-up' };

export default function CrmActivities() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [tracking, setTracking] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const [typeF, setTypeF] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ type: 'task', subject: '', body: '', due_at: '' });

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('crm_activities')
      .select('*, deals(id, title), companies(id, name)')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    setRows(data ?? []);
    const emailIds = (data ?? []).filter((r: any) => r.type === 'email').map((r: any) => r.id);
    if (emailIds.length) {
      const { data: tr } = await (supabase as any).from('crm_email_tracking').select('*').in('activity_id', emailIds);
      const map: Record<string, any> = {};
      (tr ?? []).forEach((t: any) => { map[t.activity_id] = t; });
      setTracking(map);
    } else { setTracking({}); }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows.filter(r => {
      if (typeF !== 'all' && r.type !== typeF) return false;
      if (tab === 'mine' && r.owner_id !== user?.id) return false;
      if (tab === 'overdue') {
        if (r.completed_at) return false;
        if (!r.due_at || new Date(r.due_at).getTime() > now) return false;
      }
      return true;
    });
  }, [rows, tab, typeF, user?.id]);

  const toggleDone = async (a: any) => {
    const patch = a.completed_at ? { completed_at: null, completed_by: null } : { completed_at: new Date().toISOString(), completed_by: user?.id };
    const { error } = await supabase.from('crm_activities').update(patch).eq('id', a.id);
    if (error) toast.error(error.message); else void load();
  };

  const create = async () => {
    if (!form.subject) { toast.error('Titel erforderlich'); return; }
    const doneAt = form.done ? (form.done_at ? new Date(form.done_at).toISOString() : new Date().toISOString()) : null;
    const { error } = await supabase.from('crm_activities').insert({
      type: form.type, subject: form.subject, body: form.body || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      completed_at: doneAt, completed_by: doneAt ? user?.id : null,
      owner_id: user?.id, auto_generated: false,
    });
    if (error) { toast.error(error.message); return; }
    setOpen(false); setForm({ type: 'task', subject: '', body: '', due_at: '', done: false, done_at: '' });
    void load();
  };

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Aktivitäten</h1>
        <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Neue Aktivität</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="mine">Meine Aufgaben</TabsTrigger>
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="overdue">Überfällig</TabsTrigger>
          </TabsList>
          <Select value={typeF} onValueChange={setTypeF}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value={tab} className="mt-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Keine Aktivitäten.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map(a => {
                const Icon = TYPE_ICON[a.type] ?? ListTodo;
                const overdue = !a.completed_at && a.due_at && new Date(a.due_at).getTime() < Date.now();
                return (
                  <li key={a.id} className="flex items-start gap-3 p-3 rounded border border-border bg-card/40">
                    <Checkbox checked={!!a.completed_at} onCheckedChange={() => toggleDone(a)} className="mt-0.5" />
                    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium ${a.completed_at ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{a.subject}</span>
                        {a.auto_generated && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-muted text-muted-foreground">Auto</span>}
                        {overdue && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-destructive/20 text-destructive">Überfällig</span>}
                        {a.type === 'email' && tracking[a.id] && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-emerald-500/15 text-emerald-400">Gesendet</span>}
                        {a.type === 'email' && tracking[a.id]?.opened_at && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase bg-blue-500/15 text-blue-400">Geöffnet · {new Date(tracking[a.id].opened_at).toLocaleDateString('de-DE')}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                        {a.deals && <Link to={`/crm/deals/${a.deal_id}`} className="hover:text-primary">→ {a.deals.title}</Link>}
                        {a.companies && <span>· {a.companies.name}</span>}
                        {a.due_at && <span>· Fällig {new Date(a.due_at).toLocaleDateString('de-DE')}</span>}
                      </div>
                      {a.body && <p className="text-[11px] text-muted-foreground mt-1">{a.body}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Aktivität</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Typ</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Titel *</Label>
              <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="h-8 text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notiz</Label>
              <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="text-xs min-h-[60px]" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Fällig am</Label>
              <Input type="datetime-local" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} className="h-8 text-xs" /></div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={!!form.done} onCheckedChange={v => setForm({ ...form, done: !!v })} />
              Bereits erledigt (z. B. Anruf nachtragen)
            </label>
            {form.done && (
              <div className="space-y-1.5"><Label className="text-xs">Erledigt am</Label>
                <Input type="datetime-local" value={form.done_at} onChange={e => setForm({ ...form, done_at: e.target.value })} className="h-8 text-xs" /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={create} className="h-8 text-xs">Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}
