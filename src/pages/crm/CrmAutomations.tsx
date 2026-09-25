import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { CrmSettingsTabs } from '@/components/crm/CrmSettingsTabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { STAGES } from '@/lib/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';

type Automation = {
  id: string; name: string; is_active: boolean; trigger_event: string; trigger_stage: string | null;
  action_type: string; activity_type: string | null; subject: string; body: string | null;
  due_in_days: number; assignee_id: string | null; run_count: number; last_run_at: string | null;
};
type Profile = { id: string; display_name: string };

const ACTION_LABEL: Record<string, string> = {
  create_activity: 'Aktivität anlegen',
  notify_owner: 'Deal-Owner benachrichtigen',
  notify_user: 'Bestimmte Person benachrichtigen',
};
const ACT_LABEL: Record<string, string> = { call: 'Anruf', meeting: 'Meeting', email: 'E-Mail', task: 'Aufgabe' };
const stageLabel = (k: string | null) => (k ? STAGES.find(s => s.key === k)?.label ?? k : 'beliebige Stufe');

const EMPTY = {
  name: '', trigger_event: 'stage_changed', trigger_stage: 'angebot_versendet', action_type: 'create_activity',
  activity_type: 'call', subject: '', body: '', due_in_days: '3', assignee_id: '__owner',
};

