import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Lock, Search, AlertTriangle, Loader2 } from 'lucide-react';

type Stock = {
  id: string;
  art_nr: string;
  lager: string;
  lagerpl: string;
  behaelter: string;
  charge_nr: string;
  bestand: number;
  me: string | null;
  note: string | null;
};

type Sperr = { id: string; lager: string; lagerpl: string; behaelter: string };

export default function AdminSperrlager() {
  const [rows, setRows] = useState<Stock[]>([]);
  const [sperrRows, setSperrRows] = useState<Stock[]>([]);
  const [sperrLocs, setSperrLocs] = useState<Sperr[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Stock | null>(null);
  const [qty, setQty] = useState<string>('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: stocks }, { data: locs }] = await Promise.all([
      (supabase as any).from('article_stock_locations').select('id,art_nr,lager,lagerpl,behaelter,charge_nr,bestand,me,note').gt('bestand', 0).order('art_nr').limit(2000),
      (supabase as any).from('storage_locations').select('id,lager,lagerpl,behaelter').eq('is_blocked', true).order('lager'),
    ]);
    const sperrCodes = new Set((locs ?? []).map((l: Sperr) => `${l.lager}|${l.lagerpl}|${l.behaelter}`));
    const all = (stocks ?? []) as Stock[];
    setRows(all.filter(r => !sperrCodes.has(`${r.lager}|${r.lagerpl}|${r.behaelter}`)));
    setSperrRows(all.filter(r => sperrCodes.has(`${r.lager}|${r.lagerpl}|${r.behaelter}`)));
    setSperrLocs((locs ?? []) as Sperr[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r =>
      r.art_nr.toLowerCase().includes(t) ||
      r.charge_nr?.toLowerCase().includes(t) ||
      r.lager.toLowerCase().includes(t) ||
      r.lagerpl.toLowerCase().includes(t)
    );
  }, [rows, q]);

  const openBook = (r: Stock) => {
    setSel(r);
    setQty(String(r.bestand));
    setReason('');
    setTarget(sperrLocs[0]?.id ?? '');
  };

  const submit = async () => {
    if (!sel) return;
    const n = Number(qty);
    if (!isFinite(n) || n <= 0 || n > Number(sel.bestand)) {
      toast.error('Ungültige Menge');
      return;
    }
    if (!reason.trim()) { toast.error('Grund ist erforderlich'); return; }
    setBusy(true);
    const { data, error } = await (supabase as any).rpc('book_to_sperrlager', {
      _stock_location_id: sel.id,
      _qty: n,
      _reason: reason.trim(),
      _sperr_location_id: target || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Gesperrt: ${data?.qty} ${sel.me ?? 'Stk'} → ${data?.sperr_location} (${data?.notified_users ?? 0} Benachrichtigungen)`);
    setSel(null);
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Lock className="h-5 w-5" /> Sperrlager
            </h1>
            <p className="text-sm text-muted-foreground">
              Statusumbuchung: Bestand auf 0 setzen und in Sperrlager überführen. Einkauf + Konstruktion werden automatisch benachrichtigt.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Artikel / Charge / Lager…" className="pl-8 w-72" />
            </div>
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b bg-muted/30">Bestand (sperrbar)</div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Lade…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Keine Bestände gefunden.</div>
          ) : (
            <div className="overflow-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Art-Nr</th>
                    <th className="text-left px-3 py-2">Lager</th>
                    <th className="text-left px-3 py-2">Charge</th>
                    <th className="text-right px-3 py-2">Bestand</th>
                    <th className="text-right px-3 py-2 w-32">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-mono">{r.art_nr}</td>
                      <td className="px-3 py-1.5">{r.lager} / {r.lagerpl}{r.behaelter && r.behaelter !== '0' ? ` / ${r.behaelter}` : ''}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.charge_nr || '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.bestand).toLocaleString('de-DE')} {r.me ?? ''}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => openBook(r)}>
                          <Lock className="h-3.5 w-3.5 mr-1" /> Sperren
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border rounded-lg">
          <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b bg-muted/30 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> Gesperrter Bestand
          </div>
          {sperrRows.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Aktuell kein gesperrter Bestand.</div>
          ) : (
            <div className="overflow-auto max-h-[40vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Art-Nr</th>
                    <th className="text-left px-3 py-2">Sperrlager</th>
                    <th className="text-left px-3 py-2">Charge</th>
                    <th className="text-right px-3 py-2">Menge</th>
                    <th className="text-left px-3 py-2">Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  {sperrRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{r.art_nr}</td>
                      <td className="px-3 py-1.5">{r.lager} / {r.lagerpl}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.charge_nr || '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.bestand).toLocaleString('de-DE')} {r.me ?? ''}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-pre-line max-w-md truncate">{r.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Sperrbuchung</DialogTitle>
            <DialogDescription>
              {sel ? `${sel.art_nr} · ${sel.lager}/${sel.lagerpl} · Bestand ${Number(sel.bestand).toLocaleString('de-DE')} ${sel.me ?? ''}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Menge</Label>
              <div className="flex gap-2">
                <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Button variant="outline" type="button" onClick={() => setQty(String(sel?.bestand ?? 0))}>Alles (Bestand → 0)</Button>
              </div>
            </div>
            <div>
              <Label>Zielsperrlager</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue placeholder="Sperrlager wählen" /></SelectTrigger>
                <SelectContent>
                  {sperrLocs.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.lager} / {l.lagerpl}{l.behaelter && l.behaelter !== '0' ? ` / ${l.behaelter}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grund <span className="text-destructive">*</span></Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Reklamation Charge, Qualitätsprüfung, Lieferantensperre…" rows={3} />
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 text-xs p-2 flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Einkauf und Konstruktion werden automatisch per Benachrichtigung informiert.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSel(null)} disabled={busy}>Abbrechen</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              Sperren & Benachrichtigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
