import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
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

export default function AdminDuplicateScan() {
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [meta, setMeta] = useState<{ total_scanned?: number; evaluated?: number } | null>(null);
  const [merging, setMerging] = useState<string | null>(null);

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

  const doMerge = async (p: Pair, targetIsA: boolean) => {
    const source_id = targetIsA ? p.b.id : p.a.id;
    const target_id = targetIsA ? p.a.id : p.b.id;
    const src = targetIsA ? p.b : p.a;
    const tgt = targetIsA ? p.a : p.b;
    if (!confirm(`Vorgang ${src.case_no ?? src.id} wirklich in ${tgt.case_no ?? tgt.id} zusammenführen? Notizen, Unteraufgaben und Chat werden übernommen. Der Quell-Vorgang wird verworfen.`)) return;
    setMerging(`${source_id}-${target_id}`);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-merge-cases', { body: { source_id, target_id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Zusammengeführt: ${data?.moved?.notes ?? 0} Notizen, ${data?.moved?.tasks ?? 0} Unteraufgaben, ${data?.moved?.chat ?? 0} Chatnachrichten übernommen.`);
      setPairs(ps => (ps ?? []).filter(x => x !== p));
    } catch (e: any) {
      toast.error(e?.message ?? 'Zusammenführen fehlgeschlagen');
    } finally {
      setMerging(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">MTIQ Duplikat-Scan</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analysiert offene Vorgänge mit MTIQ auf mögliche Duplikate. Kandidaten mit hoher Konfidenz können zusammengeführt werden.
            </p>
          </div>
          <Button onClick={runScan} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanne…</> : <><Search className="h-4 w-4 mr-2" /> Scan starten</>}
          </Button>
        </div>

        {meta && (
          <div className="text-xs text-muted-foreground">
            {meta.total_scanned ?? 0} offene Vorgänge gescannt · {meta.evaluated ?? 0} Kandidatenpaare bewertet · {pairs?.length ?? 0} mögliche Duplikate.
          </div>
        )}

        {pairs && pairs.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">Keine Duplikate mit ausreichender Konfidenz gefunden.</Card>
        )}

        <div className="space-y-3">
          {(pairs ?? []).map((p, i) => {
            const targetIsA = p.target === p.a.id;
            const busyKey = `${targetIsA ? p.b.id : p.a.id}-${targetIsA ? p.a.id : p.b.id}`;
            return (
              <Card key={i} className="p-4">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={p.confidence >= 0.8 ? 'destructive' : p.confidence >= 0.6 ? 'default' : 'secondary'}>
                      Konfidenz {(p.confidence * 100).toFixed(0)}%
                    </Badge>
                    <Badge variant="outline">Ähnlichkeit {(p.similarity * 100).toFixed(0)}%</Badge>
                    {p.signals.map((s, k) => <Badge key={k} variant="outline">{s}</Badge>)}
                  </div>
                </div>

                {p.reason && <div className="text-xs text-muted-foreground mb-3 italic">MTIQ: {p.reason}</div>}

                <div className="grid grid-cols-2 gap-3">
                  {[p.a, p.b].map((c, idx) => {
                    const isTarget = c.id === p.target;
                    return (
                      <div key={idx} className={`p-3 rounded border ${isTarget ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-mono">{c.case_no ?? c.id.slice(0, 8)}</div>
                          {isTarget && <Badge variant="default" className="text-[10px]">Zielvorschlag</Badge>}
                        </div>
                        <div className="text-sm font-medium truncate">{c.title ?? '—'}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.kunde ?? '—'} · {c.status}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">angelegt {new Date(c.created_at).toLocaleDateString('de-DE')}</div>
                        <Link to={`/cases/${c.id}`} target="_blank" className="text-xs text-primary inline-flex items-center gap-1 mt-2 hover:underline">
                          Öffnen <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button size="sm" variant="default" disabled={merging === busyKey} onClick={() => doMerge(p, true)}>
                    {merging === busyKey ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <GitMerge className="h-3 w-3 mr-2" />}
                    B <ArrowRight className="h-3 w-3 mx-1" /> A zusammenführen
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!merging} onClick={() => doMerge(p, false)}>
                    A <ArrowRight className="h-3 w-3 mx-1" /> B zusammenführen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPairs(ps => (ps ?? []).filter(x => x !== p))}>
                    Kein Duplikat
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
