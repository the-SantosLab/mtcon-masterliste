import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload, ScanLine, X, ArrowLeft, Building2, UserPlus, ExternalLink, Check, CreditCard, FileText, Sparkles, Info, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
  onOpenTablet?: (tabletId: string) => void;
}

type LogKind = 'user' | 'mtiq' | 'system' | 'hint' | 'success' | 'error';
type LogEntry = { id: string; ts: number; kind: LogKind; text: string };

const ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,application/pdf';

type Extracted = {
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  vat_id: string | null;
  notes: string | null;
  confidence?: string;
};

type Candidate = {
  company_id: string;
  name: string;
  type: string;
  partner_role: string;
  customer_no: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  score: number;
  reasons: string[];
};

type CardItem = {
  extracted: Extracted;
  candidates: Candidate[];
  status: 'pending' | 'saving' | 'done' | 'skipped';
  result?: { company_id: string; customer_no: string | null; isNew: boolean };
};

type Step = 'upload' | 'review';

const EMPTY: Extracted = {
  first_name: null, last_name: null, position: null, company_name: null,
  email: null, phone: null, mobile: null, website: null,
  street: null, zip: null, city: null, country: null,
  vat_id: null, notes: null,
};

export function MtiqCardScan({ onClose, onOpenTablet }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [tabletLoading, setTabletLoading] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([
    { id: 'init', ts: Date.now(), kind: 'mtiq', text: 'Hi, ich bin MTIQ. Lade eine oder mehrere Visitenkarten hoch – ich lese jede Karte einzeln, prüfe gegen bestehende Firmen und schlage dir den nächsten Schritt vor.' },
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const addLog = (kind: LogKind, text: string) =>
    setLog(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), kind, text }]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [log.length]);

  const pick = (fs: FileList | File[] | null) => {
    if (!fs) return;
    const arr = Array.from(fs);
    const valid = arr.filter(f => {
      if (f.size > 20 * 1024 * 1024) { toast.error(`Zu groß (max. 20 MB): ${f.name}`); addLog('error', `Übersprungen (max. 20 MB): ${f.name}`); return false; }
      return true;
    });
    setFiles(prev => {
      const merged = [...prev];
      const added: string[] = [];
      for (const f of valid) {
        if (!merged.some(m => m.name === f.name && m.size === f.size)) { merged.push(f); added.push(f.name); }
      }
      const next = merged.slice(0, 10);
      if (added.length > 0) {
        addLog('user', `${added.length} Datei${added.length === 1 ? '' : 'en'} hinzugefügt: ${added.join(', ')}`);
        addLog('hint', `Insgesamt ${next.length}/10 bereit. Klick auf „Erkennen", um MTIQ starten zu lassen.`);
      }
      return next;
    });
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, n) => n !== i));

  const scan = async () => {
    if (files.length === 0) { toast.error('Bitte mindestens eine Datei auswählen.'); return; }
    setScanning(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${(supabase as any).supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/mtiq-business-card-intake`;
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const list: CardItem[] = (data.results || []).map((r: any) => ({
        extracted: { ...EMPTY, ...(r.extracted || {}) },
        candidates: r.candidates || [],
        status: 'pending',
      }));
      if (list.length === 0) { toast.error('Keine Visitenkarte erkannt.'); return; }
      setCards(list);
      setActiveIdx(0);
      setStep('review');
      toast.success(`${list.length} Visitenkarte${list.length === 1 ? '' : 'n'} erkannt`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erkennung fehlgeschlagen');
    } finally {
      setScanning(false);
    }
  };

  const updateField = (idx: number, k: keyof Extracted, v: string) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, extracted: { ...c.extracted, [k]: v } } : c));
  };

  const setCardStatus = (idx: number, patch: Partial<CardItem>) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const commit = async (idx: number, choice: 'kunde' | 'distributor' | 'lieferant' | 'sonstiges' | 'attach', companyId?: string) => {
    const card = cards[idx];
    if (!card) return;
    if (choice !== 'attach' && !card.extracted.company_name?.trim()) {
      toast.error('Firmenname fehlt – bitte ergänzen.');
      return;
    }
    setCardStatus(idx, { status: 'saving' });
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-business-card-commit', {
        body: { extracted: card.extracted, choice, company_id: companyId ?? null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCardStatus(idx, {
        status: 'done',
        result: { company_id: data.company_id, customer_no: data.customer_no, isNew: choice !== 'attach' },
      });
      toast.success(choice === 'attach' ? 'Kontakt angelegt' : `Firma angelegt · ${data.customer_no ?? ''}`);
      // Auto-jump to next pending card
      const next = cards.findIndex((c, i) => i > idx && c.status === 'pending');
      if (next >= 0) setActiveIdx(next);
    } catch (e: any) {
      setCardStatus(idx, { status: 'pending' });
      toast.error(e?.message ?? 'Anlegen fehlgeschlagen');
    }
  };

  const reset = () => {
    setFiles([]); setCards([]); setActiveIdx(0); setStep('upload');
  };

  // ---------- STEP: upload ----------
  if (step === 'upload') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <div className="text-[11px]" style={{ color: '#888' }}>
            Eine oder mehrere Visitenkarten hochladen – MTIQ liest jede Karte einzeln und prüft auf Dubletten.
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg p-6 text-center cursor-pointer transition-colors"
            style={{ border: `1px dashed ${dragOver ? '#0ea5e9' : '#2a2a2a'}`, background: dragOver ? '#0a1a24' : '#0f0f0f' }}
          >
            <CreditCard className="h-7 w-7 mx-auto mb-2" style={{ color: '#0ea5e9' }} />
            <div className="text-[12px]" style={{ color: '#cbd5e1' }}>Visitenkarten ablegen (mehrere möglich)</div>
            <div className="text-[10px] mt-1" style={{ color: '#666' }}>klicken oder ziehen · JPG / PNG / HEIC / PDF · max. 20 MB · bis zu 10 Dateien</div>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
              onChange={e => pick(e.target.files)} />
          </div>

          {files.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: '#888' }}>
                {files.length} Datei{files.length === 1 ? '' : 'en'}
              </div>
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#0f0f0f', border: '1px solid #222' }}>
                  <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: '#0ea5e9' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] truncate" style={{ color: '#e0e0e0' }}>{f.name}</div>
                    <div className="text-[10px]" style={{ color: '#666' }}>{(f.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={() => removeFile(i)} disabled={scanning} className="p-1 rounded hover:bg-white/5" style={{ color: '#888' }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-2.5 flex" style={{ borderTop: '1px solid #1a1a1a' }}>
          <button
            onClick={scan}
            disabled={scanning || files.length === 0}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {scanning ? 'Erkenne…' : 'Erkennen'}
          </button>
        </div>
      </div>
    );
  }

  // ---------- STEP: review ----------
  const active = cards[activeIdx];
  const doneCount = cards.filter(c => c.status === 'done').length;
  const allDone = cards.every(c => c.status === 'done' || c.status === 'skipped');

  const F = (idx: number, k: keyof Extracted, label: string, span: 1 | 2 = 1, multiline = false) => (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="text-[9px] uppercase tracking-wide block mb-0.5" style={{ color: '#666' }}>{label}</label>
      {multiline ? (
        <textarea
          value={cards[idx].extracted[k] || ''} rows={2}
          onChange={e => updateField(idx, k, e.target.value)}
          className="w-full px-2 py-1 text-[12px] outline-none resize-none"
          style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 6, color: '#e0e0e0' }}
        />
      ) : (
        <input
          value={cards[idx].extracted[k] || ''}
          onChange={e => updateField(idx, k, e.target.value)}
          className="w-full px-2 py-1 text-[12px] outline-none"
          style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 6, color: '#e0e0e0' }}
        />
      )}
    </div>
  );

  const statusDot = (s: CardItem['status']) => {
    const color = s === 'done' ? '#10b981' : s === 'saving' ? '#0ea5e9' : s === 'skipped' ? '#6b7280' : '#f59e0b';
    return <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #222' }}>
        <button onClick={reset} className="p-1 rounded hover:bg-[#181818]" style={{ color: '#999' }}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="text-[12px] font-medium" style={{ color: '#e0e0e0' }}>
          Visitenkarten prüfen
        </div>
        <div className="text-[10px]" style={{ color: '#666' }}>
          {doneCount}/{cards.length} verarbeitet
        </div>
        {allDone && (
          <button
            onClick={onClose}
            className="ml-auto px-2 py-1 text-[11px] rounded-md flex items-center gap-1"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white' }}
          >
            <Check className="h-3 w-3" /> Fertig
          </button>
        )}
      </div>

      {/* Card tabs */}
      {cards.length > 1 && (
        <div className="px-2 py-1.5 flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid #1a1a1a' }}>
          {cards.map((c, i) => {
            const label = [c.extracted.first_name, c.extracted.last_name].filter(Boolean).join(' ')
              || c.extracted.company_name
              || `Karte ${i + 1}`;
            const isActive = i === activeIdx;
            return (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className="px-2 py-1 text-[11px] rounded-md flex items-center gap-1.5 shrink-0"
                style={{
                  background: isActive ? '#1e293b' : '#0f0f0f',
                  border: `1px solid ${isActive ? '#334155' : '#222'}`,
                  color: isActive ? '#e0e0e0' : '#999',
                }}
              >
                {statusDot(c.status)}
                <span className="truncate max-w-[140px]">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {active.status === 'done' && active.result && (
            <div className="p-2.5 rounded-md flex items-center gap-2" style={{ background: '#052e1f', border: '1px solid #065f46' }}>
              <Check className="h-4 w-4" style={{ color: '#10b981' }} />
              <div className="flex-1 text-[12px]" style={{ color: '#a7f3d0' }}>
                {active.result.isNew ? 'Firma angelegt' : 'Kontakt angehängt'}
                {active.result.customer_no && <span className="ml-1 font-mono text-[11px]">· {active.result.customer_no}</span>}
              </div>
              <button
                onClick={() => { onClose(); navigate(`/crm/companies/${active.result!.company_id}`); }}
                className="text-[10px] flex items-center gap-1 px-2 py-1 rounded"
                style={{ background: '#065f46', color: '#d1fae5' }}
              >
                <ExternalLink className="h-3 w-3" /> öffnen
              </button>
            </div>
          )}

          {active.candidates.length > 0 && active.status !== 'done' && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: '#888' }}>
                Mögliche bestehende Firmen
              </div>
              {active.candidates.map(c => (
                <div key={c.company_id} className="p-2 rounded-md flex items-start gap-2"
                  style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                  <Building2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: '#0ea5e9' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate" style={{ color: '#e0e0e0' }}>
                      {c.name} {c.customer_no && <span className="text-[10px] font-normal" style={{ color: '#666' }}>· {c.customer_no}</span>}
                    </div>
                    <div className="text-[10px]" style={{ color: '#888' }}>
                      {c.reasons.join(' · ')}
                    </div>
                  </div>
                  <button
                    disabled={active.status === 'saving'}
                    onClick={() => commit(activeIdx, 'attach', c.company_id)}
                    className="px-2 py-1 text-[10px] rounded shrink-0 disabled:opacity-50"
                    style={{ background: '#0ea5e9', color: 'white' }}
                  >
                    <UserPlus className="h-3 w-3 inline mr-1" />Kontakt anhängen
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {F(activeIdx, 'first_name', 'Vorname')}
            {F(activeIdx, 'last_name', 'Nachname')}
            {F(activeIdx, 'position', 'Position', 2)}
            {F(activeIdx, 'company_name', 'Firma', 2)}
            {F(activeIdx, 'email', 'E-Mail', 2)}
            {F(activeIdx, 'phone', 'Telefon')}
            {F(activeIdx, 'mobile', 'Mobil')}
            {F(activeIdx, 'website', 'Website', 2)}
            {F(activeIdx, 'street', 'Straße', 2)}
            {F(activeIdx, 'zip', 'PLZ')}
            {F(activeIdx, 'city', 'Stadt')}
            {F(activeIdx, 'country', 'Land')}
            {F(activeIdx, 'vat_id', 'USt-ID')}
            {F(activeIdx, 'notes', 'Notizen', 2, true)}
          </div>

          {active.status !== 'done' && onOpenTablet && cards.length === 1 && (
            <button
              disabled={tabletLoading}
              onClick={async () => {
                setTabletLoading(true);
                try {
                  const { data, error } = await supabase.functions.invoke('mtiq-tablet', {
                    body: { action: 'create', extracted: active.extracted },
                  });
                  if (error) throw error;
                  if (data?.error) throw new Error(data.error);
                  toast.success('Prozess-Tablet gestartet');
                  onOpenTablet(data.tablet.id);
                } catch (e: any) { toast.error(e?.message ?? 'Tablet konnte nicht gestartet werden'); }
                finally { setTabletLoading(false); }
              }}
              className="w-full px-3 py-2 text-[12px] rounded-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#0ea5e9,#818cf8)', color: 'white' }}
            >
              {tabletLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
              Im Prozess-Tablet weiterführen (8 Schritte)
            </button>
          )}

          {active.status !== 'done' && (
            <div>
              <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>
                Neu anlegen als …
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['kunde', 'Kunde'],
                  ['distributor', 'Vertriebspartner'],
                  ['lieferant', 'Lieferant'],
                  ['sonstiges', 'Sonstiges'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    disabled={active.status === 'saving'}
                    onClick={() => commit(activeIdx, key)}
                    className="px-2.5 py-1.5 text-[11px] rounded-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: '#181818', border: '1px solid #2a2a2a', color: '#e0e0e0' }}
                  >
                    {active.status === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Building2 className="h-3 w-3" />}
                    {label}
                  </button>
                ))}
              </div>
              {cards.length > 1 && (
                <button
                  onClick={() => {
                    setCardStatus(activeIdx, { status: 'skipped' });
                    const next = cards.findIndex((c, i) => i > activeIdx && c.status === 'pending');
                    if (next >= 0) setActiveIdx(next);
                  }}
                  className="mt-2 w-full px-2 py-1.5 text-[11px] rounded-md"
                  style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#888' }}
                >
                  Diese Karte überspringen
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
