import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Search, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type IssosOrder = {
  id: string;
  auf_nr: number;
  kd_nr: string | null;
  matchcode: string | null;
  ang_nr: string | null;
  bes_dat_1: string | null;
  bes_dat_2: string | null;
  pers_nr: string | null;
  lief_kunde: string | null;
  rabatt: number | null;
  vertr_nr: string | null;
  druck_text: string | null;
  zb: string | null;
  kz_preis: boolean | null;
  lb: string | null;
  company_id: string | null;
  companies?: { name: string | null } | null;
};

type IssosOrderPosition = {
  id: string;
  auf_nr: number;
  aufpos: number | null;
  termin: string | null;
  art_nr: string | null;
  art_kunde: string | null;
  besnr_kd: string | null;
  kz_erl_p: boolean | null;
  erl_dat: string | null;
  preis_fw: number | null;
  auf_menge: number | null;
  gel_menge: number | null;
  mat_art_text: string | null;
};

const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

type PosFilter = "alle" | "offen" | "teilerledigt" | "erledigt";

const posStatus = (p: IssosOrderPosition): Exclude<PosFilter, "alle"> => {
  const auf = p.auf_menge ?? 0;
  const gel = p.gel_menge ?? 0;
  if (p.kz_erl_p || (auf > 0 && gel >= auf)) return "erledigt";
  if (gel > 0) return "teilerledigt";
  return "offen";
};

const POS_FILTERS: { key: PosFilter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "offen", label: "Offen" },
  { key: "teilerledigt", label: "Teilerledigt" },
  { key: "erledigt", label: "Erledigt" },
];

