import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload, ScanLine, X, ArrowLeft, Building2, UserPlus, ExternalLink, Check, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
  onOpenTablet?: (tabletId: string) => void;
}

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

type Step = 'upload' | 'review' | 'done';

const EMPTY: Extracted = {
  first_name: null, last_name: null, position: null, company_name: null,
  email: null, phone: null, mobile: null, website: null,
  street: null, zip: null, city: null, country: null,
  vat_id: null, notes: null,
};

export function MtiqCardScan({ onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState<Extracted>(EMPTY);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ company_id: string; customer_no: string | null; isNew: boolean } | null>(null);

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast.error('Datei zu groß (max. 20 MB)'); return; }
    setFile(f);
  };

  const scan = async () => {
    if (!file) { toast.error('Bitte Bild auswählen.'); return; }
    setScanning(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${(supabase as any).supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/mtiq-business-card-intake`;
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setExtracted({ ...EMPTY, ...(data.extracted || {}) });
      setCandidates(data.candidates || []);
      setStep('review');
    } catch (e: any) {
      toast.error(e?.message ?? 'Erkennung fehlgeschlagen');
    } finally {
      setScanning(false);
    }
  };

  const commit = async (choice: 'kunde' | 'distributor' | 'lieferant' | 'sonstiges' | 'attach', companyId?: string) => {
    if (choice !== 'attach' && !extracted.company_name?.trim()) {
      toast.error('Firmenname fehlt – bitte ergänzen.');
      return;
    }
    setCommitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-business-card-commit', {
        body: { extracted, choice, company_id: companyId ?? null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult({ company_id: data.company_id, customer_no: data.customer_no, isNew: choice !== 'attach' });
      setStep('done');
      toast.success(choice === 'attach' ? 'Kontakt angelegt' : `Firma angelegt · ${data.customer_no ?? ''}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Anlegen fehlgeschlagen');
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setFile(null); setExtracted(EMPTY); setCandidates([]); setResult(null); setStep('upload');
  };

  // ---------- STEP: upload ----------
  if (step === 'upload') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <div className="text-[11px]" style={{ color: '#888' }}>
            Visitenkarte hochladen – MTIQ liest Name, Firma, Kontakt und prüft auf Dubletten.
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {!file ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pick(f); }}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg p-6 text-center cursor-pointer transition-colors"
              style={{ border: `1px dashed ${dragOver ? '#0ea5e9' : '#2a2a2a'}`, background: dragOver ? '#0a1a24' : '#0f0f0f' }}
            >
              <CreditCard className="h-7 w-7 mx-auto mb-2" style={{ color: '#0ea5e9' }} />
              <div className="text-[12px]" style={{ color: '#cbd5e1' }}>Visitenkarte ablegen</div>
              <div className="text-[10px] mt-1" style={{ color: '#666' }}>oder klicken · JPG / PNG / HEIC / PDF · max. 20 MB</div>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
                onChange={e => pick(e.target.files?.[0] ?? null)} />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: '#0f0f0f', border: '1px solid #222' }}>
              <ScanLine className="h-4 w-4 shrink-0" style={{ color: '#0ea5e9' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] truncate" style={{ color: '#e0e0e0' }}>{file.name}</div>
                <div className="text-[10px]" style={{ color: '#666' }}>{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button onClick={() => setFile(null)} disabled={scanning} className="p-1 rounded hover:bg-white/5" style={{ color: '#888' }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="px-3 py-2.5 flex" style={{ borderTop: '1px solid #1a1a1a' }}>
          <button
            onClick={scan}
            disabled={scanning || !file}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Erkennen
          </button>
        </div>
      </div>
    );
  }

  // ---------- STEP: review ----------
  if (step === 'review') {
    const F = (k: keyof Extracted, label: string, span: 1 | 2 = 1, multiline = false) => (
      <div className={span === 2 ? 'col-span-2' : ''}>
        <label className="text-[9px] uppercase tracking-wide block mb-0.5" style={{ color: '#666' }}>{label}</label>
        {multiline ? (
          <textarea
            value={extracted[k] || ''} rows={2}
            onChange={e => setExtracted(p => ({ ...p, [k]: e.target.value }))}
            className="w-full px-2 py-1 text-[12px] outline-none resize-none"
            style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 6, color: '#e0e0e0' }}
          />
        ) : (
          <input
            value={extracted[k] || ''}
            onChange={e => setExtracted(p => ({ ...p, [k]: e.target.value }))}
            className="w-full px-2 py-1 text-[12px] outline-none"
            style={{ background: '#0f0f0f', border: '1px solid #222', borderRadius: 6, color: '#e0e0e0' }}
          />
        )}
      </div>
    );

    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #222' }}>
          <button onClick={reset} className="p-1 rounded hover:bg-[#181818]" style={{ color: '#999' }}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="text-[12px] font-medium" style={{ color: '#e0e0e0' }}>Erkannte Daten prüfen</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {candidates.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: '#888' }}>
                Mögliche bestehende Firmen
              </div>
              {candidates.map(c => (
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
                    disabled={committing}
                    onClick={() => commit('attach', c.company_id)}
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
            {F('first_name', 'Vorname')}
            {F('last_name', 'Nachname')}
            {F('position', 'Position', 2)}
            {F('company_name', 'Firma', 2)}
            {F('email', 'E-Mail', 2)}
            {F('phone', 'Telefon')}
            {F('mobile', 'Mobil')}
            {F('website', 'Website', 2)}
            {F('street', 'Straße', 2)}
            {F('zip', 'PLZ')}
            {F('city', 'Stadt')}
            {F('country', 'Land')}
            {F('vat_id', 'USt-ID')}
            {F('notes', 'Notizen', 2, true)}
          </div>

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
                  disabled={committing}
                  onClick={() => commit(key)}
                  className="px-2.5 py-1.5 text-[11px] rounded-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{ background: '#181818', border: '1px solid #2a2a2a', color: '#e0e0e0' }}
                >
                  {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Building2 className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- STEP: done ----------
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="text-[11px]" style={{ color: '#888' }}>Erfolgreich gespeichert</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col items-center justify-center text-center gap-3">
        <div className="flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
          <Check className="h-7 w-7 text-white" />
        </div>
        <div className="text-[14px] font-medium" style={{ color: '#e0e0e0' }}>
          {result?.isNew ? 'Firma angelegt' : 'Kontakt angehängt'}
        </div>
        {result?.customer_no && (
          <div className="text-[11px]" style={{ color: '#888' }}>Kundennummer: <span className="font-mono">{result.customer_no}</span></div>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => { onClose(); if (result) navigate(`/crm/companies/${result.company_id}`); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md"
            style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)', color: 'white' }}
          >
            <ExternalLink className="h-3 w-3" /> Zur Firma öffnen
          </button>
          <button onClick={reset}
            className="px-3 py-1.5 text-[11px] rounded-md"
            style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}>
            Weitere Karte
          </button>
        </div>
      </div>
    </div>
  );
}