export default function CrmAutomations() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<Automation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rotting, setRotting] = useState<{ stage: string; rotting_days: number | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const load = async () => {
    const [a, p, r] = await Promise.all([
      supabase.from('crm_automations').select('*').order('created_at'),
      supabase.from('users_profile').select('id,display_name').eq('active', true).order('display_name'),
      supabase.from('crm_stage_probabilities').select('stage, rotting_days'),
    ]);
    setRows((a.data as Automation[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
    const order = STAGES.map(s => s.key as string);
    setRotting(((r.data as any[]) ?? []).filter(x => !['won', 'lost'].includes(x.stage)).sort((x, y) => order.indexOf(x.stage) - order.indexOf(y.stage)));
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!form.name.trim() || !form.subject.trim()) { toast.error('Name und Betreff erforderlich'); return; }
    if (form.action_type === 'notify_user' && form.assignee_id === '__owner') { toast.error('Person auswählen'); return; }
    const { error } = await supabase.from('crm_automations').insert({
      name: form.name.trim(),
      trigger_event: form.trigger_event,
      trigger_stage: form.trigger_event === 'stage_changed' && form.trigger_stage !== '__any' ? form.trigger_stage as any : null,
      action_type: form.action_type,
      activity_type: form.action_type === 'create_activity' ? form.activity_type as any : null,
      subject: form.subject.trim(),
      body: form.body.trim() || null,
      due_in_days: Number(form.due_in_days) || 0,
      assignee_id: form.assignee_id === '__owner' ? null : form.assignee_id,
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Automatisierung gespeichert');
    setOpen(false); setForm({ ...EMPTY }); void load();
  };

  const toggle = async (r: Automation) => {
    const { error } = await supabase.from('crm_automations').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };
  const remove = async (id: string) => {
    if (!confirm('Automatisierung löschen?')) return;
    const { error } = await supabase.from('crm_automations').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    void load();
  };
  const saveRotting = async (stage: string, v: string) => {
    const { error } = await supabase.from('crm_stage_probabilities').update({ rotting_days: v ? Number(v) : null }).eq('stage', stage as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert');
    void load();
  };

  const who = (id: string | null) => (id ? profiles.find(p => p.id === id)?.display_name ?? '—' : 'Deal-Owner');

  return (
    <CrmLayout>
      <div className="p-6 max-w-[1200px]">
        <CrmSettingsTabs />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Zap className="h-4 w-4" />Automatisierungen</h1>
            <p className="text-xs text-muted-foreground mt-1">Wenn ein Deal angelegt wird oder in eine Stufe wechselt, führt das System automatisch eine Aktion aus.</p>
          </div>
          {isAdmin && <Button size="sm" onClick={() => setOpen(true)} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" />Neue Automatisierung</Button>}
        </div>

        <Card className="border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden mb-6">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="text-left p-2">Aktiv</th><th className="text-left p-2">Name</th>
                <th className="text-left p-2">Wenn</th><th className="text-left p-2">Dann</th>
                <th className="text-right p-2">Ausgeführt</th>{isAdmin && <th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Noch keine Automatisierungen.</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="p-2"><Switch checked={r.is_active} onCheckedChange={() => toggle(r)} disabled={!isAdmin} /></td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 text-muted-foreground">{r.trigger_event === 'deal_created' ? 'Deal angelegt' : `Deal wechselt nach „${stageLabel(r.trigger_stage)}"`}</td>
                  <td className="p-2 text-muted-foreground">
                    {ACTION_LABEL[r.action_type]}
                    {r.action_type === 'create_activity' && ` (${ACT_LABEL[r.activity_type ?? 'task']}, in ${r.due_in_days} T, für ${who(r.assignee_id)})`}
                    {r.action_type === 'notify_user' && ` (${who(r.assignee_id)})`}
                    <span className="block text-foreground/80">„{r.subject}"</span>
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {r.run_count}×{r.last_run_at && <span className="block text-[10px]">{new Date(r.last_run_at).toLocaleString('de-DE')}</span>}
                  </td>
                  {isAdmin && <td className="p-2"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <h2 className="text-sm font-semibold mb-1">Fäulnis-Grenzen</h2>
        <p className="text-xs text-muted-foreground mb-3">Nach so vielen Tagen ohne Stufenwechsel oder erledigte Aktivität wird ein Deal in der Pipeline rot markiert. Leer = aus.</p>
        <Card className="border-border/50 bg-card/40 backdrop-blur-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {rotting.map(r => (
            <div key={r.stage} className="space-y-1">
              <Label className="text-xs">{stageLabel(r.stage)}</Label>
              <Input type="number" min={0} defaultValue={r.rotting_days ?? ''} disabled={!isAdmin} className="h-8 text-xs"
                onBlur={e => { if (String(r.rotting_days ?? '') !== e.target.value) void saveRotting(r.stage, e.target.value); }} />
            </div>
          ))}
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Neue Automatisierung</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-9" placeholder="z. B. Nachfassen nach Angebot" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Wenn</Label>
                  <Select value={form.trigger_event} onValueChange={v => setForm({ ...form, trigger_event: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="stage_changed">Stufe wechselt</SelectItem><SelectItem value="deal_created">Deal angelegt</SelectItem></SelectContent>
                  </Select></div>
                {form.trigger_event === 'stage_changed' && (
                  <div className="space-y-1"><Label className="text-xs">nach Stufe</Label>
                    <Select value={form.trigger_stage} onValueChange={v => setForm({ ...form, trigger_stage: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__any">beliebige Stufe</SelectItem>
                        {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select></div>
                )}
              </div>
              <div className="space-y-1"><Label className="text-xs">Dann</Label>
                <Select value={form.action_type} onValueChange={v => setForm({ ...form, action_type: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ACTION_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select></div>
              {form.action_type === 'create_activity' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Art</Label>
                    <Select value={form.activity_type} onValueChange={v => setForm({ ...form, activity_type: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(ACT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="space-y-1"><Label className="text-xs">Fällig in Tagen</Label>
                    <Input type="number" min={0} value={form.due_in_days} onChange={e => setForm({ ...form, due_in_days: e.target.value })} className="h-9" /></div>
                </div>
              )}
              {form.action_type !== 'notify_owner' && (
                <div className="space-y-1"><Label className="text-xs">Für</Label>
                  <Select value={form.assignee_id} onValueChange={v => setForm({ ...form, assignee_id: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {form.action_type === 'create_activity' && <SelectItem value="__owner">Deal-Owner</SelectItem>}
                      {form.action_type === 'notify_user' && <SelectItem value="__owner" disabled>Person wählen…</SelectItem>}
                      {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
              )}
              <div className="space-y-1"><Label className="text-xs">{form.action_type === 'create_activity' ? 'Betreff der Aktivität *' : 'Titel der Benachrichtigung *'}</Label>
                <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">Beschreibung (optional)</Label>
                <Input value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="h-9" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button size="sm" onClick={save}>Speichern</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
