import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Inbox as InboxIcon, RefreshCw, FileText, Loader2, CheckCircle2, XCircle, Sparkles, ExternalLink, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface DocType {
  id: string;
  code: string;
  label_de: string;
  color: string;
  extraction_schema: any[];
  target_table: string | null;
  auto_apply_threshold: number;
}

interface InboxDoc {
  id: string;
  inbox_no: string;
  received_at: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  storage_path: string | null;
  filename: string | null;
  classified_type_id: string | null;
  classification_confidence: number | null;
  classification_reasoning: string | null;
  extracted_data: any;
  status: string;
  linked_table: string | null;
  linked_id: string | null;
  error_message: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  needs_triage: 'Wartet auf KI',
  auto_classified: 'KI klassifiziert',
  confirmed: 'Bestätigt',
  linked: 'Übernommen',
  dismissed: 'Verworfen',
  failed: 'Fehler',
};

export default function Inbox({ embedded = false }: { embedded?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const [docs, setDocs] = useState<InboxDoc[]>([]);
  const [types, setTypes] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(params.get('doc'));

  const load = async () => {
    setLoading(true);
    const [docsRes, typesRes] = await Promise.all([
      (supabase as any).from('inbox_documents').select('*').order('received_at', { ascending: false }).limit(500),
      (supabase as any).from('document_types').select('*').order('sort_order'),
    ]);
    setDocs((docsRes.data || []) as InboxDoc[]);
    setTypes((typesRes.data || []) as DocType[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('inbox-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_documents' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (filterType !== 'all' && d.classified_type_id !== filterType) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(d.subject || '').toLowerCase().includes(s) &&
            !(d.from_email || '').toLowerCase().includes(s) &&
            !(d.inbox_no || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [docs, filterType, filterStatus, search]);

  const selectedDoc = selectedId ? docs.find((d) => d.id === selectedId) : null;

  const reclassify = async (id: string) => {
    toast.loading('Klassifizierung läuft…', { id: 'reclass' });
    const { error } = await supabase.functions.invoke('classify-inbox-document', {
      body: { inbox_document_id: id },
    });
    if (error) {
      toast.error('Klassifizierung fehlgeschlagen', { id: 'reclass' });
    } else {
      toast.success('Klassifizierung gestartet', { id: 'reclass' });
      load();
    }
  };

  const Wrapper: any = embedded ? 'div' : AppLayout;
  return (
    <Wrapper>
      <div className="space-y-4 p-4 md:p-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/container')} title="Zurück zum 3D Container">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <InboxIcon className="h-6 w-6" /> Intelligent Inbox
              </h1>
              <p className="text-sm text-muted-foreground">
                Eingehende Dokumente, KI-klassifiziert und extrahiert
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Suche…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger><SelectValue placeholder="Typ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label_de}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground self-center">
            {filtered.length} von {docs.length}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">INB-Nr</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Eingang</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Absender</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Betreff</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Typ</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Conf.</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const t = d.classified_type_id ? typeById[d.classified_type_id] : null;
                return (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedId(d.id); setParams({ doc: d.id }); }}>
                    <TableCell className="font-mono text-xs">{d.inbox_no}</TableCell>
                    <TableCell className="text-xs">{format(new Date(d.received_at), 'dd.MM. HH:mm', { locale: de })}</TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate">{d.from_email}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate">{d.subject}</TableCell>
                    <TableCell>
                      {t ? (
                        <Badge style={{ backgroundColor: t.color, color: '#fff' }} className="text-[10px]">{t.label_de}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.classification_confidence != null ? `${Math.round(d.classification_confidence * 100)}%` : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[d.status] || d.status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                    Keine Dokumente
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedDoc && (
        <InboxDocDialog
          doc={selectedDoc}
          type={selectedDoc.classified_type_id ? typeById[selectedDoc.classified_type_id] : null}
          onClose={() => { setSelectedId(null); setParams({}); }}
          onReclassify={() => reclassify(selectedDoc.id)}
          onChanged={load}
        />
      )}
    </Wrapper>
  );
}

function InboxDocDialog({ doc, type, onClose, onReclassify, onChanged }: {
  doc: InboxDoc; type: DocType | null; onClose: () => void;
  onReclassify: () => void; onChanged: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [edited, setEdited] = useState<any>(doc.extracted_data || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEdited(doc.extracted_data || {});
    if (doc.storage_path) {
      (supabase as any).storage.from('inbox-documents').createSignedUrl(doc.storage_path, 300)
        .then((res: any) => setPdfUrl(res?.data?.signedUrl || null));
    }
  }, [doc.id]);

  const fields = type?.extraction_schema || [];

  const handleConfirm = async () => {
    setSaving(true);
    try {
      // Log corrections
      const original = doc.extracted_data || {};
      const corrections: any[] = [];
      for (const f of fields) {
        const key = f.key;
        const ov = original?.[key];
        const nv = edited?.[key];
        if (JSON.stringify(ov) !== JSON.stringify(nv)) {
          corrections.push({
            inbox_document_id: doc.id,
            document_type_id: type?.id || null,
            field_path: key,
            ai_value: ov ?? null,
            user_value: nv ?? null,
          });
        }
      }
      if (corrections.length) {
        await (supabase as any).from('inbox_corrections').insert(corrections);
      }

      // Optionally create target row
      let linkedTable: string | null = null;
      let linkedId: string | null = null;

      if (type?.target_table === 'insurance_policies') {
        const { data, error } = await (supabase as any).from('insurance_policies').insert({
          name: edited.name || doc.subject || 'Aus Inbox',
          provider: edited.provider || null,
          policy_number: edited.policy_number || null,
          insured_object: edited.insured_object || null,
          start_date: edited.start_date || null,
          end_date: edited.end_date || null,
          renewal_date: edited.renewal_date || null,
          notice_period_days: edited.notice_period_days || null,
          premium_amount: edited.premium_amount || null,
          premium_currency: edited.currency || null,
          description: edited.description || null,
          source: 'inbox',
          status: 'active',
        }).select('id').single();
        if (error) throw error;
        linkedTable = 'insurance_policies';
        linkedId = data.id;
      } else if (type?.target_table === 'orders') {
        const { data, error } = await (supabase as any).from('orders').insert({
          customer_name: edited.customer_name || null,
          customer_email: edited.customer_email || null,
          customer_number: edited.customer_number || null,
          order_reference: edited.order_reference || null,
          delivery_date: edited.delivery_date || null,
          currency: edited.currency || null,
          total_amount: edited.total_amount || null,
          notes: edited.notes || null,
          status: 'draft',
          source: 'inbox',
        }).select('id').single();
        if (error) throw error;
        linkedTable = 'orders';
        linkedId = data.id;

        if (Array.isArray(edited.items) && edited.items.length > 0) {
          await (supabase as any).from('order_items').insert(
            edited.items.map((it: any, idx: number) => ({
              order_id: data.id,
              position: idx + 1,
              sku: it.sku || null,
              description: it.description || null,
              quantity: it.quantity || null,
              unit_price: it.unit_price || null,
            }))
          );
        }
      }

      // Update inbox doc
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from('inbox_documents').update({
        extracted_data: edited,
        status: linkedTable ? 'linked' : 'confirmed',
        linked_table: linkedTable,
        linked_id: linkedId,
        confirmed_by: user?.id,
        confirmed_at: new Date().toISOString(),
      }).eq('id', doc.id);

      // Trigger on_confirm rules
      supabase.functions.invoke('evaluate-action-rules', {
        body: { inbox_document_id: doc.id, trigger: 'on_confirm' },
      }).catch(() => {});

      toast.success(linkedTable ? `Übernommen (${linkedTable})` : 'Bestätigt');
      onChanged();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(`Fehler: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    await (supabase as any).from('inbox_documents').update({ status: 'dismissed' }).eq('id', doc.id);
    toast.success('Verworfen');
    onChanged();
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {doc.inbox_no} · {doc.subject}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-auto flex-1">
          <div className="space-y-2">
            <Label className="text-xs">PDF-Vorschau</Label>
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-[60vh] border rounded" />
            ) : (
              <div className="h-[60vh] flex items-center justify-center text-sm text-muted-foreground border rounded">
                Kein Anhang
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">
                  {type?.label_de || 'Unbekannt'} ·{' '}
                  {doc.classification_confidence != null ? `${Math.round(doc.classification_confidence * 100)}% sicher` : ''}
                </span>
                <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={onReclassify}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Neu
                </Button>
              </div>
              {doc.classification_reasoning && (
                <p className="text-xs text-muted-foreground italic">{doc.classification_reasoning}</p>
              )}
              {doc.error_message && (
                <p className="text-xs text-destructive mt-1">{doc.error_message}</p>
              )}
            </div>

            {fields.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-xs">Extrahierte Felder</Label>
                {fields.map((f: any) => (
                  <FieldEditor
                    key={f.key}
                    field={f}
                    value={edited?.[f.key]}
                    onChange={(v) => setEdited({ ...edited, [f.key]: v })}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Kein Typ erkannt — Felder nicht verfügbar.</p>
            )}

            {doc.linked_table && doc.linked_id && (
              <div className="rounded border p-2 bg-green-500/10">
                <p className="text-xs flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Übernommen in {doc.linked_table}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleDismiss} disabled={saving}>
            <XCircle className="h-4 w-4 mr-1" /> Verwerfen
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>Schließen</Button>
          <Button onClick={handleConfirm} disabled={saving || doc.status === 'linked'}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            {type?.target_table ? 'Bestätigen & übernehmen' : 'Bestätigen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldEditor({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
  if (field.type === 'array') {
    return (
      <div>
        <Label className="text-[10px] uppercase tracking-wider">{field.label}</Label>
        <pre className="text-[10px] bg-muted p-2 rounded max-h-32 overflow-auto">
          {JSON.stringify(value || [], null, 2)}
        </pre>
      </div>
    );
  }
  if (field.type === 'number') {
    return (
      <div>
        <Label className="text-[10px] uppercase tracking-wider">{field.label}</Label>
        <Input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="h-8 text-sm"
        />
      </div>
    );
  }
  if (field.type === 'date') {
    return (
      <div>
        <Label className="text-[10px] uppercase tracking-wider">{field.label}</Label>
        <Input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 text-sm"
        />
      </div>
    );
  }
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider">{field.label}</Label>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 text-sm"
      />
    </div>
  );
}
