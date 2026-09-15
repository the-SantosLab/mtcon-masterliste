import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

interface CaseRow {
  id: string;
  case_number: string | null;
  project_name: string;
  client_name: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
}

type StatusGroup = 'alle' | 'offen' | 'in_bearbeitung' | 'abgeschlossen';

const STATUS_GROUPS: { value: StatusGroup; label: string; statuses: string[] }[] = [
  { value: 'alle', label: 'Alle', statuses: [] },
  { value: 'offen', label: 'Offen', statuses: ['nicht_begonnen', 'in_planung'] },
  { value: 'in_bearbeitung', label: 'In Bearbeitung', statuses: ['in_arbeit', 'in_verzug', 'blocked', 'ready_for_review'] },
  { value: 'abgeschlossen', label: 'Abgeschlossen', statuses: ['abgeschlossen', 'verworfen', 'archiv'] },
];

const STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: 'Nicht begonnen',
  in_planung: 'In Planung',
  in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug',
  blocked: 'Blockiert',
  ready_for_review: 'Zur Prüfung',
  abgeschlossen: 'Abgeschlossen',
  verworfen: 'Verworfen',
  archiv: 'Archiv',
};

function CasesOverview() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusGroup, setStatusGroup] = useState<StatusGroup>('alle');
  const [company, setCompany] = useState<string>('alle');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, case_number, title, client_name, status, due_at, created_at')
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) toast.error(error.message);
      setCases((data || []) as CaseRow[]);
      setLoading(false);
    })();
  }, []);

  const companies = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => { if (c.client_name) set.add(c.client_name); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [cases]);

  const filtered = useMemo(() => {
    const group = STATUS_GROUPS.find((g) => g.value === statusGroup);
    return cases.filter((c) => {
      if (group && group.statuses.length > 0 && !group.statuses.includes(c.status)) return false;
      if (company !== 'alle' && c.client_name !== company) return false;
      return true;
    });
  }, [cases, statusGroup, company]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-base">Vorgänge</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Select value={statusGroup} onValueChange={(v) => setStatusGroup(v as StatusGroup)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_GROUPS.map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Firma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Firmen</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade …</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Vorgänge für diese Filter gefunden.</p>
        ) : (
          <div className="divide-y">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/cases/${c.id}`)}
                className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-muted/50 rounded px-2 -mx-2"
              >
                <span className="text-xs text-muted-foreground w-28 shrink-0">
                  {c.case_number || '—'}
                </span>
                <span className="text-sm font-medium truncate flex-1 min-w-[10rem]">{c.title}</span>
                <span className="text-xs text-muted-foreground w-44 truncate">
                  {c.client_name || '—'}
                </span>
                {c.due_at && (
                  <span className="text-xs text-muted-foreground">
                    Fällig: {new Date(c.due_at).toLocaleDateString('de-DE')}
                  </span>
                )}
                <Badge variant="outline">{STATUS_LABELS[c.status] || c.status}</Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

  const saveName = async (row: TemplateRow) => {
    const next = editName.trim();
    if (!next) { toast.error('Bezeichnung darf nicht leer sein'); return; }
    const { error } = await supabase.from('erp_pdf_templates').update({ name: next }).eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success('Bezeichnung geändert');
    load();
  };

  const testPdf = async (docType: TemplateDocType) => {
    setTesting(docType);
    try {
      clearTemplateCache(docType);
      await openSampleTemplatePdf(docType);
      toast.success('Test-PDF erzeugt');
    } catch (e: any) {
      toast.error(e?.message || 'PDF konnte nicht erzeugt werden');
    } finally {
      setTesting(null);
    }
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
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{g.label}</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === g.value}
                  onClick={() => testPdf(g.value as TemplateDocType)}
                >
                  <FileSearch className="h-4 w-4 mr-1" />
                  {testing === g.value ? 'Erzeuge …' : 'Test-PDF erzeugen'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Keine Datei hinterlegt — es wird die mitgelieferte Originalvorlage verwendet.
                  </p>
                )}
                {g.items.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                    {editingId === row.id ? (
                      <>
                        <Input
                          className="h-8 w-56 text-sm"
                          value={editName}
                          autoFocus
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveName(row);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <Button size="sm" variant="outline" onClick={() => saveName(row)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm font-medium">{row.name}</span>
                    )}
                    <Badge variant="outline">v{row.version}</Badge>
                    {row.is_active && <Badge>Aktiv</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString('de-DE')}
                    </span>
                    <div className="ml-auto flex gap-2">
                      {editingId !== row.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingId(row.id); setEditName(row.name); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
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
