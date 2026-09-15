// Vorlagen-Wechsel: je Firma, Deal oder Projekt kann pro Belegart eine
// abweichende PDF-Vorlage ausgewählt werden. Ohne Auswahl gilt die global
// aktive Vorlage aus der Vorlagen-Verwaltung.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  TEMPLATE_DOC_TYPES,
  TemplateDocType,
  TemplateScopeKind,
  clearTemplateCache,
} from '@/lib/erp-pdf/templateSource';

const GLOBAL = '__global__';

interface TemplateOption {
  id: string;
  doc_type: string;
  name: string;
  version: number;
  is_active: boolean;
}

interface Props {
  scope: TemplateScopeKind;
  scopeId: string;
  title?: string;
}

export function TemplateAssignment({ scope, scopeId, title = 'PDF-Vorlagen' }: Props) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [tpl, asg] = await Promise.all([
      supabase.from('erp_pdf_templates').select('id, doc_type, name, version, is_active').order('version', { ascending: false }),
      supabase.from('erp_template_assignments').select('doc_type, template_id').eq('scope', scope).eq('scope_id', scopeId),
    ]);
    if (tpl.error) toast.error(tpl.error.message);
    setTemplates((tpl.data || []) as TemplateOption[]);
    const map: Record<string, string> = {};
    for (const row of (asg.data || []) as { doc_type: string; template_id: string }[]) {
      map[row.doc_type] = row.template_id;
    }
    setAssigned(map);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope, scopeId]);

  const change = async (docType: TemplateDocType, value: string) => {
    setSaving(docType);
    try {
      if (value === GLOBAL) {
        const { error } = await supabase
          .from('erp_template_assignments')
          .delete()
          .eq('scope', scope).eq('scope_id', scopeId).eq('doc_type', docType);
        if (error) throw error;
        setAssigned((prev) => { const next = { ...prev }; delete next[docType]; return next; });
        toast.success('Es gilt wieder die Standardvorlage');
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('erp_template_assignments')
          .upsert({
            scope, scope_id: scopeId, doc_type: docType,
            template_id: value, created_by: userRes.user?.id ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'scope,scope_id,doc_type' });
        if (error) throw error;
        setAssigned((prev) => ({ ...prev, [docType]: value }));
        toast.success('Vorlage zugeordnet');
      }
      clearTemplateCache(docType);
    } catch (err: any) {
      toast.error(err?.message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : (
          TEMPLATE_DOC_TYPES.map((t) => {
            const options = templates.filter((tpl) => tpl.doc_type === t.value);
            const value = assigned[t.value] ?? GLOBAL;
            return (
              <div key={t.value} className="flex items-center gap-3">
                <Label className="w-56 shrink-0 text-sm">{t.label}</Label>
                <Select
                  value={value}
                  disabled={saving === t.value}
                  onValueChange={(v) => change(t.value, v)}
                >
                  <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL}>Standardvorlage</SelectItem>
                    {options.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name} (v{tpl.version}){tpl.is_active ? ' — aktiv' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {value !== GLOBAL && <Badge variant="outline">abweichend</Badge>}
              </div>
            );
          })
        )}
        <p className="text-xs text-muted-foreground">
          Ohne Auswahl wird die in der Vorlagen-Verwaltung aktivierte Vorlage verwendet.
          Neue Belege werden sofort mit der gewählten Vorlage erzeugt.
        </p>
      </CardContent>
    </Card>
  );
}
