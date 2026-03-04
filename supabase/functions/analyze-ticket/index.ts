import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const conversationText = messages?.map((m: any) =>
      `[${m.sender_type === 'customer' ? 'Kunde' : 'Mitarbeiter'}${m.is_internal ? ' (intern)' : ''}]: ${m.body}`
    ).join('\n') || '';

    const prompt = `Analysiere folgendes Support-Ticket und antworte ausschließlich auf Deutsch.

Titel: ${title}
Beschreibung: ${description}

Gesprächsverlauf:
${conversationText || 'Kein Verlauf vorhanden.'}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Du bist ein Support-Analyse-Assistent. Analysiere Support-Tickets und gib strukturierte Ergebnisse zurück. Antworte immer auf Deutsch."
          },
          { role: "user", content: prompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_ticket",
            description: "Gibt eine strukturierte Analyse eines Support-Tickets zurück.",
            parameters: {
              type: "object",
              properties: {
                sentiment: {
                  type: "string",
                  enum: ["Positiv", "Neutral", "Negativ", "Frustriert"],
                  description: "Stimmung des Kunden"
                },
                suggested_priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "critical"],
                  description: "Empfohlene Priorität"
                },
                category: {
                  type: "string",
                  description: "Kategorie des Tickets, z.B. 'Technisch', 'Abrechnung', 'Allgemein', 'Fehler'"
                },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 relevante Schlüsselwörter"
                },
                suggested_response: {
                  type: "string",
                  description: "Vorgeschlagene Antwort an den Kunden auf Deutsch"
                }
              },
              required: ["sentiment", "suggested_priority", "category", "keywords", "suggested_response"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "analyze_ticket" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte versuche es später erneut." }), {
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
    if (!toolCall) throw new Error("Keine Analyse erhalten");

    const analysis = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-ticket error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
