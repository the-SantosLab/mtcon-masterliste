import { ProcurementHeader } from '@/components/erp/ProcurementHeader';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const FIELDS: { key: string; label: string }[] = [
  { key: 'art_nr', label: 'Art.-Nr.' },
  { key: 'matchcode', label: 'Matchcode' },
  { key: 'bezeich_1', label: 'Bezeichnung 1' },
  { key: 'bezeich_2', label: 'Bezeichnung 2' },
  { key: 'mat_art', label: 'Mat-Art' },
  { key: 'me', label: 'ME' },
  { key: 'koerper', label: 'Körper' },
  { key: 'ausfuehrung', label: 'Ausführung' },
  { key: 'pins', label: 'Pins' },
  { key: 'material', label: 'Material' },
  { key: 'galvanik', label: 'Galvanik' },
  { key: 'hoehe', label: 'Höhe' },
  { key: 'gewinde', label: 'Gewinde' },
  { key: 'pinlaenge', label: 'Pinlänge' },
  { key: 'rastermass', label: 'Rastermaß' },
  { key: 'dichtring', label: 'Dichtring' },
  { key: 'erni_nr', label: 'ERNI-Nr' },
  { key: 'ics_nr', label: 'ICS-Nr' },
  { key: 'eisos_nr', label: 'eiSos-Nr' },
  { key: 'weber_art_nr', label: 'Weber-Art-Nr' },
];

export default function AdminAiArticleFromPdf() {
  const { isAdmin, loading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState('');
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);

  if (!loading && !isAdmin) return <Navigate to="/" replace />;

  const extract = async () => {
    if (!file) { toast.error('Bitte PDF auswählen'); return; }
    setExtracting(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      const b64 = btoa(bin);
      const { data: res, error } = await supabase.functions.invoke('ai-article-from-pdf', {
        body: { file_name: file.name, file_data: b64 },
      });
      if (error) throw error;
      const ext = (res as any)?.extracted ?? {};
      const next: Record<string, string> = {};
      for (const f of FIELDS) next[f.key] = String(ext[f.key] ?? '');
      setData(next);
      setMemo(String(ext.memo_ext ?? ''));
      setNotes(String(ext.notes ?? ''));
      setConfidence(typeof ext.confidence === 'number' ? ext.confidence : null);
      toast.success('Extraktion abgeschlossen');
    } catch (e: any) {
      toast.error(e?.message ?? 'Extraktion fehlgeschlagen');
    } finally { setExtracting(false); }
  };

  const save = async () => {
    if (!data.art_nr?.trim()) { toast.error('Art-Nr ist Pflicht'); return; }
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const f of FIELDS) if (data[f.key]?.trim()) payload[f.key] = data[f.key].trim();
      if (memo.trim()) payload.memo_ext = memo.trim();
      const { error } = await supabase.from('articles').upsert([payload as any], { onConflict: 'art_nr' });
      if (error) throw error;
      toast.success(`Artikel ${payload.art_nr} angelegt`);
      setData({}); setMemo(''); setNotes(''); setConfidence(null); setFile(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Speichern fehlgeschlagen');
    } finally { setSaving(false); }
  };

  return (
    <AppLayout>
      <div className="fulfillment-page procurement-page">
        <ProcurementHeader title="KI-Artikelanlage" subtitle="Datenblatt · Stammdatenvorschlag · Prüfung" />
        <Card className="procurement-upload">
          <CardHeader className="pb-3"><CardTitle className="text-sm">1 · Datenblatt</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button onClick={extract} disabled={!file || extracting} size="sm">
              {extracting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
              Extrahieren
            </Button>
          </CardContent>
        </Card>

        {(Object.keys(data).length > 0 || confidence !== null) && (
          <Card className="procurement-section">
            <CardHeader className="pb-3 flex flex-row flex-wrap gap-2 items-center justify-between">
              <CardTitle className="text-sm">2 · Vorschlag prüfen</CardTitle>
              {confidence !== null && (
                <span className="text-xs text-muted-foreground">Konfidenz: {Math.round(confidence * 100)}%</span>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input value={data[f.key] ?? ''} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} className="h-8 text-xs" />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Memo / Beschreibung</Label>
                <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className="text-xs" />
              </div>
              {notes && (
                <div className="rounded border border-status-working/20 bg-status-working/5 p-2 text-xs text-status-working">
                  KI-Hinweise: {notes}
                </div>
              )}
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-2" />}
                Artikel anlegen
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
