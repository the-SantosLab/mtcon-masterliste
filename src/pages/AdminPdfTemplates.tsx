import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, CheckCircle2, Trash2, FileText, Pencil, Check, X, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import { TEMPLATE_BUCKET, TEMPLATE_DOC_TYPES, TemplateDocType, clearTemplateCache } from '@/lib/erp-pdf/templateSource';
import { openSampleTemplatePdf } from '@/lib/erp-pdf/sampleDocs';

interface TemplateRow {
  id: string;
  doc_type: string;
  name: string;
  storage_path: string;
  version: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

export default function AdminPdfTemplates() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<TemplateDocType>('angebot');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('erp_pdf_templates')
      .select('*')
      .order('doc_type')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as TemplateRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    return TEMPLATE_DOC_TYPES.map((t) => ({
      ...t,
      items: rows.filter((r) => r.doc_type === t.value),
    }));
  }, [rows]);

  const upload = async () => {
    if (!file) { toast.error('Bitte eine PDF-Datei auswählen'); return; }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Nur PDF-Dateien sind zulässig'); return;
    }
    setBusy(true);
    try {
      const nextVersion = Math.max(0, ...rows.filter((r) => r.doc_type === docType).map((r) => r.version)) + 1;
      const path = `${docType}/v${nextVersion}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, file, {
        contentType: 'application/pdf', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: userRes } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from('erp_pdf_templates').insert({
        doc_type: docType,
        name: name.trim() || file.name,
        storage_path: path,
        version: nextVersion,
        is_active: false,
        uploaded_by: userRes.user?.id ?? null,
      });
      if (insErr) throw insErr;
      toast.success('Vorlage hochgeladen. Zum Verwenden aktivieren.');
      setFile(null); setName('');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Upload fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (row: TemplateRow) => {
    setBusy(true);
    const { error: offErr } = await supabase
      .from('erp_pdf_templates')
      .update({ is_active: false })
      .eq('doc_type', row.doc_type)
      .eq('is_active', true);
    if (offErr) { toast.error(offErr.message); setBusy(false); return; }
    const { error } = await supabase.from('erp_pdf_templates').update({ is_active: true }).eq('id', row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    clearTemplateCache(row.doc_type as TemplateDocType);
    toast.success('Vorlage aktiviert');
    load();
  };

  const download = async (row: TemplateRow) => {
    const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(row.storage_path);
    if (error || !data) { toast.error(error?.message || 'Download fehlgeschlagen'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = `${row.doc_type}-v${row.version}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const remove = async (row: TemplateRow) => {
    if (row.is_active) { toast.error('Aktive Vorlage kann nicht gelöscht werden'); return; }
    if (!confirm('Vorlage wirklich löschen?')) return;
    await supabase.storage.from(TEMPLATE_BUCKET).remove([row.storage_path]);
    const { error } = await supabase.from('erp_pdf_templates').delete().eq('id', row.id);
    if (error) toast.error(error.message); else { toast.success('Gelöscht'); load(); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> PDF-Originalvorlagen
          </h1>
          <p className="text-sm text-muted-foreground">
            Vorlagen für Angebot, Auftragsbestätigung, Bestellung, Lieferschein und Rechnung verwalten.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Neue Vorlage hochladen</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Belegtyp</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as TemplateDocType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bezeichnung</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>PDF-Datei</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex items-end">
              <Button onClick={upload} disabled={busy || !file} className="w-full">
                <Upload className="h-4 w-4 mr-1" /> Hochladen
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : (
          grouped.map((g) => (
            <Card key={g.value}>
              <CardHeader><CardTitle className="text-base">{g.label}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {g.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Keine Datei hinterlegt — es wird die mitgelieferte Originalvorlage verwendet.
                  </p>
                )}
                {g.items.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                    <span className="text-sm font-medium">{row.name}</span>
                    <Badge variant="outline">v{row.version}</Badge>
                    {row.is_active && <Badge>Aktiv</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString('de-DE')}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => download(row)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {!row.is_active && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => activate(row)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Aktivieren
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(row)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppLayout>
  );
}
