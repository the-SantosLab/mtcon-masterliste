// Merge MTIQ description + reasoning into a single compact note via Lovable AI.
import { loadPrompt } from "../_shared/ai-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT =
  "Du bist ein neutraler Assistent für interne Vorgangsnotizen. " +
  "Verbinde die Vorgangsbeschreibung und die Strukturierungs-Begründung von MTIQ zu EINER kompakten, sachlichen Notiz auf Deutsch (max. 6 Sätze). " +
  "Keine Floskeln, keine Emojis, keine Marketingsprache, keine Überschriften. Gib NUR den reinen Notiztext zurück.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { description, reasoning } = await req.json().catch(() => ({}));
    const desc = String(description ?? "").trim();
    const reason = String(reasoning ?? "").trim();
    if (!desc && !reason) {
      return new Response(JSON.stringify({ error: "description oder reasoning erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sys = await loadPrompt("mtiq_merge_note", DEFAULT_PROMPT);
    const usr = `BESCHREIBUNG:\n${desc || "(keine)"}\n\nWARUM SO STRUKTURIERT:\n${reason || "(keine)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "Guthaben aufgebraucht. Bitte Credits aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await res.text();
      console.error("AI gateway error", res.status, t);
      throw new Error("AI-Gateway Fehler");
    }

    const data = await res.json();
    const note = String(data.choices?.[0]?.message?.content ?? "").trim();
    if (!note) throw new Error("Keine Antwort erhalten");

    return new Response(JSON.stringify({ note }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-merge-note error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
