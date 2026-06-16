import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const paths = [
    "tickets/c1d0afdc-c9ed-4df8-80c6-307825714ce1/1781632455229_Lieferscheine_20260616.xlsx",
    "tickets/c1d0afdc-c9ed-4df8-80c6-307825714ce1/1781632455565_Angebotspositionen_20260616.xlsx",
  ];
  const out: any = {};
  for (const p of paths) {
    const { data, error } = await supabase.storage.from("support-attachments").download(p);
    if (error || !data) { out[p] = { error: error?.message }; continue; }
    const wb = XLSX.read(new Uint8Array(await data.arrayBuffer()), { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { raw: true, defval: null });
    out[p] = {
      sheets: wb.SheetNames,
      headers: rows[0] ? Object.keys(rows[0]) : [],
      sample: rows.slice(0, 2),
      total: rows.length,
    };
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});
