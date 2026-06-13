import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const path = "tickets/82e20e42-59c4-4385-a69a-cebc2b5cb774/1781271252259_Bestand_detailliert_20260612.xlsx";
  const { data: file, error: dlErr } = await admin.storage.from("support-attachments").download(path);
  if (dlErr || !file) {
    return new Response(JSON.stringify({ error: dlErr?.message ?? "no file" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // rows[0] is header
  const records: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    records.push({
      art_nr: String(r[0]).trim(),
      lager: String(r[1] ?? "").trim(),
      lagerpl: String(r[2] ?? "").trim(),
      behaelter: String(r[3] ?? "").trim(),
      charge_nr: r[17] != null ? String(r[17]).trim() : "",
      me: r[12] ? String(r[12]).trim() : null,
      bestand: Number(r[13] ?? 0),
      sb_menge: Number(r[14] ?? 0),
      mb_menge: Number(r[15] ?? 0),
      verp_mg: r[16] != null ? Number(r[16]) : null,
      res_auf_nr: r[18] != null ? String(r[18]) : null,
      res_auf_pos: r[19] != null ? String(r[19]) : null,
      res_wa_nr: r[20] != null ? String(r[20]) : null,
      source: "ISSOS",
    });
  }
  // Dedupe within batch by natural key (keep last)
  const map = new Map<string, any>();
  for (const r of records) {
    const k = [r.art_nr, r.lager, r.lagerpl, r.behaelter, r.charge_nr].join("|");
    map.set(k, r);
  }
  const deduped = Array.from(map.values());
  let inserted = 0;
  const B = 500;
  for (let i = 0; i < deduped.length; i += B) {
    const chunk = deduped.slice(i, i + B);
    const { error } = await admin
      .from("article_stock_locations")
      .upsert(chunk, { onConflict: "art_nr,lager,lagerpl,behaelter,charge_nr" });
    if (error) {
      return new Response(JSON.stringify({ inserted, error: error.message, atBatch: i }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += chunk.length;
  }
  return new Response(JSON.stringify({ ok: true, total: records.length, deduped: deduped.length, inserted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
