import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Du bist ein Assistent, der Versicherungspolicen, Verträge und ähnliche Dokumente analysiert und die strukturierten Daten in deutscher Sprache extrahiert. Antworte ausschließlich über das bereitgestellte Tool. Fülle nur Felder, deren Wert eindeutig im Dokument enthalten ist – setze ansonsten null. Datumswerte im Format YYYY-MM-DD. Beträge ohne Währungssymbol als Zahl. premium_interval einer von: monthly, quarterly, yearly, one_time. status standardmäßig active. tags sind eine kurze Liste mit max. 5 prägnanten Schlagwörtern.`;

const extractTool = {
  type: "function",
  function: {
    name: "fill_policy_form",
    description: "Fülle die Felder eines Versicherungs-/Vertragsformulars aus dem analysierten Dokument.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: ["string", "null"], description: "Bezeichnung / Titel der Police bzw. des Dokuments" },
        provider: { type: ["string", "null"], description: "Versicherer / Anbieter / Vertragspartner" },
        policy_number: { type: ["string", "null"], description: "Policen- oder Vertragsnummer" },
        description: { type: ["string", "null"], description: "Kurze Beschreibung (1-2 Sätze)" },
        insured_object: { type: ["string", "null"], description: "Versichertes Objekt / Risiko" },
        start_date: { type: ["string", "null"], description: "Beginn (YYYY-MM-DD)" },
        end_date: { type: ["string", "null"], description: "Ende (YYYY-MM-DD)" },
        renewal_date: { type: ["string", "null"], description: "Nächster Verlängerungstermin (YYYY-MM-DD)" },
        notice_period_days: { type: ["integer", "null"], description: "Kündigungsfrist in Tagen" },
        premium_amount: { type: ["number", "null"], description: "Prämie als Zahl" },
        premium_currency: { type: ["string", "null"], description: "ISO-Währungscode, z.B. EUR" },
        premium_interval: { type: ["string", "null"], enum: ["monthly", "quarterly", "yearly", "one_time", null] },
        contact_name: { type: ["string", "null"] },
        contact_email: { type: ["string", "null"] },
        contact_phone: { type: ["string", "null"] },
        notes: { type: ["string", "null"], description: "Sonstige relevante Hinweise" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: [],
    },
  },
} as const;

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

    const { file_base64, mime_type, file_name } = await req.json();
    if (!file_base64 || typeof file_base64 !== "string") {
      return new Response(JSON.stringify({ error: "Keine Datei übergeben" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mt = (mime_type || "application/pdf") as string;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const dataUrl = `data:${mt};base64,${file_base64}`;

    const userContent: any[] = [
      { type: "text", text: `Analysiere das folgende Dokument${file_name ? ` (${file_name})` : ""} und extrahiere alle erkennbaren Felder über das Tool 'fill_policy_form'. Falls etwas unklar ist, setze den Wert auf null.` },
    ];
    if (mt === "application/pdf") {
      userContent.push({ type: "file", file: { filename: file_name || "document.pdf", file_data: dataUrl } });
    } else if (mt.startsWith("image/")) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      // Try as image fallback
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [extractTool],
        tool_choice: { type: "function", function: { name: "fill_policy_form" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let extracted: Record<string, unknown> = {};
    if (toolCall?.function?.arguments) {
      try { extracted = JSON.parse(toolCall.function.arguments); }
      catch (e) { console.error("Tool args parse error", e); }
    } else {
      // Fallback: try to parse content as JSON
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) { try { extracted = JSON.parse(match[0]); } catch {} }
      }
    }

    return new Response(JSON.stringify({ fields: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-policy-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
