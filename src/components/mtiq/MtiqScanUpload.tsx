import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload, FileText, ScanLine, X, Languages } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { buildTranslatedPdf, translatedFileName, type TranslatedDoc } from '@/lib/translated-pdf';

interface Props {
  onClose: () => void;
}

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic';

export function MtiqScanUpload({ onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<'analyze' | 'translate'>('analyze');

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast.error('Datei zu groß (max. 20 MB)');
      return;
    }
    if (mode === 'translate' && f.type !== 'application/pdf') {
      toast.error('Zum Übersetzen bitte eine PDF-Datei wählen.');
      return;
    }
    setFile(f);
  };

  const submitTranslate = async () => {
    if (!file) {
      toast.error('Bitte PDF-Datei auswählen.');
      return;
    }
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${(supabase as any).supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/mtiq-translate-pdf`;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('target_lang', 'Deutsch');
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error ?? `HTTP ${res.status}`);

      const translated = data as TranslatedDoc;
      const doc = buildTranslatedPdf(translated, file.name, user?.email ?? null);
      doc.save(translatedFileName(translated, file.name));
      toast.success(`Übersetzt (${translated.source_language ?? 'Original'} → Deutsch) und heruntergeladen`);
      setFile(null);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Übersetzung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!file) {
      toast.error('Bitte Datei auswählen.');
      return;
    }
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${(supabase as any).supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/mtiq-document-intake`;
      const fd = new FormData();
      fd.append('file', file);
      if (hint.trim()) fd.append('hint', hint.trim());
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error ?? `HTTP ${res.status}`);

      const cls = data?.doc_classification ?? '–';
      const route = data?.routing_suggestion ?? '–';
      toast.success(`Erkannt: ${cls} → ${routeLabel(route)}`);
      setFile(null); setHint('');
      const draftId = data?.draft?.id;
      onClose();
      navigate('/mtiq/drafts' + (draftId ? `?id=${draftId}` : ''));
    } catch (e: any) {
      toast.error(e?.message ?? 'Analyse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 space-y-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode('analyze')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md"
            style={mode === 'analyze'
              ? { background: '#0a1a24', border: '1px solid #0ea5e9', color: '#7dd3fc' }
              : { background: '#0f0f0f', border: '1px solid #222', color: '#888' }}
          >
            <ScanLine className="h-3 w-3" /> Analysieren
          </button>
          <button
            onClick={() => setMode('translate')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md"
            style={mode === 'translate'
              ? { background: '#0a1a24', border: '1px solid #0ea5e9', color: '#7dd3fc' }
              : { background: '#0f0f0f', border: '1px solid #222', color: '#888' }}
          >
            <Languages className="h-3 w-3" /> PDF übersetzen
          </button>
        </div>
        <div className="text-[11px]" style={{ color: '#888' }}>
          {mode === 'analyze'
            ? 'Dokument oder Scan hochladen – MTIQ erkennt Typ (Versicherung, Lieferschein, Anfrage, Bestellung) und schlägt Vorgang oder Ablage vor.'
            : 'PDF hochladen (z. B. englisch) – MTIQ übersetzt den Inhalt vollständig nach Deutsch und erzeugt ein neues PDF zum Herunterladen.'}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files?.[0]; if (f) pick(f);
            }}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg p-6 text-center cursor-pointer transition-colors"
            style={{
              border: `1px dashed ${dragOver ? '#0ea5e9' : '#2a2a2a'}`,
              background: dragOver ? '#0a1a24' : '#0f0f0f',
            }}
          >
            <ScanLine className="h-7 w-7 mx-auto mb-2" style={{ color: '#0ea5e9' }} />
            <div className="text-[12px]" style={{ color: '#cbd5e1' }}>
              {mode === 'translate' ? 'PDF hier ablegen' : 'PDF oder Bild hier ablegen'}
            </div>
            <div className="text-[10px] mt-1" style={{ color: '#666' }}>
              oder klicken zum Auswählen · max. 20 MB
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={mode === 'translate' ? 'application/pdf' : ACCEPT}
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
            style={{ background: '#0f0f0f', border: '1px solid #222' }}
          >
            <FileText className="h-4 w-4 shrink-0" style={{ color: '#0ea5e9' }} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] truncate" style={{ color: '#e0e0e0' }}>{file.name}</div>
              <div className="text-[10px]" style={{ color: '#666' }}>
                {(file.size / 1024).toFixed(0)} KB · {file.type || 'unbekannt'}
              </div>
            </div>
            <button
              onClick={() => setFile(null)}
              disabled={loading}
              className="p-1 rounded hover:bg-white/5"
              style={{ color: '#888' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {mode === 'analyze' && (
          <div>
            <label className="text-[10px] uppercase tracking-wide" style={{ color: '#666' }}>
              Hinweis / Kontext (optional)
            </label>
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              disabled={loading}
              rows={4}
              placeholder={'z. B. „Lieferschein zur Bestellung B-2026-0123“ oder „Versicherungsschein KFZ“.'}
              className="mt-1 w-full px-2.5 py-2 text-[12px] outline-none resize-none"
              style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 10, color: '#e0e0e0' }}
            />
          </div>
        )}

        <div className="text-[10px] leading-relaxed" style={{ color: '#555' }}>
          {mode === 'analyze'
            ? 'Erkannte Klassen: Versicherung · Lieferschein · Anfrage · Bestellung · Sonstiges. Versicherungen werden zur zentralen Ablage vorgeschlagen, Bestellungen/Anfragen als Vorgang.'
            : 'Das Original-Layout wird nicht übernommen: Die Übersetzung wird als neu gesetztes, mehrseitiges PDF ausgegeben (Text, Tabellen und Aufzählungen als Absätze). Bitte Fachinhalte stichprobenartig prüfen.'}
        </div>
      </div>

      <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid #1a1a1a' }}>
        <div className="flex-1" />
        <button
          onClick={mode === 'translate' ? submitTranslate : submit}
          disabled={loading || !file}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'translate' ? <Languages className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {mode === 'translate' ? 'Übersetzen & PDF herunterladen' : 'Analysieren & Entwurf erstellen'}
        </button>
      </div>
    </div>
  );
}

function routeLabel(r: string): string {
  switch (r) {
    case 'dokument_ablegen': return 'Dokument ablegen';
    case 'vorgang_anlegen': return 'Vorgang anlegen';
    case 'beides': return 'Vorgang + Ablage';
    default: return 'unklar';
  }
}
