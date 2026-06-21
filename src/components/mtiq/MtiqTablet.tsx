import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, Play, ShieldCheck, Lock, AlertCircle, ExternalLink, ChevronRight, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type StepStatus = 'locked' | 'ready' | 'running' | 'awaiting_review' | 'done' | 'error';
interface StepEntry { n: number; title: string; status: StepStatus; result: any; error?: string | null; approved_at?: string | null; }
interface Tablet {
  id: string;
  status: string;
  current_step: number;
  extracted: any;
  steps: StepEntry[];
  company_id: string | null;
  contact_id: string | null;
  source_file_path: string | null;
}

const DESC: Record<number, string> = {
  1: 'Felder aus der Visitenkarte prüfen und ggf. ergänzen.',
  2: 'E-Mail/Telefon validieren · Firma anreichern (Branche, Größe, Standort).',
  3: 'Treffer in Firmen- und Kontaktstamm suchen.',
  4: 'Einordnung: Kunde / Lieferant / Partner / Interessent · Lead-Score.',
  5: 'Firma + Kontakt im CRM anlegen (oder bestehendem zuordnen).',
  6: 'Begrüßungs- und Follow-up-Mail als Entwurf erzeugen.',
  7: 'Wer · wann · woher – Aktivität im CRM hinterlegen.',
  8: 'Wiedervorlage / Übergabe in den Vertriebsprozess.',
};

