import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const stripCol = (s: string) => String(s ?? "").replace(/^☰\s*/, "").replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
const num = (v: any) => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const int = (v: any) => { const n = num(v); return n === null ? null : Math.trunc(n); };
const str = (v: any) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === "" ? null : s; };
const bool = (v: any) => { if (v === null || v === undefined || v === "") return null; if (typeof v === "boolean") return v; const s = String(v).toLowerCase().trim(); return s === "true" || s === "1" || s === "ja" || s === "yes"; };
const excelDate = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString().slice(0, 10); }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const base = "tickets/6a002e3a-0fe5-4251-9fad-6777598f5a13/";
  const ordersPath = base + "1781651970350_Terminauftrag_Auftraege_20260617.xlsx";
  const posPath = base + "1781651970588_Terminauftrag_Auftragspositionen_20260617.xlsx";

  // Company lookup
  const byNo = new Map<string, string>();
  const byName = new Map<string, string>();
  let cFrom = 0;
  while (true) {
    const { data } = await sb.from("companies").select("id, customer_no, name").not("customer_no", "is", null).range(cFrom, cFrom + 999);
    if (!data || data.length === 0) break;
    for (const c of data) {
      if (c.customer_no) byNo.set(String(c.customer_no).trim(), c.id);
      if (c.name) byName.set(c.name.toLowerCase().trim(), c.id);
    }
    if (data.length < 1000) break;
    cFrom += 1000;
  }
  const match = (kd: any, mc: any): string | null => {
    const k = str(kd);
    if (k) {
      const m = byNo.get(k) ?? byNo.get(k.padStart(5, "0"));
      if (m) return m;
    }
    const m2 = str(mc);
    if (m2) return byName.get(m2.toLowerCase()) ?? null;
    return null;
  };

  const readSheet = async (path: string) => {
    const { data, error } = await sb.storage.from("support-attachments").download(path);
    if (error) throw new Error(`download ${path}: ${error.message}`);
    const ab = await data.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true });
    return XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: null });
  };
  const get = (r: any, col: string) => { for (const k of Object.keys(r)) if (stripCol(k) === col) return r[k]; return null; };
  const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

  // Truncate
  await sb.from("issos_order_positions").delete().gte("auf_nr", -1);
  await sb.from("issos_orders").delete().gte("auf_nr", -1);

  // Orders
  const oRows = await readSheet(ordersPath);
  let oUnmatched = 0;
  const oMapped = oRows.map((r) => {
    const company_id = match(get(r, "Kd-Nr"), get(r, "Matchcode"));
    if (!company_id) oUnmatched++;
    return {
      auf_nr: int(get(r, "Auf-Nr")),
      kd_nr: str(get(r, "Kd-Nr")),
      matchcode: str(get(r, "Matchcode")),
      ang_nr: str(get(r, "Ang-Nr")),
      bes_dat_1: excelDate(get(r, "Bes-Dat 1")),
      bes_dat_2: excelDate(get(r, "Bes-Dat 2")),
      pers_nr: str(get(r, "Pers-Nr")),
      lief_kunde: str(get(r, "Lief-Kunde")),
      rabatt: num(get(r, "Rab.")),
      vertr_nr: str(get(r, "Vertr-Nr")),
      druck_kz: str(get(r, "Druck-Kz")),
      druck_text: str(get(r, "[ Druck-Kz ]") ?? get(r, "Druck-Kz")),
      zb: str(get(r, "ZB")),
      kz_preis: bool(get(r, "Kz-Preis")),
      lb: str(get(r, "LB")),
      company_id,
    };
  }).filter((r) => r.auf_nr !== null);

  let oInserted = 0;
  for (const batch of chunk(oMapped, 500)) {
    const { error, count } = await sb.from("issos_orders").upsert(batch, { onConflict: "auf_nr", count: "exact" });
    if (error) return new Response(JSON.stringify({ stage: "orders", error: error.message, batchSize: batch.length }), { status: 500 });
    oInserted += count ?? batch.length;
  }

  // Positions
  const pRows = await readSheet(posPath);
  let pUnmatched = 0;
  const pMapped = pRows.map((r) => {
    const company_id = match(get(r, "Kd-Nr"), null);
    if (!company_id) pUnmatched++;
    return {
      auf_nr: int(get(r, "Auf-Nr")),
      aufpos: int(get(r, "Aufpos")),
      termin: excelDate(get(r, "Termin")),
      kd_nr: str(get(r, "Kd-Nr")),
      art_nr: str(get(r, "Art.-Nr")),
      art_kunde: str(get(r, "Art/Kunde")),
      besnr_kd: str(get(r, "BesNr-Kd")),
      kz_erl_p: bool(get(r, "Kz. Erl. P")),
      erl_dat: excelDate(get(r, "Erl. Dat.")),
      preis_fw: num(get(r, "Preis FW")),
      auf_menge: num(get(r, "Auf-Menge")),
      gel_menge: num(get(r, "Gel-Menge")),
      mat_art: str(get(r, "Mat-art")),
      mat_art_text: str(get(r, "[ Materialart ]") ?? get(r, "Materialart")),
      company_id,
    };
  }).filter((r) => r.auf_nr !== null);

  let pInserted = 0;
  for (const batch of chunk(pMapped, 500)) {
    const { error, count } = await sb.from("issos_order_positions").insert(batch, { count: "exact" });
    if (error) return new Response(JSON.stringify({ stage: "positions", error: error.message }), { status: 500 });
    pInserted += count ?? batch.length;
  }

  return new Response(JSON.stringify({
    orders: { total: oRows.length, inserted: oInserted, unmatched: oUnmatched },
    positions: { total: pRows.length, inserted: pInserted, unmatched: pUnmatched },
  }), { headers: { "content-type": "application/json" } });
});
