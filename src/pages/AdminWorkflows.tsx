import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Save, Trash2, Settings2, Loader2, Pencil, AlertTriangle, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowSetting {
  id: string;
  key: string;
  value: any;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

const PRESET_KEYS = [
  { key: 'all_tasks_done_status', label: 'Status bei allen erledigten Aufgaben', description: 'Welcher Status wird gesetzt, wenn alle Unteraufgaben eines Vorgangs abgeschlossen sind?', type: 'status_select' },
  { key: 'no_department_status', label: 'Status bei fehlender Abteilung', description: 'Welcher Status wird gesetzt, wenn die nächste Unteraufgabe keine Abteilung zugewiesen hat?', type: 'status_select' },
  { key: 'auto_forward_enabled', label: 'Auto-Forwarding aktiv', description: 'Soll der Vorgang automatisch in die Abteilung der nächsten Unteraufgabe verschoben werden?', type: 'boolean' },
  { key: 'auto_assign_on_forward', label: 'Auto-Zuweisung bei Weiterleitung', description: 'Soll der Vorgang beim Abteilungswechsel automatisch dem Abteilungsleiter zugewiesen werden?', type: 'boolean' },
  { key: 'require_secondary_check', label: 'Zweitprüfung erforderlich', description: 'Muss ein Vorgang nach Abschluss aller Aufgaben eine Zweitprüfung durchlaufen?', type: 'boolean' },
];

const STATUS_OPTIONS = [
  { value: 'nicht_begonnen', label: 'Nicht begonnen' },
  { value: 'in_planung', label: 'In Planung' },
  { value: 'in_arbeit', label: 'In Arbeit' },
  { value: 'in_verzug', label: 'In Verzug' },
  { value: 'ready_for_review', label: 'Zur Prüfung' },
  { value: 'blocked', label: 'Blockiert' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
  { value: 'verworfen', label: 'Verworfen' },
  { value: 'archiv', label: 'Archiv' },
];

export default function AdminWorkflows() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<WorkflowSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{ open: boolean; setting: WorkflowSetting | null; isNew: boolean }>({ open: false, setting: null, isNew: false });
  const [formKey, setFormKey] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('workflow_settings').select('*').order('key');
    setSettings(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const getPreset = (key: string) => PRESET_KEYS.find(p => p.key === key);

  const handleSave = async (setting: WorkflowSetting, newValue: any) => {
    setSaving(setting.id);
    const { error } = await supabase.from('workflow_settings').update({ value: newValue, updated_at: new Date().toISOString() }).eq('id', setting.id);
    if (error) toast.error('Fehler beim Speichern');
    else { toast.success('Einstellung gespeichert'); fetchSettings(); }
    setSaving(null);
  };

  const handleCreate = async () => {
    if (!formKey.trim()) { toast.error('Schlüssel ist erforderlich'); return; }
    let parsedValue: any = formValue;
    try { parsedValue = JSON.parse(formValue); } catch { /* keep as string */ }
    const { error } = await supabase.from('workflow_settings').insert({ key: formKey.trim(), value: parsedValue, description: formDesc || null });
    if (error) {
      if (error.code === '23505') toast.error('Schlüssel existiert bereits');
      else toast.error('Fehler beim Erstellen');
    } else {
      toast.success('Einstellung erstellt');
      setEditDialog({ open: false, setting: null, isNew: false });
      setFormKey(''); setFormValue(''); setFormDesc('');
      fetchSettings();
    }
  };

  const handleUpdate = async () => {
    if (!editDialog.setting) return;
    let parsedValue: any = formValue;
    try { parsedValue = JSON.parse(formValue); } catch { /* keep as string */ }
    const { error } = await supabase.from('workflow_settings').update({ value: parsedValue, description: formDesc || null, updated_at: new Date().toISOString() }).eq('id', editDialog.setting.id);
    if (error) toast.error('Fehler beim Speichern');
    else { toast.success('Einstellung aktualisiert'); fetchSettings(); }
    setEditDialog({ open: false, setting: null, isNew: false });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('workflow_settings').delete().eq('id', id);
    if (error) toast.error('Fehler beim Löschen');
    else { toast.success('Einstellung gelöscht'); fetchSettings(); }
  };

  const openNewDialog = () => {
    setFormKey(''); setFormValue(''); setFormDesc('');
    setEditDialog({ open: true, setting: null, isNew: true });
  };

  const openEditDialog = (s: WorkflowSetting) => {
    setFormKey(s.key);
    setFormValue(typeof s.value === 'string' ? s.value : JSON.stringify(s.value, null, 2));
    setFormDesc(s.description || '');
    setEditDialog({ open: true, setting: s, isNew: false });
  };

  // Ensure presets exist
  const initPresets = async () => {
    const existingKeys = settings.map(s => s.key);
    const missing = PRESET_KEYS.filter(p => !existingKeys.includes(p.key));
    if (missing.length === 0) { toast.info('Alle Standard-Einstellungen sind vorhanden'); return; }
    for (const p of missing) {
      const defaultVal = p.type === 'boolean' ? true : p.key === 'all_tasks_done_status' ? 'ready_for_review' : p.key === 'no_department_status' ? 'blocked' : '';
      await supabase.from('workflow_settings').insert({ key: p.key, value: defaultVal, description: p.description });
    }
    toast.success(`${missing.length} Standard-Einstellung(en) erstellt`);
    fetchSettings();
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Nur Administratoren haben Zugriff auf diese Seite.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Workflow className="h-6 w-6 text-primary" />
              Workflow-Einstellungen
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Konfiguriere das automatische Verhalten des Vorgangssystems</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={initPresets} size="sm">
              <Settings2 className="h-4 w-4 mr-1" /> Standards laden
            </Button>
            <Button onClick={openNewDialog} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Neue Einstellung
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : settings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">Keine Workflow-Einstellungen vorhanden.</p>
              <Button onClick={initPresets}><Settings2 className="h-4 w-4 mr-1" /> Standard-Einstellungen laden</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {settings.map(s => {
              const preset = getPreset(s.key);
              return (
                <Card key={s.id} className="relative group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{preset?.label || s.key}</CardTitle>
                        <CardDescription className="text-xs mt-1">{s.description || preset?.description || 'Keine Beschreibung'}</CardDescription>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {preset?.type === 'boolean' ? (
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={s.value === true || s.value === 'true'}
                          onCheckedChange={(checked) => handleSave(s, checked)}
                          disabled={saving === s.id}
                        />
                        <span className="text-sm text-muted-foreground">
                          {(s.value === true || s.value === 'true') ? 'Aktiviert' : 'Deaktiviert'}
                        </span>
                      </div>
                    ) : preset?.type === 'status_select' ? (
                      <Select
                        value={String(s.value)}
                        onValueChange={(v) => handleSave(s, v)}
                        disabled={saving === s.id}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-xs break-all max-w-full">
                          {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                        </Badge>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Schlüssel: <code className="bg-muted px-1 rounded">{s.key}</code>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog(p => ({ ...p, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDialog.isNew ? 'Neue Einstellung' : 'Einstellung bearbeiten'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Schlüssel</Label>
              {editDialog.isNew ? (
                <Input value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="z.B. auto_forward_delay" />
              ) : (
                <Input value={formKey} disabled className="opacity-60" />
              )}
            </div>
            <div className="space-y-2">
              <Label>Wert (Text, Zahl oder JSON)</Label>
              <Textarea value={formValue} onChange={e => setFormValue(e.target.value)} rows={3} placeholder='z.B. true, "ready_for_review", {"key": "value"}' />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optionale Beschreibung" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, setting: null, isNew: false })}>Abbrechen</Button>
            <Button onClick={editDialog.isNew ? handleCreate : handleUpdate}>
              <Save className="h-4 w-4 mr-1" /> {editDialog.isNew ? 'Erstellen' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
