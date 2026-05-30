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
import { Plus, Trash2, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface SchemaField { key: string; label: string; type: string; required?: boolean; description?: string; }
interface DocType {
  id: string; code: string; label_de: string; description: string | null;
  color: string; classification_hints: string | null; target_table: string | null;
  auto_apply_threshold: number; is_active: boolean; extraction_schema: SchemaField[];
}

const TARGETS = [
  { value: '__none__', label: 'Keine — nur Inbox' },
  { value: 'insurance_policies', label: 'Versicherungen' },
  { value: 'orders', label: 'Bestellungen' },
];

export default function AdminDocumentTypes() {
  const [types, setTypes] = useState<DocType[]>([]);
  const [editing, setEditing] = useState<DocType | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('document_types').select('*').order('sort_order');
    setTypes((data || []) as DocType[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (t: DocType) => {
    const payload = {
      code: t.code, label_de: t.label_de, description: t.description,
      color: t.color, classification_hints: t.classification_hints,
      target_table: t.target_table, auto_apply_threshold: t.auto_apply_threshold,
      is_active: t.is_active, extraction_schema: t.extraction_schema,
    };
    const { error } = t.id
      ? await (supabase as any).from('document_types').update(payload).eq('id', t.id)
      : await (supabase as any).from('document_types').insert(payload);
    if (error) toast.error(error.message);
    else { toast.success('Gespeichert'); setEditing(null); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Wirklich löschen?')) return;
    const { error } = await (supabase as any).from('document_types').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Gelöscht'); load(); }
  };

  return (
    <AppLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FileText className="h-6 w-6" /> Dokumenttypen</h1>
          <Button onClick={() => setEditing({
            id: '', code: '', label_de: '', description: '', color: '#64748b',
            classification_hints: '', target_table: null, auto_apply_threshold: 0.85,
            is_active: true, extraction_schema: [],
          })}><Plus className="h-4 w-4 mr-1" /> Neuer Typ</Button>
        </div>
        <div className="grid gap-2">
          {types.map((t) => (
            <div key={t.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <Badge style={{ backgroundColor: t.color, color: '#fff' }}>{t.label_de}</Badge>
              <code className="text-xs text-muted-foreground">{t.code}</code>
              <span className="text-xs text-muted-foreground flex-1 truncate">{t.description}</span>
              {t.target_table && <Badge variant="outline" className="text-[10px]">→ {t.target_table}</Badge>}
              <Badge variant={t.is_active ? 'default' : 'outline'} className="text-[10px]">
                {t.is_active ? 'aktiv' : 'inaktiv'}
              </Badge>
              <span className="text-xs text-muted-foreground">{t.extraction_schema?.length || 0} Felder</span>
              <Button variant="ghost" size="sm" onClick={() => setEditing(t)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="sm" onClick={() => remove(t.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          {types.length === 0 && !loading && <p className="text-sm text-muted-foreground">Keine Typen</p>}
        </div>
      </div>

      {editing && <TypeEditor type={editing} onSave={save} onClose={() => setEditing(null)} />}
    </AppLayout>
  );
}

function TypeEditor({ type, onSave, onClose }: { type: DocType; onSave: (t: DocType) => void; onClose: () => void }) {
  const [t, setT] = useState<DocType>(type);
  const addField = () => setT({ ...t, extraction_schema: [...(t.extraction_schema || []), { key: '', label: '', type: 'text', required: false }] });
  const updField = (i: number, patch: Partial<SchemaField>) => {
    const arr = [...(t.extraction_schema || [])];
    arr[i] = { ...arr[i], ...patch };
    setT({ ...t, extraction_schema: arr });
  };
  const delField = (i: number) => setT({ ...t, extraction_schema: t.extraction_schema.filter((_, j) => j !== i) });

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>{t.id ? 'Typ bearbeiten' : 'Neuer Typ'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Code</Label><Input value={t.code} onChange={(e) => setT({ ...t, code: e.target.value })} /></div>
            <div><Label className="text-xs">Label (DE)</Label><Input value={t.label_de} onChange={(e) => setT({ ...t, label_de: e.target.value })} /></div>
            <div><Label className="text-xs">Farbe</Label><Input type="color" value={t.color} onChange={(e) => setT({ ...t, color: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Ziel-Tabelle</Label>
              <Select value={t.target_table ?? '__none__'} onValueChange={(v) => setT({ ...t, target_table: v === '__none__' ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TARGETS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Auto-Apply ab Confidence</Label>
              <Input type="number" step="0.05" min="0" max="1" value={t.auto_apply_threshold} onChange={(e) => setT({ ...t, auto_apply_threshold: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2 pt-5"><Switch checked={t.is_active} onCheckedChange={(v) => setT({ ...t, is_active: v })} /><Label className="text-xs">Aktiv</Label></div>
          </div>
          <div><Label className="text-xs">Beschreibung</Label><Textarea rows={2} value={t.description || ''} onChange={(e) => setT({ ...t, description: e.target.value })} /></div>
          <div><Label className="text-xs">Klassifizierungs-Hinweise (Stichworte für KI)</Label><Textarea rows={2} value={t.classification_hints || ''} onChange={(e) => setT({ ...t, classification_hints: e.target.value })} /></div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Extraktions-Felder</Label>
              <Button size="sm" variant="outline" onClick={addField}><Plus className="h-3 w-3 mr-1" /> Feld</Button>
            </div>
            <div className="space-y-2">
              {(t.extraction_schema || []).map((f, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 items-center">
                  <Input placeholder="key" className="col-span-2 h-8 text-xs" value={f.key} onChange={(e) => updField(i, { key: e.target.value })} />
                  <Input placeholder="Label" className="col-span-3 h-8 text-xs" value={f.label} onChange={(e) => updField(i, { label: e.target.value })} />
                  <Select value={f.type} onValueChange={(v) => updField(i, { type: v })}>
                    <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['text', 'number', 'date', 'array'].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Beschreibung (KI-Hinweis)" className="col-span-4 h-8 text-xs" value={f.description || ''} onChange={(e) => updField(i, { description: e.target.value })} />
                  <Button variant="ghost" size="sm" onClick={() => delField(i)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave(t)}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
