import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: list } = await supabase.storage
    .from("support-attachments")
    .list("tickets/ec78bde4-6b3b-4bee-a342-36d69c988a22", { limit: 100 });
  const paths = (list ?? []).map((f) => `tickets/ec78bde4-6b3b-4bee-a342-36d69c988a22/${f.name}`);
  const out: Record<string, string> = {};
  for (const p of paths) {
    const { data } = await supabase.storage.from("support-attachments").createSignedUrl(p, 3600);
    if (data) out[p] = data.signedUrl;
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
});
