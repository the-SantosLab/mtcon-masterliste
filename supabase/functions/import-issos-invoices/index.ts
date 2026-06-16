import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripCol = (s: string) => String(s ?? "").replace(/^☰\s*/, "").replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
const num = (v: any) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const int = (v: any) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};
const str = (v: any) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const bool = (v: any) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  return s === "true" || s === "1" || s === "ja" || s === "yes";
};
// Excel serial date -> ISO yyyy-mm-dd
const excelDate = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + v * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const excelTs = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + v * 86400 * 1000).toISOString();
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function detectKind(headers: string[]): "invoices" | "positions_re" | "positions_all" | "extras" | "unknown" {
  const h = new Set(headers.map(stripCol));
  if (h.has("Zusatzpos")) return "extras";
  if (h.has("Belegart") && h.has("Brutto FW") && h.has("Rech-folge") === false) return "invoices";
  if (h.has("Marge") || h.has("Kostenherk")) return "positions_all";
  if (h.has("Art.-Nr") || h.has("Art-Gr")) return "positions_re";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check admin auth from caller
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
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
    const get = (r: any, col: string) => {
      // find header that matches col (after strip)
      for (const k of Object.keys(r)) if (stripCol(k) === col) return r[k];
      return null;
    };

    // Build companies map by customer_no
    const { data: comps } = await supabase.from("companies").select("id, customer_no, name").not("customer_no", "is", null);
    const byNo = new Map<string, string>();
    for (const c of comps ?? []) if (c.customer_no) byNo.set(String(c.customer_no).trim(), c.id);
    const matchCompany = (kdnr: any): string | null => {
      const k = str(kdnr);
      if (!k) return null;
      return byNo.get(k) ?? byNo.get(k.padStart(5, "0")) ?? null;
    };

    let inserted = 0;
    let updated = 0;
    let unmatched = 0;
    let errors = 0;
    const errLog: any[] = [];

    const chunk = <T,>(a: T[], n: number) => {
      const out: T[][] = [];
      for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
      return out;
    };

    if (kind === "invoices") {
      const mapped = rows.map((r) => {
        const company_id = matchCompany(get(r, "R-Kd-Nr"));
        if (!company_id) unmatched++;
        return {
          rech_nr: int(get(r, "Rech-Nr")),
          nummer: int(get(r, "Nummer")),
          belegart: str(get(r, "Belegart")),
          belegart_text: str(get(r, "Belegart Rechn.")),
          r_kd_nr: str(get(r, "R-Kd-Nr")),
          matchcode: str(get(r, "Matchcode")),
          rech_dat: excelDate(get(r, "Rech-Dat")),
          netto_fw: num(get(r, "Netto FW")),
          mwst1_fw: num(get(r, "MwStw 1 FW")),
          mwst2_fw: num(get(r, "MwStw 2 FW")),
          brutto_fw: num(get(r, "Brutto FW")),
          waehrung: str(get(r, "Währung")),
          iae_kz: str(get(r, "I-A-E-Kz.")),
          iae_text: str(get(r, "I-A-E-Kz.") === null ? null : get(r, "I-A-E-Kz.")) && str(get(r, "I-A-E-Kz.")),
          druck_kz: int(get(r, "Druck-Kz")),
          druck_text: str(get(r, "Druck-Kz")) && null,
          druck_dat: excelDate(get(r, "Druckdat.")),
          kz_erl: bool(get(r, "Kz-Erl")),
          zb: int(get(r, "ZB")),
          ust_id: str(get(r, "Ust-Id-Nr")),
          storno_kz: bool(get(r, "Storno Kz")),
          ausloeser: str(get(r, "Auslöser")),
          ziel1: excelDate(get(r, "Ziel 1")),
          skonto1: num(get(r, "Skonto 1")),
          ziel2: excelDate(get(r, "Ziel 2")),
          skonto2: num(get(r, "Skonto 2")),
          datum_net: excelDate(get(r, "Datum Net")),
          kz_sammel: int(get(r, "KZ-Sammel")),
          sammel_text: str(get(r, "Sammelrechnung")),
          pers_nr: int(get(r, "Pers-Nr")),
          fibu_dat: excelDate(get(r, "FIBU-Dat")),
          mis_datum: excelTs(get(r, "MIS-Datum")),
          company_id,
        };
      }).filter((r) => r.rech_nr !== null);

      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase
          .from("issos_invoices")
          .upsert(batch, { onConflict: "rech_nr", count: "exact" });
        if (error) {
          errors += batch.length;
          errLog.push({ batch_start: mapped.indexOf(batch[0]), error: error.message });
        } else {
          inserted += count ?? batch.length;
        }
      }
    } else if (kind === "positions_all" || kind === "positions_re") {
      // Build invoice id map
      const rechNrs = Array.from(new Set(rows.map((r) => int(get(r, "Rech-Nr"))).filter((x): x is number => x !== null)));
      const idMap = new Map<number, string>();
      for (const batch of chunk(rechNrs, 1000)) {
        const { data } = await supabase.from("issos_invoices").select("id, rech_nr").in("rech_nr", batch);
        for (const i of data ?? []) idMap.set(i.rech_nr, i.id);
      }
      const mapped = rows.map((r) => {
        const rech_nr = int(get(r, "Rech-Nr"));
        const invoice_id = rech_nr ? idMap.get(rech_nr) ?? null : null;
        if (!invoice_id) unmatched++;
        return {
          rech_nr,
          invoice_id,
          nummer: int(get(r, "Nummer")),
          r_kd_nr: str(get(r, "R-Kd-Nr")),
          matchcode: str(get(r, "Matchcode")),
          rech_folge: int(get(r, "Rech-folge")),
          auf_nr: int(get(r, "Auf-Nr")),
          aufpos: int(get(r, "Aufpos")),
          ls_nr: int(get(r, "LS-Nr")),
          art_nr: str(get(r, "Art.-Nr")),
          bezeich1: str(get(r, "Bezeich 1")),
          menge: num(get(r, "Menge")),
          preis_fw: num(get(r, "Preis FW") ?? get(r, "Preis 1 GW")),
          waehrung: str(get(r, "Währung")),
          netto_fw: num(get(r, "Netto FW") ?? get(r, "Netto GW")),
          art_kunde: str(get(r, "Art/Kunde")),
          vertr_nr: str(get(r, "Vertr-Nr")),
          bes_dat1: excelDate(get(r, "Bes-Dat 1")),
          erloeskto: str(get(r, "Erlöskto")),
          folge: int(get(r, "Folge")),
          kz_preis: str(get(r, "Kz-Preis")),
          rabatt_pos: num(get(r, "Rabatt-Pos")),
          zu_pos: str(get(r, "Zu-Pos")),
          zu_bezeich: str(get(r, "Zu-Bezeich")),
          preis1_fw: num(get(r, "Preis 1 FW")),
          wert1_fw: num(get(r, "Wert 1 FW")),
          wert2_fw: num(get(r, "Wert 2 FW")),
          mwst_satz: num(get(r, "MwSt-Satz")),
          mwst1_fw: num(get(r, "MwStw 1 FW")),
          kosten: num(get(r, "Kosten")),
          kostenherk: str(get(r, "Kostenherk")),
          bewertungspreis: num(get(r, "Bewertungspreis")),
          kosten2: num(get(r, "Kosten.1")),
          marge: num(get(r, "Marge")),
          marge_v: num(get(r, "Marge %(V)")),
          marge_e: num(get(r, "Marge %(E)")),
          land: str(get(r, "Land")),
        };
      }).filter((r) => r.invoice_id !== null);

      // Replace existing positions per file: delete by rech_nr range first (idempotent)
      const rechSet = Array.from(new Set(mapped.map((m) => m.rech_nr).filter((x): x is number => x !== null)));
      for (const batch of chunk(rechSet, 500)) {
        await supabase.from("issos_invoice_positions").delete().in("rech_nr", batch);
      }
      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_invoice_positions").insert(batch, { count: "exact" });
        if (error) {
          errors += batch.length;
          errLog.push({ error: error.message });
        } else {
          inserted += count ?? batch.length;
        }
      }
    } else if (kind === "extras") {
      const rechNrs = Array.from(new Set(rows.map((r) => int(get(r, "Rech-Nr"))).filter((x): x is number => x !== null)));
      const idMap = new Map<number, string>();
      for (const batch of chunk(rechNrs, 1000)) {
        const { data } = await supabase.from("issos_invoices").select("id, rech_nr").in("rech_nr", batch);
        for (const i of data ?? []) idMap.set(i.rech_nr, i.id);
      }
      const mapped = rows.map((r) => {
        const rech_nr = int(get(r, "Rech-Nr"));
        const invoice_id = rech_nr ? idMap.get(rech_nr) ?? null : null;
        if (!invoice_id) unmatched++;
        return {
          nummer: int(get(r, "Nummer")),
          rech_nr,
          invoice_id,
          r_kd_nr: str(get(r, "R-Kd-Nr")),
          matchcode: str(get(r, "Matchcode")),
          rech_folge: int(get(r, "Rech-folge")),
          zusatzpos: str(get(r, "Zusatzpos")),
          bezeich: str(get(r, "Bezeich")),
          nettow_fw: num(get(r, "Nettow-FW")),
          waehrung: str(get(r, "Währung")),
          menge: num(get(r, "Menge")),
          ls_datum: excelDate(get(r, "LS-Datum")),
          kst: str(get(r, "Kst")),
          kst_text: str(get(r, "Kst-Ktr")),
          ktr: str(get(r, "KTR")),
          ktr_text: str(get(r, "Kostenträger")),
          nettow_gw: num(get(r, "Nettow-GW")),
          ls_nr: int(get(r, "LS-Nr")),
          erloeskto: str(get(r, "Erlöskto")),
          mwst_satz: num(get(r, "MwSt-Satz")),
          mwst_kto: str(get(r, "MwSt-Kto")),
          mwst_gr: str(get(r, "MwSt-Gr")),
          mwst_gr_text: str(get(r, "MwSt-Gruppe")),
          mwst1_fw: num(get(r, "MwStw 1 FW")),
          mwst1_gw: num(get(r, "MwStw 1 GW")),
          mwst2_fw: num(get(r, "MwStw 2 FW")),
          mwst2_gw: num(get(r, "MwStw 2 GW")),
          bruttow_fw: num(get(r, "Bruttow-FW")),
          bruttow_gw: num(get(r, "Bruttow-GW")),
          text_note: str(get(r, "Text")),
          kosten: num(get(r, "Kosten")),
          kostenherk: str(get(r, "Kostenherk")),
          bew_zusatzkosten: num(get(r, "Bew.Zusatzkosten")),
          kosten2: num(get(r, "Kosten.1")),
          marge: num(get(r, "Marge")),
          marge_v: num(get(r, "Marge %(V)")),
          marge_e: num(get(r, "Marge %(E)")),
          land: str(get(r, "Land")),
        };
      }).filter((r) => r.invoice_id !== null);

      const rechSet = Array.from(new Set(mapped.map((m) => m.rech_nr).filter((x): x is number => x !== null)));
      for (const batch of chunk(rechSet, 500)) {
        await supabase.from("issos_invoice_extras").delete().in("rech_nr", batch);
      }
      for (const batch of chunk(mapped, 500)) {
        const { error, count } = await supabase.from("issos_invoice_extras").insert(batch, { count: "exact" });
        if (error) {
          errors += batch.length;
          errLog.push({ error: error.message });
        } else {
          inserted += count ?? batch.length;
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Dateityp nicht erkannt", headers }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    await supabase.from("issos_import_runs").insert({
      file_name: file.name,
      file_kind: kind,
      rows_total: rows.length,
      rows_inserted: inserted,
      rows_updated: updated,
      rows_unmatched: unmatched,
      rows_error: errors,
      error_log: errLog.length ? errLog : null,
      ran_by: userRes.user.id,
    });

    return new Response(JSON.stringify({ kind, rows_total: rows.length, inserted, unmatched, errors }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
