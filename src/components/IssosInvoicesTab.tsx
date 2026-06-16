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

type IssosInvoice = {
  id: string;
  rech_nr: number;
  belegart: string | null;
  belegart_text: string | null;
  r_kd_nr: string | null;
  matchcode: string | null;
  rech_dat: string | null;
  netto_fw: number | null;
  brutto_fw: number | null;
  waehrung: string | null;
  storno_kz: boolean | null;
  company_id: string | null;
  companies?: { name: string | null } | null;
};

type IssosPosition = {
  id: string; nummer: number | null; art_nr: string | null; bezeich1: string | null;
  menge: number | null; preis_fw: number | null; netto_fw: number | null; waehrung: string | null;
  marge: number | null; mwst_satz: number | null;
};

type IssosExtra = {
  id: string; zusatzpos: string | null; bezeich: string | null;
  nettow_fw: number | null; menge: number | null; waehrung: string | null;
};

const FILE_KIND_LABEL: Record<string, string> = {
  invoices: "Rechnungen",
  positions_all: "Alle Positionen",
  positions_re: "RE-Positionen",
  extras: "Zusatzkosten",
};

export function IssosInvoicesTab({ companyId, companyName }: { companyId?: string; companyName?: string }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<IssosInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [positions, setPositions] = useState<IssosPosition[]>([]);
  const [extras, setExtras] = useState<IssosExtra[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const pageSize = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      let q: any = supabase
        .from("issos_invoices" as any)
        .select("id, rech_nr, belegart, belegart_text, r_kd_nr, matchcode, rech_dat, netto_fw, brutto_fw, waehrung, storno_kz, company_id, companies(name)")
        .order("rech_dat", { ascending: false })
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

  const expand = async (inv: IssosInvoice) => {
    if (expanded === inv.id) { setExpanded(null); return; }
    setExpanded(inv.id);
    const [{ data: pos }, { data: ext }] = await Promise.all([
      supabase.from("issos_invoice_positions" as any).select("*").eq("invoice_id", inv.id).order("nummer"),
      supabase.from("issos_invoice_extras" as any).select("*").eq("invoice_id", inv.id).order("nummer"),
    ]);
    setPositions((pos as any) || []);
    setExtras((ext as any) || []);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.rech_nr).includes(s) ||
      (r.matchcode || "").toLowerCase().includes(s) ||
      (r.r_kd_nr || "").includes(s) ||
      (r.companies?.name || "").toLowerCase().includes(s)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((s, r) => s + (Number(r.netto_fw) || 0), 0);
    return { count: filtered.length, sum };
  }, [filtered]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche Rech-Nr, Kunde, Matchcode, Kd-Nr…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-md text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {totals.count} Rechnungen · Netto Σ {totals.sum.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
        </div>
        {!companyId && (
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> ISSOS-Listen einspielen
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
       <div className="max-h-[calc(100vh-280px)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground sticky top-0 z-10">
            <tr>
              <th className="w-8 p-2 bg-muted/30"></th>
              <th className="text-left p-2 font-medium bg-muted/30">Rech-Nr</th>
              <th className="text-left p-2 font-medium bg-muted/30">Belegart</th>
              <th className="text-left p-2 font-medium bg-muted/30">Datum</th>
              {!companyId && <th className="text-left p-2 font-medium bg-muted/30">Kunde</th>}
              <th className="text-left p-2 font-medium bg-muted/30">Matchcode</th>
              <th className="text-right p-2 font-medium bg-muted/30">Netto</th>
              <th className="text-right p-2 font-medium bg-muted/30">Brutto</th>
              <th className="text-left p-2 font-medium bg-muted/30">Whg</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                Keine Rechnungen{companyName ? ` für ${companyName}` : ""}.
              </td></tr>
            ) : (
              filtered.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => expand(r)}
                    className={`border-t border-border/40 hover:bg-muted/20 cursor-pointer ${r.storno_kz ? "opacity-60" : ""}`}
                  >
                    <td className="p-2 text-muted-foreground">
                      {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="p-2 font-mono text-xs">{r.rech_nr}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px]">{r.belegart_text || r.belegart || "—"}</Badge>
                    </td>
                    <td className="p-2 tabular-nums">{r.rech_dat || "—"}</td>
                    {!companyId && (
                      <td className="p-2">
                        {r.companies?.name || <span className="text-muted-foreground">Kd-{r.r_kd_nr || "?"}</span>}
                      </td>
                    )}
                    <td className="p-2 text-muted-foreground text-xs">{r.matchcode || "—"}</td>
                    <td className="p-2 text-right tabular-nums">{r.netto_fw != null ? Number(r.netto_fw).toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{r.brutto_fw != null ? Number(r.brutto_fw).toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "—"}</td>
                    <td className="p-2 text-xs">{r.waehrung || "—"}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-muted/10">
                      <td colSpan={9} className="p-3 space-y-3">
                        <div>
                          <div className="text-[11px] uppercase text-muted-foreground mb-1">Positionen ({positions.length})</div>
                          <div className="overflow-x-auto rounded border border-border/40">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                                <tr>
                                  <th className="text-left p-1.5">Pos</th>
                                  <th className="text-left p-1.5">Art-Nr</th>
                                  <th className="text-left p-1.5">Bezeichnung</th>
                                  <th className="text-right p-1.5">Menge</th>
                                  <th className="text-right p-1.5">Preis</th>
                                  <th className="text-right p-1.5">Netto</th>
                                  <th className="text-right p-1.5">Marge</th>
                                </tr>
                              </thead>
                              <tbody>
                                {positions.length === 0 ? (
                                  <tr><td colSpan={7} className="p-2 text-center text-muted-foreground">Keine Positionen</td></tr>
                                ) : positions.map((p) => (
                                  <tr key={p.id} className="border-t border-border/30">
                                    <td className="p-1.5 tabular-nums">{p.nummer}</td>
                                    <td className="p-1.5 font-mono text-[10px]">{p.art_nr || "—"}</td>
                                    <td className="p-1.5">{p.bezeich1 || "—"}</td>
                                    <td className="p-1.5 text-right tabular-nums">{p.menge != null ? Number(p.menge).toLocaleString("de-DE") : "—"}</td>
                                    <td className="p-1.5 text-right tabular-nums">{p.preis_fw != null ? Number(p.preis_fw).toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "—"}</td>
                                    <td className="p-1.5 text-right tabular-nums">{p.netto_fw != null ? Number(p.netto_fw).toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "—"}</td>
                                    <td className="p-1.5 text-right tabular-nums text-muted-foreground">{p.marge != null ? Number(p.marge).toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        {extras.length > 0 && (
                          <div>
                            <div className="text-[11px] uppercase text-muted-foreground mb-1">Zusatzkosten ({extras.length})</div>
                            <div className="overflow-x-auto rounded border border-border/40">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                                  <tr>
                                    <th className="text-left p-1.5">Pos</th>
                                    <th className="text-left p-1.5">Bezeichnung</th>
                                    <th className="text-right p-1.5">Menge</th>
                                    <th className="text-right p-1.5">Netto</th>
                                    <th className="text-left p-1.5">Whg</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {extras.map((x) => (
                                    <tr key={x.id} className="border-t border-border/30">
                                      <td className="p-1.5">{x.zusatzpos}</td>
                                      <td className="p-1.5">{x.bezeich || "—"}</td>
                                      <td className="p-1.5 text-right tabular-nums">{x.menge != null ? Number(x.menge).toLocaleString("de-DE") : "—"}</td>
                                      <td className="p-1.5 text-right tabular-nums">{x.nettow_fw != null ? Number(x.nettow_fw).toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "—"}</td>
                                      <td className="p-1.5">{x.waehrung || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <IssosImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} token={session?.access_token} />
    </div>
  );
}

function IssosImportDialog({ open, onClose, onDone, token }: { open: boolean; onClose: () => void; onDone: () => void; token?: string }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList) => {
    if (!files.length) return;
    if (!token) { toast.error("Nicht angemeldet"); return; }
    setBusy(true);
    setLog([]);
    // Sort: invoices first, then positions, then extras (FK order)
    const sorted = Array.from(files).sort((a, b) => {
      const order = (n: string) => n.toLowerCase().includes("zusatz") ? 3 : n.toLowerCase().includes("position") ? 2 : 1;
      return order(a.name) - order(b.name);
    });
    for (const f of sorted) {
      setLog((l) => [...l, `→ ${f.name}…`]);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const resp = await fetch(
          `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/import-issos-invoices`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }
        );
        const json = await resp.json();
        if (!resp.ok) {
          setLog((l) => [...l, `  ✗ ${json.error || resp.statusText}`]);
        } else {
          setLog((l) => [...l, `  ✓ ${FILE_KIND_LABEL[json.kind] || json.kind}: ${json.inserted}/${json.rows_total} (${json.unmatched} ohne Kunden, ${json.errors} Fehler)`]);
        }
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
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> ISSOS-Listen einspielen</DialogTitle>
          <DialogDescription className="text-xs">
            Erwartet bis zu 4 Excel-Dateien aus ISSOS: Rechnungen, RE-Positionen, Alle Positionen, Zusatzkosten.
            Reihenfolge wird automatisch erkannt. Bestehende Datensätze werden anhand der Rech-Nr ersetzt.
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
          <input
            ref={ref}
            type="file"
            multiple
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
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
