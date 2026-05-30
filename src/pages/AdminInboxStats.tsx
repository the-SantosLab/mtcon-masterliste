import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { BarChart3 } from 'lucide-react';

export default function AdminInboxStats() {
  const [stats, setStats] = useState<any>({ byType: [], topFields: [], execs: { success: 0, failed: 0, skipped: 0 } });

  useEffect(() => {
    (async () => {
      const [types, docs, corr, execs] = await Promise.all([
        (supabase as any).from('document_types').select('id, label_de, color'),
        (supabase as any).from('inbox_documents').select('classified_type_id, status'),
        (supabase as any).from('inbox_corrections').select('document_type_id, field_path'),
        (supabase as any).from('action_executions').select('result'),
      ]);
      const docsByType: Record<string, number> = {};
      (docs.data || []).forEach((d: any) => { if (d.classified_type_id) docsByType[d.classified_type_id] = (docsByType[d.classified_type_id] || 0) + 1; });
      const corrByType: Record<string, number> = {};
      const fieldCounts: Record<string, number> = {};
      (corr.data || []).forEach((c: any) => {
        if (c.document_type_id) corrByType[c.document_type_id] = (corrByType[c.document_type_id] || 0) + 1;
        fieldCounts[c.field_path] = (fieldCounts[c.field_path] || 0) + 1;
      });
      const byType = (types.data || []).map((t: any) => ({
        ...t, total: docsByType[t.id] || 0, corrections: corrByType[t.id] || 0,
        accuracy: docsByType[t.id] ? Math.max(0, 1 - (corrByType[t.id] || 0) / docsByType[t.id]) : null,
      }));
      const topFields = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const execStats = { success: 0, failed: 0, skipped: 0 };
      (execs.data || []).forEach((e: any) => { execStats[e.result as 'success'|'failed'|'skipped']++; });
      setStats({ byType, topFields, execs: execStats });
    })();
  }, []);

  return (
    <AppLayout>
      <div className="space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Inbox-Statistiken</h1>

        <div>
          <h2 className="text-sm font-medium mb-2">Klassifizierungs-Genauigkeit pro Typ</h2>
          <div className="grid gap-2">
            {stats.byType.map((t: any) => (
              <div key={t.id} className="rounded border bg-card p-3 flex items-center gap-3">
                <Badge style={{ backgroundColor: t.color, color: '#fff' }}>{t.label_de}</Badge>
                <span className="text-xs text-muted-foreground">Dokumente: {t.total}</span>
                <span className="text-xs text-muted-foreground">Korrekturen: {t.corrections}</span>
                <span className="ml-auto text-sm font-mono">
                  {t.accuracy != null ? `${Math.round(t.accuracy * 100)}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-2">Häufigst korrigierte Felder</h2>
          <div className="grid gap-1">
            {stats.topFields.map(([f, c]: any) => (
              <div key={f} className="flex items-center gap-2 text-xs">
                <code className="bg-muted px-2 py-0.5 rounded">{f}</code>
                <span className="text-muted-foreground">{c}×</span>
              </div>
            ))}
            {stats.topFields.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Korrekturen</p>}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-2">Automationsregeln</h2>
          <div className="flex gap-2 text-xs">
            <Badge>Erfolg: {stats.execs.success}</Badge>
            <Badge variant="destructive">Fehler: {stats.execs.failed}</Badge>
            <Badge variant="outline">Übersprungen: {stats.execs.skipped}</Badge>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
