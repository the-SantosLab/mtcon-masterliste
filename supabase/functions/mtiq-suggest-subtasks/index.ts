// MTIQ – Unteraufgaben vorschlagen: analysiert Vorgang und schlägt fehlende
// sinnvolle Subtasks als strukturierte JSON-Liste vor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const DEFAULT_SUGGEST_SUBTASKS_PROMPT = `Du bist MTIQ. Schlage 3–6 sinnvolle, konkrete Unteraufgaben für den Vorgang vor.
Regeln:
- KEINE Doppelungen zu vorhandenen Unteraufgaben (siehe Liste).
- Jede Aufgabe ist ein klarer, kurzer Imperativ-Satz auf Deutsch (max 80 Zeichen).
- Vergib eine Dringlichkeit von 0–3 (0=normal, 3=dringend).
- Antworte AUSSCHLIESSLICH als JSON-Objekt im Format:
  {"tasks":[{"title":"...","urgency":0}, ...]}
- Kein Fließtext, kein Markdown, keine Erklärung.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await client.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { vorgang_id } = await req.json();
    if (!vorgang_id) {
      return new Response(JSON.stringify({ error: "vorgang_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: c } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, note, due_at, urgency, departments:department_id(name)")
      .eq("id", vorgang_id)
      .maybeSingle();
    if (!c) {
      return new Response(JSON.stringify({ error: "Vorgang nicht gefunden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: subtasks }, { data: notes }] = await Promise.all([
      client.from("case_tasks").select("title, status, completed").eq("case_id", vorgang_id).order("sort_order").limit(50),
      client.from("case_notes").select("body, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(10),
    ]);

    const dept = (c as any).departments?.name ?? "-";
    const existingTitles = (subtasks ?? []).map((t: any) => `- ${t.completed ? "[✓] " : ""}${t.title}`).join("\n") || "  (noch keine)";
    const noteLines = (notes ?? []).map((n: any) =>
      `  • ${String(n.body ?? "").slice(0,250).replace(/\n/g," ")}`
    ).join("\n") || "  keine";

    const basePrompt = await loadPrompt("mtiq_suggest_subtasks", DEFAULT_SUGGEST_SUBTASKS_PROMPT);
    const systemPrompt = `${basePrompt}

Vorgang:
- Nr: ${c.case_no} · Titel: ${c.project_name} · Kunde: ${c.client_name ?? "-"} · Abt: ${dept}
- Status: ${c.status} · Chilis: ${c.urgency ?? 0}/5 · Fällig: ${c.due_at ?? "-"}
- Notiz: ${(c.note ?? "").slice(0, 600)}

Bereits vorhandene Unteraufgaben:
${existingTitles}

Letzte Notizen:
${noteLines}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Schlage jetzt passende Unteraufgaben vor." },
        ],
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Zu viele Anfragen." : "AI-Guthaben aufgebraucht." }), {
        status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const j = await aiResp.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const rawTasks: any[] = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    const tasks = rawTasks
      .filter(t => t && typeof t.title === "string" && t.title.trim())
      .map(t => ({
        title: String(t.title).trim().slice(0, 120),
        urgency: Math.max(0, Math.min(3, Number(t.urgency) || 0)),
      }))
      .slice(0, 8);

    return new Response(JSON.stringify({ tasks }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mtiq-suggest-subtasks error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
