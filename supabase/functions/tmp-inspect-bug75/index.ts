import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const stripCol = (s: string) => String(s ?? "").replace(/^☰\s*/, "").replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
const num = (v: any) => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const int = (v: any) => { const n = num(v); return n === null ? null : Math.trunc(n); };
const str = (v: any) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === "" ? null : s; };
const bool = (v: any) => { if (v === null || v === undefined || v === "") return null; if (typeof v === "boolean") return v; const s = String(v).toLowerCase().trim(); return s === "true" || s === "1" || s === "ja" || s === "yes"; };
const excelDate = (v: any): string | null => { if (v === null || v === undefined || v === "") return null; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString().slice(0, 10); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const excelTs = (v: any): string | null => { if (v === null || v === undefined || v === "") return null; if (v instanceof Date) return v.toISOString(); if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString(); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const which = url.searchParams.get("f") || "ls";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: comps } = await supabase.from("companies").select("id, customer_no, name").not("customer_no", "is", null);
  const byNo = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of comps ?? []) {
    if (c.customer_no) byNo.set(String(c.customer_no).trim(), c.id);
    if (c.name) byName.set(c.name.toLowerCase().trim(), c.id);
  }
  const matchCompany = (kdnr: any, mc: any): string | null => {
    const k = str(kdnr);
    if (k) { const m = byNo.get(k) ?? byNo.get(k.padStart(5, "0")); if (m) return m; }
    const m2 = str(mc);
    if (m2) return byName.get(m2.toLowerCase()) ?? null;
    return null;
  };

  const path = which === "ls"
    ? "tickets/c1d0afdc-c9ed-4df8-80c6-307825714ce1/1781632455229_Lieferscheine_20260616.xlsx"
    : "tickets/c1d0afdc-c9ed-4df8-80c6-307825714ce1/1781632455565_Angebotspositionen_20260616.xlsx";

  const { data: blob, error: dlErr } = await supabase.storage.from("support-attachments").download(path);
  if (dlErr || !blob) return new Response(JSON.stringify({ error: dlErr?.message }), { status: 500 });
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array", cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: null });
  const get = (r: any, c: string) => { for (const k of Object.keys(r)) if (stripCol(k) === c) return r[k]; return null; };

  const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
  let inserted = 0, unmatched = 0, errors = 0;
  const errLog: any[] = [];

  if (which === "ls") {
    const mapped = rows.map((r) => {
      const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
      if (!company_id) unmatched++;
      return {
        ls_nr: int(get(r, "LS-Nr")), kd_nr: str(get(r, "Kd-Nr")), matchcode: str(get(r, "Matchcode")),
        ls_datum: excelDate(get(r, "LS-Datum")), druck_kz: int(get(r, "Druck-Kz")),
        druck_text: str(get(r, "[ Druck-Kz ]")), druck_dat: excelTs(get(r, "Druckdat.")),
        buch_kz: int(get(r, "Buch-Kz")), buch_text: str(get(r, "[ Buch-Kz ]")),
        kz_erl: bool(get(r, "Kz-Erl")), lb: str(get(r, "LB")), va: str(get(r, "VA")), vp: str(get(r, "VP")),
        packstuecke: num(get(r, "Packstücke")), brutto_gew: num(get(r, "Brutto-Gew")), netto_gew: num(get(r, "Netto-Gew")),
        pers_nr: str(get(r, "Pers-Nr")), lieferadr: int(get(r, "Lieferadr")), auf_nr_la: int(get(r, "Auf-Nr LA")),
        name1: str(get(r, "Name 1")), strasse: str(get(r, "Strasse")), land: str(get(r, "Land")),
        plz: str(get(r, "PLZ")), ort: str(get(r, "Ort")), sprache: str(get(r, "Sprache")),
        sprache_text: str(get(r, "[ Sprache  ]")), kz_konsi: bool(get(r, "Kz-Konsi")), kz_kons_ab: bool(get(r, "Kz.Kons-AB")),
        company_id,
      };
    }).filter((r) => r.ls_nr !== null);
    for (const batch of chunk(mapped, 500)) {
      const { error, count } = await supabase.from("issos_deliveries").upsert(batch, { onConflict: "ls_nr", count: "exact" });
      if (error) { errors += batch.length; errLog.push(error.message); } else inserted += count ?? batch.length;
    }
    return new Response(JSON.stringify({ kind: "deliveries", total: rows.length, inserted, unmatched, errors, errLog }), { headers: { "Content-Type": "application/json" } });
  } else {
    const mapped = rows.map((r) => {
      const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
      if (!company_id) unmatched++;
      return {
        ang_nr: int(get(r, "Ang-Nr")), ang_pos: int(get(r, "Ang-pos")),
        kd_nr: str(get(r, "Kd-Nr")), matchcode: str(get(r, "Matchcode")),
        int_nr: str(get(r, "Int-Nr")), matchcode_1: str(get(r, "Matchcode_1")),
        a_status: str(get(r, "A-Status")), a_status_text: str(get(r, "Stat. Ang.Pos")),
        art_nr: str(get(r, "Art.-Nr")), art_matchcode: str(get(r, "Matchcode")),
        bezeich_1: str(get(r, "Bezeich 1")), art_kunde: str(get(r, "Art/Kunde")),
        ang_menge: num(get(r, "Ang-Menge")), me: str(get(r, "ME")),
        netto_gw: num(get(r, "Netto GW")), preis_fw: num(get(r, "Preis FW")),
        waehrung: str(get(r, "Währung")), kz_preis: bool(get(r, "Kz-Preis")),
        pe: num(get(r, "PE")), ang_datum: excelDate(get(r, "Ang-Datum")),
        kurs: num(get(r, "Kurs")), rabatt_pos: num(get(r, "Rabatt-Pos")),
        mat_art: str(get(r, "Mat-art")), mat_art_text: str(get(r, "Materialart")),
        kosten: num(get(r, "Kosten")), kostenherk: str(get(r, "Kostenherk")),
        bewertungspreis: num(get(r, "Bewertungspreis")), kosten_1: num(get(r, "Kosten_1")),
        marge: num(get(r, "Marge")), marge_v: num(get(r, "Marge %(V)")), marge_e: num(get(r, "Marge %(E)")),
        company_id,
      };
    }).filter((r) => r.ang_nr !== null);
    await supabase.from("issos_offer_positions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    for (const batch of chunk(mapped, 500)) {
      const { error, count } = await supabase.from("issos_offer_positions").insert(batch, { count: "exact" });
      if (error) { errors += batch.length; errLog.push(error.message); } else inserted += count ?? batch.length;
    }
    return new Response(JSON.stringify({ kind: "offer_positions", total: rows.length, inserted, unmatched, errors, errLog }), { headers: { "Content-Type": "application/json" } });
  }
});
