import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, GitMerge, ExternalLink, ArrowRight } from 'lucide-react';

type Pair = {
  a: { id: string; case_no: string | null; title: string | null; kunde: string | null; status: string; created_at: string };
  b: { id: string; case_no: string | null; title: string | null; kunde: string | null; status: string; created_at: string };
  signals: string[];
  similarity: number;
  confidence: number;
  reason: string;
  target: string;
};

export function MtiqDuplicateScan() {
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [meta, setMeta] = useState<{ total_scanned?: number; evaluated?: number } | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [applyCustomer, setApplyCustomer] = useState<Record<number, boolean>>({});

  const runScan = async () => {
    setLoading(true);
    setPairs(null);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-duplicate-scan', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPairs(data?.pairs ?? []);
      setMeta({ total_scanned: data?.total_scanned, evaluated: data?.evaluated });
    } catch (e: any) {
      toast.error(e?.message ?? 'Scan fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const doMerge = async (p: Pair, pairIndex: number, targetIsA: boolean) => {
    const source_id = targetIsA ? p.b.id : p.a.id;
    const target_id = targetIsA ? p.a.id : p.b.id;
    const src = targetIsA ? p.b : p.a;
    const tgt = targetIsA ? p.a : p.b;
    const customersDiffer = (src.kunde ?? '') !== (tgt.kunde ?? '');
    const apply = customersDiffer && !!applyCustomer[pairIndex];
    const customerHint = customersDiffer
      ? apply
        ? `\n\nKundendaten des Ziels werden überschrieben: „${tgt.kunde ?? '—'}" → „${src.kunde ?? '—'}".`
        : `\n\nHinweis: Kunden weichen ab („${src.kunde ?? '—'}" vs. „${tgt.kunde ?? '—'}"). Die Kundendaten des Zielvorgangs bleiben unverändert.`
      : '';
    if (!confirm(`Vorgang ${src.case_no ?? src.id} wirklich in ${tgt.case_no ?? tgt.id} zusammenführen? Notizen, Unteraufgaben und Chat werden übernommen. Der Quell-Vorgang wird verworfen.${customerHint}`)) return;
    setMerging(`${source_id}-${target_id}`);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-merge-cases', { body: { source_id, target_id, apply_customer_from_source: apply } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Zusammengeführt: ${data?.moved?.notes ?? 0} Notizen, ${data?.moved?.tasks ?? 0} Unteraufgaben, ${data?.moved?.chat ?? 0} Chatnachrichten übernommen.${data?.customer_applied ? ' Kundendaten aktualisiert.' : ''}`);
      setPairs(ps => (ps ?? []).filter(x => x !== p));
    } catch (e: any) {
      toast.error(e?.message ?? 'Zusammenführen fehlgeschlagen');
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px]" style={{ color: '#888' }}>
          Analysiert offene Vorgänge auf mögliche Duplikate.
        </div>
        <Button size="sm" onClick={runScan} disabled={loading}>
          {loading ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Scanne…</> : <><Search className="h-3 w-3 mr-1.5" /> Scan starten</>}
        </Button>
      </div>

      {meta && (
        <div className="text-[10px]" style={{ color: '#666' }}>
          {meta.total_scanned ?? 0} gescannt · {meta.evaluated ?? 0} Paare bewertet · {pairs?.length ?? 0} Duplikate.
        </div>
      )}

      {pairs && pairs.length === 0 && (
        <Card className="p-4 text-center text-xs text-muted-foreground">Keine Duplikate gefunden.</Card>
      )}

      {(pairs ?? []).map((p, i) => {
        const targetIsA = p.target === p.a.id;
        const busyKey = `${targetIsA ? p.b.id : p.a.id}-${targetIsA ? p.a.id : p.b.id}`;
        return (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <Badge variant={p.confidence >= 0.8 ? 'destructive' : p.confidence >= 0.6 ? 'default' : 'secondary'} className="text-[10px]">
                Konfidenz {(p.confidence * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="text-[10px]">Ähnlichkeit {(p.similarity * 100).toFixed(0)}%</Badge>
              {p.signals.map((s, k) => <Badge key={k} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>

            {p.reason && <div className="text-[10px] text-muted-foreground mb-2 italic">MTIQ: {p.reason}</div>}

            <div className="grid grid-cols-2 gap-2">
              {[p.a, p.b].map((c, idx) => {
                const isTarget = c.id === p.target;
                return (
                  <div key={idx} className={`p-2 rounded border ${isTarget ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-[10px] font-mono">{c.case_no ?? c.id.slice(0, 8)}</div>
                      {isTarget && <Badge variant="default" className="text-[9px]">Ziel</Badge>}
                    </div>
                    <div className="text-xs font-medium truncate">{c.title ?? '—'}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.kunde ?? '—'} · {c.status}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{new Date(c.created_at).toLocaleDateString('de-DE')}</div>
                    <Link to={`/cases/${c.id}`} target="_blank" className="text-[10px] text-primary inline-flex items-center gap-1 mt-1 hover:underline">
                      Öffnen <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                );
              })}
            </div>

            {(p.a.kunde ?? '') !== (p.b.kunde ?? '') && (
              <label className="flex items-start gap-1.5 mt-2 text-[10px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!applyCustomer[i]}
                  onChange={e => setApplyCustomer(prev => ({ ...prev, [i]: e.target.checked }))}
                />
                <span>Kundendaten aus dem Quell-Vorgang beim Ziel übernehmen (Kunden weichen ab).</span>
              </label>
            )}

            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Button size="sm" variant="default" disabled={merging === busyKey} onClick={() => doMerge(p, i, true)} className="h-7 text-[10px]">
                {merging === busyKey ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitMerge className="h-3 w-3 mr-1" />}
                B <ArrowRight className="h-3 w-3 mx-0.5" /> A
              </Button>
              <Button size="sm" variant="outline" disabled={!!merging} onClick={() => doMerge(p, i, false)} className="h-7 text-[10px]">
                A <ArrowRight className="h-3 w-3 mx-0.5" /> B
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPairs(ps => (ps ?? []).filter(x => x !== p))} className="h-7 text-[10px]">
                Kein Duplikat
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