export function IssosOrdersTab({ companyId, companyName }: { companyId?: string; companyName?: string }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<IssosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<number, IssosOrderPosition[]>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [posFilter, setPosFilter] = useState<PosFilter>("alle");

  const load = async () => {
    setLoading(true);
    const pageSize = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      let q: any = supabase
        .from("issos_orders" as any)
        .select("id, auf_nr, kd_nr, matchcode, ang_nr, bes_dat_1, bes_dat_2, pers_nr, lief_kunde, rabatt, vertr_nr, druck_text, zb, kz_preis, lb, company_id, companies(name)")
        .order("bes_dat_1", { ascending: false, nullsFirst: false })
        .order("auf_nr", { ascending: false })
        .range(from, from + pageSize - 1);
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
      if (from > 50000) break;
    }
    setRows(all);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const toggle = async (r: IssosOrder) => {
    if (expanded === r.id) { setExpanded(null); return; }
    setExpanded(r.id);
    if (!positions[r.auf_nr]) {
      const { data } = await (supabase
        .from("issos_order_positions" as any)
        .select("id, auf_nr, aufpos, termin, art_nr, art_kunde, besnr_kd, kz_erl_p, erl_dat, preis_fw, auf_menge, gel_menge, mat_art_text")
        .eq("auf_nr", r.auf_nr)
        .order("aufpos")) as any;
      setPositions((p) => ({ ...p, [r.auf_nr]: (data as IssosOrderPosition[]) || [] }));
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.auf_nr).includes(s) ||
      (r.matchcode || "").toLowerCase().includes(s) ||
      (r.kd_nr || "").includes(s) ||
      (r.companies?.name || "").toLowerCase().includes(s) ||
      (r.ang_nr || "").toLowerCase().includes(s) ||
      (r.vertr_nr || "").toLowerCase().includes(s)
    );
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche Auf-Nr, Kunde, Matchcode, Kd-Nr, Ang-Nr…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-md text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "Terminauftrag" : "Terminaufträge"}
        </div>
        {!companyId && (
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> ISSOS-Listen einspielen
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-8 p-2"></th>
              <th className="text-left p-2 font-medium">Auf-Nr</th>
              <th className="text-left p-2 font-medium">Bes-Dat</th>
              {!companyId && <th className="text-left p-2 font-medium">Kunde</th>}
              <th className="text-left p-2 font-medium">Matchcode</th>
              <th className="text-left p-2 font-medium">Ang-Nr</th>
              <th className="text-left p-2 font-medium">Vertr-Nr</th>
              <th className="text-left p-2 font-medium">LB</th>
              <th className="text-left p-2 font-medium">Druck</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                Keine Terminaufträge{companyName ? ` für ${companyName}` : ""}.
              </td></tr>
            ) : (
              filtered.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => toggle(r)}
                    className="border-t border-border/40 hover:bg-muted/20 cursor-pointer"
                  >
                    <td className="p-2 text-muted-foreground">
                      {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="p-2 font-mono text-xs">{r.auf_nr}</td>
                    <td className="p-2 tabular-nums">{r.bes_dat_1 || "—"}</td>
                    {!companyId && (
                      <td className="p-2">
                        {r.companies?.name || <span className="text-muted-foreground">Kd-{r.kd_nr || "?"}</span>}
                      </td>
                    )}
                    <td className="p-2 text-muted-foreground text-xs">{r.matchcode || "—"}</td>
                    <td className="p-2 font-mono text-xs">{r.ang_nr || "—"}</td>
                    <td className="p-2 text-xs">{r.vertr_nr || "—"}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.lb || "—"}</Badge></td>
                    <td className="p-2 text-xs text-muted-foreground">{r.druck_text || "—"}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-muted/10">
                      <td colSpan={9} className="p-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                          <Field label="Pers-Nr">{r.pers_nr || "—"}</Field>
                          <Field label="Lief-Kunde">{r.lief_kunde || "—"}</Field>
                          <Field label="Rabatt">{fmtNum(r.rabatt, 2)} %</Field>
                          <Field label="ZB">{r.zb || "—"}</Field>
                          <Field label="Bes-Dat 2">{r.bes_dat_2 || "—"}</Field>
                          <Field label="Kz-Preis">{r.kz_preis ? "Ja" : "—"}</Field>
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Positionen</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground">
                              <tr>
                                <th className="text-left p-2">#</th>
                                <th className="text-left p-2">Art-Nr</th>
                                <th className="text-left p-2">Art/Kunde</th>
                                <th className="text-left p-2">BesNr-Kd</th>
                                <th className="text-left p-2">Termin</th>
                                <th className="text-right p-2">Menge</th>
                                <th className="text-right p-2">Gel.</th>
                                <th className="text-right p-2">Preis FW</th>
                                <th className="text-left p-2">Mat-Art</th>
                                <th className="text-left p-2">Erl.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(positions[r.auf_nr] || []).length === 0 ? (
                                <tr><td colSpan={10} className="p-3 text-center text-muted-foreground">Keine Positionen</td></tr>
                              ) : positions[r.auf_nr].map((p) => (
                                <tr key={p.id} className="border-t border-border/30">
                                  <td className="p-2 tabular-nums">{p.aufpos ?? "—"}</td>
                                  <td className="p-2 font-mono">{p.art_nr || "—"}</td>
                                  <td className="p-2 font-mono text-muted-foreground">{p.art_kunde || "—"}</td>
                                  <td className="p-2 font-mono text-muted-foreground">{p.besnr_kd || "—"}</td>
                                  <td className="p-2 tabular-nums">{p.termin || "—"}</td>
                                  <td className="p-2 text-right tabular-nums">{fmtNum(p.auf_menge, 0)}</td>
                                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtNum(p.gel_menge, 0)}</td>
                                  <td className="p-2 text-right tabular-nums">{fmtNum(p.preis_fw, 2)}</td>
                                  <td className="p-2 text-muted-foreground">{p.mat_art_text || "—"}</td>
                                  <td className="p-2">{p.kz_erl_p ? <Badge variant="secondary" className="text-[9px]">erledigt</Badge> : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <IssosOrdersImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} token={session?.access_token} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function IssosOrdersImportDialog({ open, onClose, onDone, token }: { open: boolean; onClose: () => void; onDone: () => void; token?: string }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList) => {
    if (!files.length) return;
    if (!token) { toast.error("Nicht angemeldet"); return; }
    setBusy(true);
    setLog([]);
    // Reihenfolge: zuerst Aufträge (Header), dann Positionen
    const list = Array.from(files).sort((a, b) => {
      const ax = /pos/i.test(a.name) ? 1 : 0;
      const bx = /pos/i.test(b.name) ? 1 : 0;
      return ax - bx;
    });
    for (const f of list) {
      setLog((l) => [...l, `→ ${f.name}…`]);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const resp = await fetch(
          `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/import-issos-orders`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }
        );
        const json = await resp.json();
        if (!resp.ok) setLog((l) => [...l, `  ✗ ${json.error || resp.statusText}`]);
        else setLog((l) => [...l, `  ✓ ${json.kind}: ${json.inserted}/${json.rows_total} (${json.unmatched} ohne Kunden, ${json.errors} Fehler)`]);
      } catch (e: any) {
        setLog((l) => [...l, `  ✗ ${e.message}`]);
      }
    }
    setBusy(false);
    toast.success("Import abgeschlossen");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> ISSOS Terminaufträge einspielen</DialogTitle>
          <DialogDescription className="text-xs">
            Akzeptiert „Terminauftrag_Aufträge" (Header) und „Terminauftrag_Auftragspositionen" (Positionen).
            Dateityp wird automatisch erkannt. Aufträge werden anhand der Auf-Nr aktualisiert; Positionen pro Auftrag ersetzt.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files) upload(e.dataTransfer.files); }}
          onClick={() => ref.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm">Dateien hierher ziehen oder klicken</div>
          <div className="text-xs text-muted-foreground mt-1">.xlsx, mehrere Dateien gleichzeitig möglich</div>
          <input ref={ref} type="file" multiple accept=".xlsx" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
        {(busy || log.length > 0) && (
          <div className="rounded border border-border/40 bg-muted/20 p-3 font-mono text-xs space-y-1 max-h-60 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
            {busy && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> arbeite…</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