export function MtiqTablet({ tabletId, onClose }: { tabletId: string; onClose?: () => void }) {
  const navigate = useNavigate();
  const [tablet, setTablet] = useState<Tablet | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [editingExtracted, setEditingExtracted] = useState<any | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from('mtiq_tablets').select('*').eq('id', tabletId).maybeSingle();
    if (error) { toast.error(error.message); return; }
    setTablet(data as any);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`mtiq-tablet-${tabletId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mtiq_tablets', filter: `id=eq.${tabletId}` },
        (p: any) => setTablet(p.new as any))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tabletId]);

  const runStep = async (n: number) => {
    setBusy(n);
    try {
      const payload: any = { action: 'step', tablet_id: tabletId, step: n };
      if (n === 1 && editingExtracted) payload.edits = editingExtracted;
      if (n === 5 && attachId) payload.attach_company_id = attachId;
      const { data, error } = await supabase.functions.invoke('mtiq-tablet', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTablet(data.tablet);
      if (n === 1) setEditingExtracted(null);
    } catch (e: any) { toast.error(e?.message ?? 'Schritt fehlgeschlagen'); }
    finally { setBusy(null); }
  };

  const approveStep = async (n: number) => {
    setBusy(n);
    try {
      const payload: any = { action: 'approve', tablet_id: tabletId, step: n };
      if (n === 1 && editingExtracted) payload.edits = editingExtracted;
      const { data, error } = await supabase.functions.invoke('mtiq-tablet', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTablet(data.tablet);
      if (n === 1) setEditingExtracted(null);
      toast.success(`Schritt ${n} freigegeben`);
    } catch (e: any) { toast.error(e?.message ?? 'Freigabe fehlgeschlagen'); }
    finally { setBusy(null); }
  };

  if (!tablet) return <div className="p-4 text-[12px]" style={{ color: '#888' }}>Lade Tablet…</div>;

  const ext = editingExtracted ?? tablet.extracted ?? {};

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
        <div className="text-[12px] font-semibold" style={{ color: '#e0e0e0' }}>Prozess-Tablet · Visitenkarte</div>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded" style={{
          background: tablet.status === 'done' ? '#064e3b' : '#1e293b',
          color: tablet.status === 'done' ? '#6ee7b7' : '#93c5fd',
        }}>{tablet.status === 'done' ? 'Abgeschlossen' : `Schritt ${tablet.current_step}/8`}</span>
      </div>

      <div className="flex-1 p-3 space-y-2">
        {tablet.steps.map((s) => {
          const stepBusy = busy === s.n;
          const isCurrent = tablet.current_step === s.n && tablet.status !== 'done';
          const showEdit = s.n === 1 && (s.status === 'awaiting_review' || isCurrent);
          return (
            <div key={s.n} className="rounded-lg overflow-hidden"
              style={{
                background: '#0f0f0f',
                border: `1px solid ${isCurrent ? '#1e293b' : '#1a1a1a'}`,
                opacity: s.status === 'locked' ? 0.55 : 1,
              }}>
              <div className="px-3 py-2 flex items-center gap-2">
                <div className="flex items-center justify-center text-[10px] font-semibold"
                  style={{
                    width: 22, height: 22, borderRadius: 999,
                    background: s.status === 'done' ? '#059669' : s.status === 'error' ? '#7f1d1d' : s.status === 'locked' ? '#222' : 'linear-gradient(135deg,#0ea5e9,#818cf8)',
                    color: 'white',
                  }}>
                  {s.status === 'done' ? <Check className="h-3 w-3" /> : s.status === 'locked' ? <Lock className="h-3 w-3" /> : s.status === 'error' ? <AlertCircle className="h-3 w-3" /> : s.n}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate" style={{ color: '#e0e0e0' }}>{s.title}</div>
                  <div className="text-[10px] truncate" style={{ color: '#777' }}>{DESC[s.n]}</div>
                </div>
                <span className="text-[9px] uppercase tracking-wide" style={{ color: '#888' }}>
                  {s.status === 'awaiting_review' ? 'wartet auf Freigabe'
                    : s.status === 'running' ? 'läuft…'
                    : s.status === 'done' ? 'freigegeben'
                    : s.status === 'error' ? 'Fehler'
                    : s.status === 'ready' ? 'bereit'
                    : 'gesperrt'}
                </span>
              </div>

              {(s.status === 'awaiting_review' || s.status === 'done' || s.status === 'error') && (
                <div className="px-3 pb-3 space-y-2">
                  {s.error && <div className="text-[11px] p-2 rounded" style={{ background: '#1f1416', color: '#fca5a5' }}>{s.error}</div>}

                  {s.n === 1 && showEdit && (
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {(['first_name','last_name','position','company_name','email','phone','mobile','website','street','zip','city','country','vat_id','notes'] as const).map(k => (
                        <label key={k} className="flex flex-col gap-0.5" style={{ gridColumn: ['position','company_name','email','website','street','notes'].includes(k) ? 'span 2' : undefined }}>
                          <span className="text-[9px] uppercase" style={{ color: '#666' }}>{k}</span>
                          <input value={ext[k] ?? ''}
                            onChange={e => setEditingExtracted((p: any) => ({ ...(p ?? tablet.extracted), [k]: e.target.value }))}
                            className="px-2 py-1 outline-none"
                            style={{ background: '#080808', border: '1px solid #1f1f1f', borderRadius: 5, color: '#e0e0e0' }} />
                        </label>
                      ))}
                    </div>
                  )}

                  {s.n !== 1 && s.result && (
                    <div className="text-[11px] leading-relaxed p-2 rounded space-y-1"
                      style={{ background: '#080808', border: '1px solid #1a1a1a', color: '#cbd5e1' }}>
                      {renderResult(s.n, s.result)}
                    </div>
                  )}

                  {s.n === 3 && s.status === 'awaiting_review' && s.result?.candidates?.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase" style={{ color: '#888' }}>Bestehender Firma zuordnen (Schritt 5):</div>
                      {s.result.candidates.map((c: any) => (
                        <button key={c.id}
                          onClick={() => { setAttachId(c.id); toast.success(`Wird in Schritt 5 verwendet: ${c.name}`); }}
                          className="w-full text-left px-2 py-1.5 rounded text-[11px] flex items-center gap-2"
                          style={{ background: attachId === c.id ? '#0c2a3a' : '#0a0a0a', border: `1px solid ${attachId === c.id ? '#0ea5e9' : '#1a1a1a'}`, color: '#e0e0e0' }}>
                          <ChevronRight className="h-3 w-3" />{c.name} {c.customer_no && <span style={{ color: '#666' }}>· {c.customer_no}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {s.status === 'awaiting_review' && (
                    <div className="flex gap-2">
                      <button disabled={stepBusy} onClick={() => runStep(s.n)}
                        className="text-[11px] px-2.5 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                        style={{ background: '#181818', border: '1px solid #222', color: '#cbd5e1' }}>
                        <Edit2 className="h-3 w-3" /> Neu ausführen
                      </button>
                      <button disabled={stepBusy} onClick={() => approveStep(s.n)}
                        className="ml-auto text-[11px] px-3 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg,#0ea5e9,#818cf8)', color: 'white' }}>
                        {stepBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Freigeben
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(s.status === 'ready' || (isCurrent && s.status !== 'awaiting_review' && s.status !== 'done')) && s.n > 1 && (
                <div className="px-3 pb-3">
                  <button disabled={stepBusy} onClick={() => runStep(s.n)}
                    className="text-[11px] px-3 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#0ea5e9,#818cf8)', color: 'white' }}>
                    {stepBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Schritt starten
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {tablet.status === 'done' && tablet.company_id && (
          <button onClick={() => { onClose?.(); navigate(`/crm/companies/${tablet.company_id}`); }}
            className="w-full mt-2 px-3 py-2 text-[11px] rounded flex items-center justify-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white' }}>
            <ExternalLink className="h-3 w-3" /> Zur Firma im CRM
          </button>
        )}
      </div>
    </div>
  );
}
