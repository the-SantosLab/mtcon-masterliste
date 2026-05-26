// Loads a system prompt by key from public.ai_prompts.
// Returns the DB content if non-empty, otherwise the provided fallback.
// Supports {{placeholder}} substitution from the optional vars map.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function loadPrompt(
  key: string,
  fallback: string,
  vars: Record<string, string> = {},
): Promise<string> {
  let text = fallback;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && service) {
      const admin = createClient(url, service, { auth: { persistSession: false } });
      const { data } = await admin
        .from("ai_prompts")
        .select("content")
        .eq("key", key)
        .maybeSingle();
      const c = (data as any)?.content;
      if (typeof c === "string" && c.trim().length > 0) text = c;
    }
  } catch (e) {
    console.warn("loadPrompt failed for", key, e);
  }
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, v);
  }
  return text;
}
