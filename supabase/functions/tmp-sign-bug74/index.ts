import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const paths = [
    "tickets/71fd0bda-c62a-41ae-875e-0899649c4ecc/1781631250728_Angebote_20260616.xlsx",
    "tickets/71fd0bda-c62a-41ae-875e-0899649c4ecc/1781631251200_Angebotspositionen_20260616.xlsx",
  ];
  const out: any = {};
  for (const p of paths) {
    const { data } = await s.storage.from("support-attachments").createSignedUrl(p, 600);
    out[p] = data?.signedUrl;
  }
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
