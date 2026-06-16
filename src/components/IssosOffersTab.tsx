import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, ChevronDown } from "lucide-react";

type IssosOffer = {
  id: string;
  ang_nr: number;
  kd_nr: string | null;
  matchcode: string | null;
  ang_stat: string | null;
  ang_stat_text: string | null;
  betreff1: string | null;
  betreff2: string | null;
  vorl_datum: string | null;
  fristdat: string | null;
  pers_nr: string | null;
  rabatt: number | null;
  druck_kz_text: string | null;
  druck_dat: string | null;
  projekt_nr: string | null;
  company_id: string | null;
  companies?: { name: string | null } | null;
};

type Position = {
  id: string; ang_nr: number; ang_pos: number | null; art_nr: string | null;
  bezeich_1: string | null; ang_menge: number | null; me: string | null;
  netto_gw: number | null; preis_fw: number | null; waehrung: string | null;
  marge: number | null; marge_v: number | null;
};

export function IssosOffersTab({ companyId, companyName }: { companyId?: string; companyName?: string }) {
  const [rows, setRows] = useState<IssosOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<number, Position[]>>({});

  const load = async () => {
    setLoading(true);
    const pageSize = 1000;
    let all: any[] = []; let from = 0;
    while (true) {
      let q: any = supabase
        .from("issos_offers" as any)
        .select("id, ang_nr, kd_nr, matchcode, ang_stat, ang_stat_text, betreff1, betreff2, vorl_datum, fristdat, pers_nr, rabatt, druck_kz_text, druck_dat, projekt_nr, company_id, companies(name)")
        .order("vorl_datum", { ascending: false, nullsFirst: false })
        .order("ang_nr", { ascending: false })
        .range(from, from + pageSize - 1);
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize; if (from > 50000) break;
    }
    setRows(all);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]);

  const loadPositions = async (angNr: number) => {
    if (positions[angNr]) return;
    const { data } = await supabase
      .from("issos_offer_positions" as any)
      .select("id, ang_nr, ang_pos, art_nr, bezeich_1, ang_menge, me, netto_gw, preis_fw, waehrung, marge, marge_v")
      .eq("ang_nr", angNr).order("ang_pos");
    setPositions((p) => ({ ...p, [angNr]: (data as any) || [] }));
  };

  const toggle = (r: IssosOffer) => {
    const next = expanded === r.id ? null : r.id;
    setExpanded(next);
    if (next) loadPositions(r.ang_nr);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.ang_nr).includes(s) ||
      (r.matchcode || "").toLowerCase().includes(s) ||
      (r.kd_nr || "").includes(s) ||
      (r.companies?.name || "").toLowerCase().includes(s) ||
      (r.betreff1 || "").toLowerCase().includes(s) ||
      (r.betreff2 || "").toLowerCase().includes(s)
    );
  }, [rows, search]);

  const totalNetto = useMemo(() => {
    let sum = 0;
    for (const r of filtered) {
      const ps = positions[r.ang_nr]; if (!ps) continue;
      for (const p of ps) if (p.netto_gw) sum += Number(p.netto_gw);
    }
    return sum;
  }, [filtered, positions]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche Ang-Nr, Kunde, Matchcode, Betreff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-md text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "Angebot" : "Angebote"}
          {totalNetto > 0 && ` · Netto Σ (geladen) ${totalNetto.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="w-8 p-2"></th>
              <th className="text-left p-2 font-medium">Ang-Nr</th>
              <th className="text-left p-2 font-medium">Datum</th>
              <th className="text-left p-2 font-medium">Frist</th>
              {!companyId && <th className="text-left p-2 font-medium">Kunde</th>}
              <th className="text-left p-2 font-medium">Betreff</th>
              <th className="text-left p-2 font-medium">Status</th>
              <th className="text-left p-2 font-medium">Pers-Nr</th>
              <th className="text-left p-2 font-medium">Projekt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                Keine Angebote{companyName ? ` für ${companyName}` : ""}.
              </td></tr>
            ) : (
              filtered.map((r) => {
                const ps = positions[r.ang_nr];
                const sum = ps ? ps.reduce((a, p) => a + (Number(p.netto_gw) || 0), 0) : null;
                return (
                  <>
                    <tr key={r.id} onClick={() => toggle(r)} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer">
                      <td className="p-2 text-muted-foreground">{expanded === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                      <td className="p-2 font-mono text-xs">{r.ang_nr}</td>
                      <td className="p-2 tabular-nums">{r.vorl_datum || "—"}</td>
                      <td className="p-2 tabular-nums text-xs">{r.fristdat || "—"}</td>
                      {!companyId && (
                        <td className="p-2">{r.companies?.name || <span className="text-muted-foreground">{r.matchcode || `Kd-${r.kd_nr || "?"}`}</span>}</td>
                      )}
                      <td className="p-2 truncate max-w-[360px]" title={[r.betreff1, r.betreff2].filter(Boolean).join(" · ")}>{r.betreff1 || "—"}</td>
                      <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.ang_stat_text || r.ang_stat || "—"}</Badge></td>
                      <td className="p-2 text-xs">{r.pers_nr || "—"}</td>
                      <td className="p-2 text-xs">{r.projekt_nr || "—"}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-3">
                          {!ps ? (
                            <div className="text-xs text-muted-foreground">Lade Positionen…</div>
                          ) : ps.length === 0 ? (
                            <div className="text-xs text-muted-foreground">Keine Positionen</div>
                          ) : (
                            <Card className="overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                                  <tr>
                                    <th className="text-left p-2">Pos</th>
                                    <th className="text-left p-2">Art.-Nr</th>
                                    <th className="text-left p-2">Bezeichnung</th>
                                    <th className="text-right p-2">Menge</th>
                                    <th className="text-right p-2">Preis</th>
                                    <th className="text-right p-2">Netto GW</th>
                                    <th className="text-right p-2">Marge %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ps.map((p) => (
                                    <tr key={p.id} className="border-t border-border/40">
                                      <td className="p-2 tabular-nums">{p.ang_pos}</td>
                                      <td className="p-2 font-mono">{p.art_nr || "—"}</td>
                                      <td className="p-2">{p.bezeich_1 || "—"}</td>
                                      <td className="p-2 text-right tabular-nums">{p.ang_menge ?? "—"} {p.me || ""}</td>
                                      <td className="p-2 text-right tabular-nums">{p.preis_fw != null ? `${Number(p.preis_fw).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.waehrung || ""}` : "—"}</td>
                                      <td className="p-2 text-right tabular-nums">{p.netto_gw != null ? Number(p.netto_gw).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                                      <td className="p-2 text-right tabular-nums">{p.marge_v != null ? `${Number(p.marge_v).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : "—"}</td>
                                    </tr>
                                  ))}
                                  {sum !== null && (
                                    <tr className="border-t border-border/40 bg-muted/30 font-medium">
                                      <td colSpan={5} className="p-2 text-right">Summe</td>
                                      <td className="p-2 text-right tabular-nums">{sum.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      <td></td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </Card>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
