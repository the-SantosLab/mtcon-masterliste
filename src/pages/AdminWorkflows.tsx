import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Settings2, Loader2, Workflow, ArrowRight, CheckCircle2, AlertOctagon, RotateCcw, UserCheck, ShieldCheck, Info } from 'lucide-react';

interface WorkflowSetting {
  id: string;
  key: string;
  value: any;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

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

const WORKFLOW_RULES = [
  {
    key: 'auto_forward_enabled',
    icon: ArrowRight,
    title: 'Automatische Weiterleitung',
    question: 'Soll ein Vorgang automatisch an die nächste Abteilung weitergeleitet werden, wenn eine Unteraufgabe erledigt wird?',
    example: 'Beispiel: Die Aufgabe „Design prüfen" ist erledigt → der Vorgang wandert automatisch zur Abteilung der nächsten Aufgabe.',
    type: 'boolean' as const,
    defaultValue: true,
  },
  {
    key: 'all_tasks_done_status',
    icon: CheckCircle2,
    title: 'Alle Aufgaben erledigt',
    question: 'Welchen Status soll der Vorgang bekommen, wenn alle Unteraufgaben abgeschlossen sind?',
    example: 'Empfohlen: „Zur Prüfung" – damit ein Verantwortlicher das Ergebnis noch abnehmen kann, bevor der Vorgang abgeschlossen wird.',
    type: 'status' as const,
    defaultValue: 'ready_for_review',
  },
  {
    key: 'no_department_status',
    icon: AlertOctagon,
    title: 'Fehlende Abteilung',
    question: 'Was passiert, wenn die nächste Unteraufgabe keiner Abteilung zugeordnet ist?',
    example: 'Empfohlen: „Blockiert" – damit der Vorgang nicht unbemerkt stehen bleibt und jemand die fehlende Zuordnung nachholt.',
    type: 'status' as const,
    defaultValue: 'blocked',
  },
  {
    key: 'auto_assign_on_forward',
    icon: UserCheck,
    title: 'Automatische Zuweisung',
    question: 'Soll beim Abteilungswechsel automatisch ein Mitarbeiter der neuen Abteilung zugewiesen werden?',
    example: 'Wenn aktiv, wird der Vorgang beim Wechsel einem Mitarbeiter der Zielabteilung zugewiesen.',
    type: 'boolean' as const,
    defaultValue: false,
  },
  {
    key: 'require_secondary_check',
    icon: ShieldCheck,
    title: 'Zweitprüfung (4-Augen-Prinzip)',
    question: 'Muss ein Vorgang nach Abschluss aller Aufgaben von einer zweiten Person geprüft werden?',
    example: 'Wichtig bei qualitätsrelevanten Prozessen – ein zweiter Mitarbeiter muss den Vorgang bestätigen.',
    type: 'boolean' as const,
    defaultValue: false,
  },
];

export default function AdminWorkflows() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<WorkflowSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('workflow_settings').select('*').order('key');
    setSettings(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  // Auto-initialize missing presets on first load
  useEffect(() => {
    if (loading || initialized || !isAdmin) return;
    const existingKeys = settings.map(s => s.key);
    const missing = WORKFLOW_RULES.filter(r => !existingKeys.includes(r.key));
    if (missing.length > 0) {
      Promise.all(missing.map(r =>
        supabase.from('workflow_settings').insert({
          key: r.key,
          value: r.defaultValue,
          description: r.question,
        })
      )).then(() => { fetchSettings(); });
    }
    setInitialized(true);
  }, [loading, initialized, isAdmin, settings]);

  const getValue = (key: string) => {
    const s = settings.find(s => s.key === key);
    return s?.value;
  };

  const getSetting = (key: string) => settings.find(s => s.key === key);

  const handleSave = async (key: string, newValue: any) => {
    const setting = getSetting(key);
    if (!setting) return;
    setSaving(key);
    const { error } = await supabase.from('workflow_settings')
      .update({ value: newValue, updated_at: new Date().toISOString() })
      .eq('id', setting.id);
    if (error) toast.error('Fehler beim Speichern');
    else {
      toast.success('Einstellung gespeichert');
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
    }
    setSaving(null);
  };

  const resetDefaults = async () => {
    for (const rule of WORKFLOW_RULES) {
      const setting = getSetting(rule.key);
      if (setting) {
        await supabase.from('workflow_settings')
          .update({ value: rule.defaultValue, updated_at: new Date().toISOString() })
          .eq('id', setting.id);
      }
    }
    toast.success('Alle Einstellungen auf Standard zurückgesetzt');
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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Workflow-Regeln
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Bestimme, wie sich Vorgänge automatisch verhalten, wenn Aufgaben erledigt werden.
          </p>
        </div>

        {/* Info box */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">So funktioniert es</p>
            <p className="text-muted-foreground">
              Jeder Vorgang kann mehrere Unteraufgaben haben, die verschiedenen Abteilungen zugeordnet sind.
              Wenn eine Aufgabe erledigt wird, entscheiden diese Regeln, was als Nächstes passiert.
              Änderungen gelten sofort für alle neuen Aktionen.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {WORKFLOW_RULES.map((rule, idx) => {
              const Icon = rule.icon;
              const currentValue = getValue(rule.key);
              const isBool = rule.type === 'boolean';
              const isActive = isBool && (currentValue === true || currentValue === 'true');

              return (
                <Card key={rule.key}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="rounded-lg bg-primary/10 p-2.5 shrink-0 mt-0.5">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base mb-1">{rule.title}</h3>
                        <p className="text-sm text-foreground mb-2">{rule.question}</p>
                        <p className="text-xs text-muted-foreground mb-4 italic">{rule.example}</p>

                        {isBool ? (
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={isActive}
                              onCheckedChange={(checked) => handleSave(rule.key, checked)}
                              disabled={saving === rule.key}
                            />
                            <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                              {isActive ? 'Ja, automatisch' : 'Nein, manuell'}
                            </span>
                          </div>
                        ) : (
                          <Select
                            value={String(currentValue || rule.defaultValue)}
                            onValueChange={(v) => handleSave(rule.key, v)}
                            disabled={saving === rule.key}
                          >
                            <SelectTrigger className="w-full max-w-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Separator className="my-2" />

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={resetDefaults} className="text-muted-foreground">
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Alle auf Standard zurücksetzen
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
