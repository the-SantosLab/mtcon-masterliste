import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Search, ChevronRight, ChevronDown, Loader2, Truck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type IssosDelivery = {
  id: string;
  ls_nr: number;
  kd_nr: string | null;
  matchcode: string | null;
  ls_datum: string | null;
  buch_text: string | null;
  druck_text: string | null;
  druck_dat: string | null;
  packstuecke: number | null;
  brutto_gew: number | null;
  netto_gew: number | null;
  pers_nr: string | null;
  name1: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  sprache_text: string | null;
  kz_erl: boolean | null;
  kz_konsi: boolean | null;
  lb: string | null;
  company_id: string | null;
  companies?: { name: string | null } | null;
};

export function IssosDeliveriesTab({ companyId, companyName }: { companyId?: string; companyName?: string }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<IssosDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const pageSize = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      let q: any = supabase
        .from("issos_deliveries" as any)
        .select("id, ls_nr, kd_nr, matchcode, ls_datum, buch_text, druck_text, druck_dat, packstuecke, brutto_gew, netto_gew, pers_nr, name1, strasse, plz, ort, land, sprache_text, kz_erl, kz_konsi, lb, company_id, companies(name)")
        .order("ls_datum", { ascending: false, nullsFirst: false })
        .order("ls_nr", { ascending: false })
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

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.ls_nr).includes(s) ||
      (r.matchcode || "").toLowerCase().includes(s) ||
      (r.kd_nr || "").includes(s) ||
      (r.companies?.name || "").toLowerCase().includes(s) ||
      (r.name1 || "").toLowerCase().includes(s) ||
      (r.ort || "").toLowerCase().includes(s)
    );
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche LS-Nr, Kunde, Matchcode, Kd-Nr, Ort…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-md text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "Lieferschein" : "Lieferscheine"}
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
              <th className="text-left p-2 font-medium">LS-Nr</th>
              <th className="text-left p-2 font-medium">Datum</th>
              {!companyId && <th className="text-left p-2 font-medium">Kunde</th>}
              <th className="text-left p-2 font-medium">Matchcode</th>
              <th className="text-left p-2 font-medium">Ort</th>
              <th className="text-left p-2 font-medium">LB</th>
              <th className="text-right p-2 font-medium">Pkst</th>
              <th className="text-left p-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                Keine Lieferscheine{companyName ? ` für ${companyName}` : ""}.
              </td></tr>
            ) : (
              filtered.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="border-t border-border/40 hover:bg-muted/20 cursor-pointer"
                  >
                    <td className="p-2 text-muted-foreground">
                      {expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="p-2 font-mono text-xs">{r.ls_nr}</td>
                    <td className="p-2 tabular-nums">{r.ls_datum || "—"}</td>
                    {!companyId && (
                      <td className="p-2">
                        {r.companies?.name || r.name1 || <span className="text-muted-foreground">Kd-{r.kd_nr || "?"}</span>}
                      </td>
                    )}
                    <td className="p-2 text-muted-foreground text-xs">{r.matchcode || "—"}</td>
                    <td className="p-2 text-xs">{r.ort || "—"}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.lb || "—"}</Badge></td>
                    <td className="p-2 text-right tabular-nums">{r.packstuecke ?? "—"}</td>
                    <td className="p-2">
                      <div className="flex gap-1 flex-wrap">
                        {r.kz_erl && <Badge variant="secondary" className="text-[9px]">erledigt</Badge>}
                        {r.kz_konsi && <Badge variant="outline" className="text-[9px]">Konsi</Badge>}
                        {r.buch_text && <Badge variant="outline" className="text-[9px]">{r.buch_text}</Badge>}
                      </div>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-muted/10">
                      <td colSpan={9} className="p-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <Field label="Empfänger">{r.name1 || "—"}</Field>
                          <Field label="Adresse">{[r.strasse, [r.plz, r.ort].filter(Boolean).join(" "), r.land].filter(Boolean).join(", ") || "—"}</Field>
                          <Field label="Pers-Nr">{r.pers_nr || "—"}</Field>
                          <Field label="Sprache">{r.sprache_text || "—"}</Field>
                          <Field label="Druck">{r.druck_text || "—"}{r.druck_dat ? ` · ${new Date(r.druck_dat).toLocaleString("de-DE")}` : ""}</Field>
                          <Field label="Buchung">{r.buch_text || "—"}</Field>
                          <Field label="Gewicht">{r.netto_gew != null ? `${Number(r.netto_gew).toLocaleString("de-DE")} kg netto` : "—"}{r.brutto_gew ? ` / ${Number(r.brutto_gew).toLocaleString("de-DE")} kg brutto` : ""}</Field>
                          <Field label="Packstücke">{r.packstuecke ?? "—"}</Field>
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

      <IssosDeliveriesImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} token={session?.access_token} />
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

function IssosDeliveriesImportDialog({ open, onClose, onDone, token }: { open: boolean; onClose: () => void; onDone: () => void; token?: string }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList) => {
    if (!files.length) return;
    if (!token) { toast.error("Nicht angemeldet"); return; }
    setBusy(true);
    setLog([]);
    for (const f of Array.from(files)) {
      setLog((l) => [...l, `→ ${f.name}…`]);
      const fd = new FormData();
      fd.append("file", f);
      try {
        const resp = await fetch(
          `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/import-issos-deliveries`,
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
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> ISSOS Lieferscheine / Angebotspositionen einspielen</DialogTitle>
          <DialogDescription className="text-xs">
            Akzeptiert die ISSOS-Excels „Lieferscheine" und „Angebotspositionen". Dateityp wird automatisch erkannt.
            Lieferscheine werden anhand der LS-Nr ersetzt; Angebotspositionen werden komplett ersetzt.
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
