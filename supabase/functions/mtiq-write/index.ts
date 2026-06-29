// MTIQ Write Assistant – Umformulieren / Kürzen mit wählbarer Tonalität.
// Body: { text: string, action: 'rewrite'|'shorten', tone?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TONES: Record<string, string> = {
  neutral: "neutral und sachlich (Banking-Standard, keine Floskeln, keine Emojis)",
  formal: "förmlich und höflich (Sie-Form, professionell)",
  friendly: "freundlich und zugewandt (Du-Form, warm, aber sachlich)",
  short: "extrem knapp und auf den Punkt",
  customer: "als kundenfreundliche E-Mail-Formulierung (höflich, klar, lösungsorientiert)",
  internal: "als interne Notiz für Kollegen (kompakt, fachlich, direkt)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await client.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, action, tone } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Kein Text übergeben" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const act = action === "shorten" ? "shorten" : "rewrite";
    const toneDesc = TONES[String(tone || "neutral")] ?? TONES.neutral;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const actionInstruction = act === "shorten"
      ? "Kürze den eingegebenen Text deutlich, ohne wesentliche Informationen zu verlieren. Reduziere auf das Wesentliche, entferne Wiederholungen und Füllwörter."
      : "Formuliere den eingegebenen Text klarer, professioneller und besser strukturiert. Inhalt bleibt vollständig erhalten.";

    const system = `Du bist MTIQ, der interne Schreibassistent von MtCon. ${actionInstruction}

Tonalität: ${toneDesc}.

Regeln:
- Antworte AUSSCHLIESSLICH mit dem neuen Text – keine Einleitung, keine Erklärung, kein Markdown, keine Anführungszeichen drumherum.
- Sprache bleibt Deutsch, außer der Originaltext ist in einer anderen Sprache.
- Eigennamen, Zahlen, Daten, Artikelnummern und Codes unverändert übernehmen.
- Keine Emojis. Keine Floskeln wie "Ich hoffe, diese Nachricht erreicht dich gut".`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte später erneut versuchen." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht. Bitte Credits aufladen." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("ai gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI-Gateway Fehler" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) {
      return new Response(JSON.stringify({ error: "Keine Antwort erhalten" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-write error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
