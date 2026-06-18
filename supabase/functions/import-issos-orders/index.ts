import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripCol = (s: string) => String(s ?? "").replace(/^☰\s*/, "").replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
const num = (v: any) => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const int = (v: any) => { const n = num(v); return n === null ? null : Math.trunc(n); };
const str = (v: any) => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === "" ? null : s; };
const bool = (v: any) => { if (v === null || v === undefined || v === "") return null; if (typeof v === "boolean") return v; const s = String(v).toLowerCase().trim(); return s === "true" || s === "1" || s === "ja" || s === "yes"; };
const excelDate = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); d = new Date(epoch + v * 86400 * 1000); }
  else { const x = new Date(String(v)); d = Number.isNaN(x.getTime()) ? null : x; }
  if (!d) return null;
  const y = d.getUTCFullYear();
  if (y < 1900 || y > 2999) return null;
  return d.toISOString().slice(0, 10);
};

function detectKind(headers: string[]): "orders" | "positions" | "unknown" {
  const h = new Set(headers.map(stripCol));
  if (h.has("Auf-Nr") && h.has("Aufpos")) return "positions";
  if (h.has("Auf-Nr") && (h.has("Bes-Dat 1") || h.has("Vertr-Nr") || h.has("Druck-Kz"))) return "orders";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: isAdminData } = await supabase.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdminData) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return new Response(JSON.stringify({ error: "Missing file" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { raw: true, defval: null });
    if (!rows.length) return new Response(JSON.stringify({ error: "Leere Datei" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const headers = Object.keys(rows[0]);
    const kind = detectKind(headers);
    const get = (r: any, col: string) => { for (const k of Object.keys(r)) if (stripCol(k) === col) return r[k]; return null; };

    // Build company lookup
    const byNo = new Map<string, string>();
    const byName = new Map<string, string>();
    let cFrom = 0;
    while (true) {
      const { data: cPage } = await supabase.from("companies").select("id, customer_no, name").not("customer_no", "is", null).range(cFrom, cFrom + 999);
      if (!cPage || cPage.length === 0) break;
      for (const c of cPage) {
        if (c.customer_no) byNo.set(String(c.customer_no).trim(), c.id);
        if (c.name) byName.set(c.name.toLowerCase().trim(), c.id);
      }
      if (cPage.length < 1000) break;
      cFrom += 1000;
    }
    const matchCompany = (kdnr: any, matchcode: any): string | null => {
      const k = str(kdnr);
      if (k) {
        const m = byNo.get(k) ?? byNo.get(k.padStart(5, "0"));
        if (m) return m;
      }
      const mc = str(matchcode);
      if (mc) return byName.get(mc.toLowerCase()) ?? null;
      return null;
    };

    let inserted = 0, unmatched = 0, errors = 0;
    const errLog: any[] = [];
    const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

    if (kind === "orders") {
      const mapped = rows.map((r) => {
        const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
        if (!company_id) unmatched++;
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
          updated_at: new Date().toISOString(),
        };
      }).filter((r) => r.auf_nr !== null);

      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_orders").upsert(batch, { onConflict: "auf_nr", count: "exact" });
        if (error) { errors += batch.length; errLog.push({ error: error.message }); }
        else inserted += count ?? batch.length;
      }
    } else if (kind === "positions") {
      const mapped = rows.map((r) => {
        const company_id = matchCompany(get(r, "Kd-Nr"), null);
        if (!company_id) unmatched++;
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

      // Replace all positions for affected orders to avoid duplicates
      const aufSet = Array.from(new Set(mapped.map((m) => m.auf_nr).filter((x): x is number => x !== null)));
      for (const batch of chunk(aufSet, 500)) {
        await supabase.from("issos_order_positions").delete().in("auf_nr", batch);
      }
      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_order_positions").insert(batch, { count: "exact" });
        if (error) { errors += batch.length; errLog.push({ error: error.message }); }
        else inserted += count ?? batch.length;
      }
    } else {
      return new Response(JSON.stringify({ error: "Dateityp nicht erkannt", headers }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ kind, rows_total: rows.length, inserted, unmatched, errors, errLog }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
