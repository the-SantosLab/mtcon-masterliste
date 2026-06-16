import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const stripCol = (s: string) => String(s ?? "").replace(/^☰\s*/, "").replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
const num = (v: any) => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const int = (v: any) => { const n = num(v); return n === null ? null : Math.trunc(n); };
const str = (v: any) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === "" ? null : s; };
const excelDate = (v: any): string | null => { if (v === null || v === undefined || v === "") return null; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString().slice(0, 10); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const excelTs = (v: any): string | null => { if (v === null || v === undefined || v === "") return null; if (v instanceof Date) return v.toISOString(); if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString(); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const path = "tickets/71fd0bda-c62a-41ae-875e-0899649c4ecc/1781631250728_Angebote_20260616.xlsx";
  const { data: file, error: dlErr } = await s.storage.from("support-attachments").download(path);
  if (dlErr || !file) return new Response(JSON.stringify({ error: dlErr?.message || "download failed" }), { status: 500 });
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { raw: true, defval: null });
  const get = (r: any, col: string) => { for (const k of Object.keys(r)) if (stripCol(k) === col) return r[k]; return null; };

  const byNo = new Map<string, string>(); const byName = new Map<string, string>();
  let cFrom = 0;
  while (true) {
    const { data: cPage } = await s.from("companies").select("id, customer_no, name").not("customer_no", "is", null).range(cFrom, cFrom + 999);
    if (!cPage || cPage.length === 0) break;
    for (const c of cPage) { if (c.customer_no) byNo.set(String(c.customer_no).trim(), c.id); if (c.name) byName.set(c.name.toLowerCase().trim(), c.id); }
    if (cPage.length < 1000) break; cFrom += 1000;
  }
  const matchCompany = (kdnr: any, mc: any) => {
    const k = str(kdnr); if (k) { const m = byNo.get(k) ?? byNo.get(k.padStart(5, "0")); if (m) return m; }
    const m2 = str(mc); if (m2) return byName.get(m2.toLowerCase()) ?? null; return null;
  };

  let unmatched = 0;
  const mapped = rows.map((r) => {
    const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
    if (!company_id) unmatched++;
    return {
      ang_nr: int(get(r, "Ang-Nr")), kd_nr: str(get(r, "Kd-Nr")), matchcode: str(get(r, "Matchcode")),
      int_nr: str(get(r, "Int-Nr")), ang_stat: str(get(r, "Ang-stat")), ang_stat_text: str(get(r, "Angebotsstatus")),
      betreff1: str(get(r, "Betreff 1")), betreff2: str(get(r, "Betreff 2")),
      vorl_datum: excelDate(get(r, "Vorl-Datum")), fristdat: excelDate(get(r, "Fristdat")),
      pers_nr: str(get(r, "Pers-Nr")), vertr_nr: str(get(r, "Vertr-Nr")), rabatt: num(get(r, "Rab.")),
      druck_kz: str(get(r, "Druck-Kz")), druck_kz_text: str(get(r, "Druck-Kz")),
      druck_dat: excelTs(get(r, "Druckdat.")), projekt_nr: str(get(r, "Projekt-Nr")), mandant: str(get(r, "Mandant")),
      company_id, updated_at: new Date().toISOString(),
    };
  }).filter((r) => r.ang_nr !== null);

  let inserted = 0; const errs: any[] = [];
  for (let i = 0; i < mapped.length; i += 500) {
    const batch = mapped.slice(i, i + 500);
    const { error, count } = await s.from("issos_offers").upsert(batch, { onConflict: "ang_nr", count: "exact" });
    if (error) errs.push(error.message); else inserted += count ?? batch.length;
  }
  return new Response(JSON.stringify({ total: rows.length, inserted, unmatched, errs }), { headers: { ...cors, "Content-Type": "application/json" } });
});
