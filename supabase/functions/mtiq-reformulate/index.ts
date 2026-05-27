import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const DEFAULT_REFORMULATE_PROMPT = "Du bist MTIQ, ein Assistent für betriebliche Vorgangsbeschreibungen. Formuliere den eingegebenen Text klarer, verständlicher und strukturierter auf Deutsch. Verwende dabei durchgehend die 'Du'-Ansprache (z. B. 'kannst Du' statt 'können Sie'). Behalte alle inhaltlichen Informationen bei. Antworte ausschließlich mit der neuen Formulierung – ohne Einleitung, ohne Kommentare, ohne Markdown.";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, mode } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Kein Text angegeben" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const reformulationMode = mode === "light" ? "light" : "full";

    const basePrompt = await loadPrompt("mtiq_reformulate", DEFAULT_REFORMULATE_PROMPT);
    const systemPromptText = reformulationMode === "light"
      ? `${basePrompt}\n\nWICHTIG (Modus: Kleine Umformulierung): Nimm nur minimale Korrekturen vor – Rechtschreibung, Grammatik, Zeichensetzung und kleine sprachliche Glättungen. Strukturiere den Text NICHT um, ergänze nichts, kürze nichts und ändere den Stil nur so wenig wie möglich. Behalte die ursprüngliche Satzreihenfolge und Wortwahl weitestgehend bei.`
      : `${basePrompt}\n\nHinweis (Modus: Große Umformulierung): Du darfst den Text deutlich umstrukturieren, klarer gliedern und sprachlich vollständig überarbeiten, solange alle inhaltlichen Informationen erhalten bleiben.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPromptText },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Guthaben aufgebraucht. Bitte Credits aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI-Gateway Fehler");
    }

    const data = await response.json();
    const reformulated = data.choices?.[0]?.message?.content?.trim();
    if (!reformulated) throw new Error("Keine Antwort erhalten");

    return new Response(JSON.stringify({ text: reformulated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-reformulate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
