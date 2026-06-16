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
const excelDate = (v: any): string | null => { if (v === null || v === undefined || v === "") return null; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString().slice(0, 10); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const excelTs = (v: any): string | null => { if (v === null || v === undefined || v === "") return null; if (v instanceof Date) return v.toISOString(); if (typeof v === "number") { const epoch = Date.UTC(1899, 11, 30); return new Date(epoch + v * 86400 * 1000).toISOString(); } const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function detectKind(headers: string[]): "deliveries" | "offer_positions" | "offers" | "unknown" {
  const h = new Set(headers.map(stripCol));
  if (h.has("LS-Nr") && h.has("LS-Datum")) return "deliveries";
  if (h.has("Ang-Nr") && h.has("Ang-pos")) return "offer_positions";
  if (h.has("Ang-Nr") && (h.has("Betreff 1") || h.has("Ang-stat"))) return "offers";
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

    let inserted = 0, updated = 0, unmatched = 0, errors = 0;
    const errLog: any[] = [];
    const chunk = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

    if (kind === "deliveries") {
      const mapped = rows.map((r) => {
        const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
        if (!company_id) unmatched++;
        return {
          ls_nr: int(get(r, "LS-Nr")),
          kd_nr: str(get(r, "Kd-Nr")),
          matchcode: str(get(r, "Matchcode")),
          ls_datum: excelDate(get(r, "LS-Datum")),
          druck_kz: int(get(r, "Druck-Kz")),
          druck_text: str(get(r, "[ Druck-Kz ]") ?? get(r, "Druck-Kz")),
          druck_dat: excelTs(get(r, "Druckdat.")),
          buch_kz: int(get(r, "Buch-Kz")),
          buch_text: str(get(r, "[ Buch-Kz ]") ?? get(r, "Buch-Kz")),
          kz_erl: bool(get(r, "Kz-Erl")),
          lb: str(get(r, "LB")),
          va: str(get(r, "VA")),
          vp: str(get(r, "VP")),
          packstuecke: num(get(r, "Packstücke")),
          brutto_gew: num(get(r, "Brutto-Gew")),
          netto_gew: num(get(r, "Netto-Gew")),
          pers_nr: str(get(r, "Pers-Nr")),
          lieferadr: int(get(r, "Lieferadr")),
          auf_nr_la: int(get(r, "Auf-Nr LA")),
          name1: str(get(r, "Name 1")),
          strasse: str(get(r, "Strasse")),
          land: str(get(r, "Land")),
          plz: str(get(r, "PLZ")),
          ort: str(get(r, "Ort")),
          sprache: str(get(r, "Sprache")),
          sprache_text: str(get(r, "[ Sprache  ]") ?? get(r, "Sprache")),
          kz_konsi: bool(get(r, "Kz-Konsi")),
          kz_kons_ab: bool(get(r, "Kz.Kons-AB")),
          company_id,
        };
      }).filter((r) => r.ls_nr !== null);

      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_deliveries").upsert(batch, { onConflict: "ls_nr", count: "exact" });
        if (error) { errors += batch.length; errLog.push({ error: error.message }); }
        else inserted += count ?? batch.length;
      }
    } else if (kind === "offer_positions") {
      const mapped = rows.map((r) => {
        const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
        if (!company_id) unmatched++;
        return {
          ang_nr: int(get(r, "Ang-Nr")),
          ang_pos: int(get(r, "Ang-pos")),
          kd_nr: str(get(r, "Kd-Nr")),
          matchcode: str(get(r, "Matchcode")),
          int_nr: str(get(r, "Int-Nr")),
          matchcode_1: str(get(r, "Matchcode_1")),
          a_status: str(get(r, "A-Status")),
          a_status_text: str(get(r, "Stat. Ang.Pos")),
          art_nr: str(get(r, "Art.-Nr")),
          art_matchcode: str(get(r, "Matchcode") === get(r, "Matchcode") ? null : null) || str(get(r, "Matchcode")),
          bezeich_1: str(get(r, "Bezeich 1")),
          art_kunde: str(get(r, "Art/Kunde")),
          ang_menge: num(get(r, "Ang-Menge")),
          me: str(get(r, "ME")),
          netto_gw: num(get(r, "Netto GW")),
          preis_fw: num(get(r, "Preis FW")),
          waehrung: str(get(r, "Währung")),
          kz_preis: bool(get(r, "Kz-Preis")),
          pe: num(get(r, "PE")),
          ang_datum: excelDate(get(r, "Ang-Datum")),
          kurs: num(get(r, "Kurs")),
          rabatt_pos: num(get(r, "Rabatt-Pos")),
          mat_art: str(get(r, "Mat-art")),
          mat_art_text: str(get(r, "Materialart")),
          kosten: num(get(r, "Kosten")),
          kostenherk: str(get(r, "Kostenherk")),
          bewertungspreis: num(get(r, "Bewertungspreis")),
          kosten_1: num(get(r, "Kosten_1")),
          marge: num(get(r, "Marge")),
          marge_v: num(get(r, "Marge %(V)")),
          marge_e: num(get(r, "Marge %(E)")),
          company_id,
        };
      }).filter((r) => r.ang_nr !== null);

      // wipe + reinsert (no natural unique key for offer position)
      const angSet = Array.from(new Set(mapped.map((m) => m.ang_nr).filter((x): x is number => x !== null)));
      for (const batch of chunk(angSet, 500)) {
        await supabase.from("issos_offer_positions").delete().in("ang_nr", batch);
      }
      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_offer_positions").insert(batch, { count: "exact" });
        if (error) { errors += batch.length; errLog.push({ error: error.message }); }
        else inserted += count ?? batch.length;
      }
    } else if (kind === "offers") {
      const mapped = rows.map((r) => {
        const company_id = matchCompany(get(r, "Kd-Nr"), get(r, "Matchcode"));
        if (!company_id) unmatched++;
        return {
          ang_nr: int(get(r, "Ang-Nr")),
          kd_nr: str(get(r, "Kd-Nr")),
          matchcode: str(get(r, "Matchcode")),
          int_nr: str(get(r, "Int-Nr")),
          ang_stat: str(get(r, "Ang-stat")),
          ang_stat_text: str(get(r, "Angebotsstatus")),
          betreff1: str(get(r, "Betreff 1")),
          betreff2: str(get(r, "Betreff 2")),
          vorl_datum: excelDate(get(r, "Vorl-Datum")),
          fristdat: excelDate(get(r, "Fristdat")),
          pers_nr: str(get(r, "Pers-Nr")),
          vertr_nr: str(get(r, "Vertr-Nr")),
          rabatt: num(get(r, "Rab.")),
          druck_kz: str(get(r, "Druck-Kz")),
          druck_kz_text: str(get(r, "Druck-Kz")),
          druck_dat: excelTs(get(r, "Druckdat.")),
          projekt_nr: str(get(r, "Projekt-Nr")),
          mandant: str(get(r, "Mandant")),
          company_id,
          updated_at: new Date().toISOString(),
        };
      }).filter((r) => r.ang_nr !== null);

      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_offers").upsert(batch, { onConflict: "ang_nr", count: "exact" });
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
