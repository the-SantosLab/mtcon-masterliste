import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Workflow } from 'lucide-react';
import { toast } from 'sonner';

interface Rule {
  id: string; name: string; description: string | null;
  document_type_id: string | null; trigger: string;
  conditions: any[]; actions: any[]; is_active: boolean;
}
interface DocType { id: string; code: string; label_de: string; }

const TRIGGERS = [
  { value: 'on_classify', label: 'Nach KI-Klassifizierung' },
  { value: 'on_confirm', label: 'Nach Bestätigung' },
  { value: 'on_schedule', label: 'Geplant (täglich)' },
];
const OPS = ['eq','neq','gt','gte','lt','lte','contains','exists','not_exists','in_days'];
const ACTION_TYPES = [
  { value: 'create_notification', label: 'Benachrichtigung' },
  { value: 'create_case', label: 'Vorgang anlegen' },
  { value: 'send_webhook', label: 'Webhook' },
];

export default function AdminActionRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [types, setTypes] = useState<DocType[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);

  const load = async () => {
    const [r, t] = await Promise.all([
      (supabase as any).from('action_rules').select('*').order('created_at', { ascending: false }),
      (supabase as any).from('document_types').select('id, code, label_de').order('sort_order'),
    ]);
    setRules((r.data || []) as Rule[]);
    setTypes((t.data || []) as DocType[]);
  };
  useEffect(() => { load(); }, []);

  const save = async (r: Rule) => {
    const payload = {
      name: r.name, description: r.description, document_type_id: r.document_type_id,
      trigger: r.trigger, conditions: r.conditions, actions: r.actions, is_active: r.is_active,
    };
    const { error } = r.id
      ? await (supabase as any).from('action_rules').update(payload).eq('id', r.id)
      : await (supabase as any).from('action_rules').insert(payload);
    if (error) toast.error(error.message); else { toast.success('Gespeichert'); setEditing(null); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Löschen?')) return;
    await (supabase as any).from('action_rules').delete().eq('id', id);
    load();
  };

  const typeName = (id: string | null) => id ? types.find((t) => t.id === id)?.label_de : 'Alle Typen';

  return (
    <AppLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Workflow className="h-6 w-6" /> Automationsregeln</h1>
          <Button onClick={() => setEditing({
            id: '', name: '', description: '', document_type_id: null,
            trigger: 'on_classify', conditions: [], actions: [], is_active: true,
          })}><Plus className="h-4 w-4 mr-1" /> Neue Regel</Button>
        </div>
        <div className="grid gap-2">
          {rules.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <span className="font-medium text-sm">{r.name}</span>
              <Badge variant="outline" className="text-[10px]">{typeName(r.document_type_id)}</Badge>
              <Badge variant="outline" className="text-[10px]">{TRIGGERS.find((x) => x.value === r.trigger)?.label || r.trigger}</Badge>
              <span className="text-xs text-muted-foreground">{r.conditions?.length || 0} Bed. · {r.actions?.length || 0} Aktionen</span>
              <Badge variant={r.is_active ? 'default' : 'outline'} className="text-[10px] ml-auto">{r.is_active ? 'aktiv' : 'inaktiv'}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-muted-foreground">Keine Regeln</p>}
        </div>
      </div>

      {editing && <RuleEditor rule={editing} types={types} onSave={save} onClose={() => setEditing(null)} />}
    </AppLayout>
  );
}

function RuleEditor({ rule, types, onSave, onClose }: { rule: Rule; types: DocType[]; onSave: (r: Rule) => void; onClose: () => void }) {
  const [r, setR] = useState<Rule>(rule);
  const addCond = () => setR({ ...r, conditions: [...(r.conditions || []), { field: '', op: 'eq', value: '' }] });
  const updCond = (i: number, patch: any) => { const a = [...r.conditions]; a[i] = { ...a[i], ...patch }; setR({ ...r, conditions: a }); };
  const delCond = (i: number) => setR({ ...r, conditions: r.conditions.filter((_, j) => j !== i) });
  const addAct = () => setR({ ...r, actions: [...(r.actions || []), { type: 'create_notification', title: '', body: '' }] });
  const updAct = (i: number, patch: any) => { const a = [...r.actions]; a[i] = { ...a[i], ...patch }; setR({ ...r, actions: a }); };
  const delAct = (i: number) => setR({ ...r, actions: r.actions.filter((_, j) => j !== i) });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>{r.id ? 'Regel bearbeiten' : 'Neue Regel'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Name</Label><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
            <div className="flex items-center gap-2 pt-5"><Switch checked={r.is_active} onCheckedChange={(v) => setR({ ...r, is_active: v })} /><Label className="text-xs">Aktiv</Label></div>
            <div>
              <Label className="text-xs">Dokumenttyp</Label>
              <Select value={r.document_type_id ?? '__all__'} onValueChange={(v) => setR({ ...r, document_type_id: v === '__all__' ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle Typen</SelectItem>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.label_de}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Auslöser</Label>
              <Select value={r.trigger} onValueChange={(v) => setR({ ...r, trigger: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRIGGERS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Beschreibung</Label><Textarea rows={2} value={r.description || ''} onChange={(e) => setR({ ...r, description: e.target.value })} /></div>

          <div>
            <div className="flex items-center justify-between mb-1"><Label className="text-xs">Bedingungen (alle müssen erfüllt sein)</Label>
              <Button size="sm" variant="outline" onClick={addCond}><Plus className="h-3 w-3 mr-1" /> Bedingung</Button></div>
            {(r.conditions || []).map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 items-center mb-1">
                <Input placeholder="Feld (z.B. end_date oder _confidence)" className="col-span-5 h-8 text-xs" value={c.field || ''} onChange={(e) => updCond(i, { field: e.target.value })} />
                <Select value={c.op} onValueChange={(v) => updCond(i, { op: v })}>
                  <SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Wert" className="col-span-3 h-8 text-xs" value={c.value ?? ''} onChange={(e) => updCond(i, { value: e.target.value })} />
                <Button variant="ghost" size="sm" onClick={() => delCond(i)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1"><Label className="text-xs">Aktionen</Label>
              <Button size="sm" variant="outline" onClick={addAct}><Plus className="h-3 w-3 mr-1" /> Aktion</Button></div>
            {(r.actions || []).map((a, i) => (
              <div key={i} className="rounded border p-2 mb-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Select value={a.type} onValueChange={(v) => updAct(i, { type: v })}>
                    <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTION_TYPES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => delAct(i)} className="ml-auto"><Trash2 className="h-3 w-3" /></Button>
                </div>
                {a.type === 'create_notification' && (<>
                  <Input placeholder="Empfänger (admin oder user-uuid)" className="h-8 text-xs" value={a.target || 'admin'} onChange={(e) => updAct(i, { target: e.target.value })} />
                  <Input placeholder="Titel" className="h-8 text-xs" value={a.title || ''} onChange={(e) => updAct(i, { title: e.target.value })} />
                  <Input placeholder="Text" className="h-8 text-xs" value={a.body || ''} onChange={(e) => updAct(i, { body: e.target.value })} />
                </>)}
                {a.type === 'create_case' && (<>
                  <Input placeholder="Titel" className="h-8 text-xs" value={a.title || ''} onChange={(e) => updAct(i, { title: e.target.value })} />
                  <Input placeholder="Abteilungs-UUID (optional)" className="h-8 text-xs" value={a.department || ''} onChange={(e) => updAct(i, { department: e.target.value })} />
                </>)}
                {a.type === 'send_webhook' && (
                  <Input placeholder="URL" className="h-8 text-xs" value={a.url || ''} onChange={(e) => updAct(i, { url: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave(r)}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
