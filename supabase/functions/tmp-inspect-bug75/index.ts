import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const which = url.searchParams.get("f") || "ls";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const path = which === "ls"
    ? "tickets/c1d0afdc-c9ed-4df8-80c6-307825714ce1/1781632455229_Lieferscheine_20260616.xlsx"
    : "tickets/c1d0afdc-c9ed-4df8-80c6-307825714ce1/1781632455565_Angebotspositionen_20260616.xlsx";
  const { data, error } = await supabase.storage.from("support-attachments").download(path);
  if (error || !data) return new Response(JSON.stringify({ error: error?.message }), { status: 500 });
  const wb = XLSX.read(new Uint8Array(await data.arrayBuffer()), { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { raw: true, defval: null });
  return new Response(JSON.stringify({
    sheets: wb.SheetNames,
    headers: rows[0] ? Object.keys(rows[0]) : [],
    sample: rows.slice(0, 3),
    total: rows.length,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
