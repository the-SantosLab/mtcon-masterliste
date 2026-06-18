import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get("p")!;
  const bucket = url.searchParams.get("b") ?? "support-attachments";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(await data.arrayBuffer(), { headers: { "content-type": "application/octet-stream" } });
});
