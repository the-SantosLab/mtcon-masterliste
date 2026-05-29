import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein interner Bug- und Feedback-Triage-Assistent für die MTCON Masterliste (MSL).
Bewerte interne Meldungen (Bug, Idee, Frage, Sonstiges) sachlich, neutral und im Banking-Standard-Ton.
Antworte ausschließlich auf Deutsch und niemals mit Emojis.`;

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
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error: tErr } = await admin
      .from("support_tickets")
      .select("id, ticket_number, title, description, kind, priority, source, reporter_user_id, route, client_meta, case_id, created_at")
      .eq("id", ticket_id)
      .maybeSingle();
    if (tErr || !ticket) throw new Error("Ticket nicht gefunden");
    if (ticket.source !== "intern") {
      return new Response(JSON.stringify({ error: "Nur interne Tickets" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorisierung: Reporter selbst oder Admin
    if (ticket.reporter_user_id !== userId) {
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", userId).in("role", ["admin"]);
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Mögliche Duplikate (letzte 90 Tage, ähnliche Begriffe im Titel)
    const titleTokens = (ticket.title || "")
      .split(/\s+/)
      .map((s) => s.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((s) => s.length >= 4)
      .slice(0, 4);
    let candidates: any[] = [];
    if (titleTokens.length > 0) {
      const orClauses = titleTokens.map((t) => `title.ilike.%${t}%`).join(",");
      const { data: dupes } = await admin
        .from("support_tickets")
        .select("id, ticket_number, title, status, created_at")
        .eq("source", "intern")
        .neq("id", ticket_id)
        .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .or(orClauses)
        .order("created_at", { ascending: false })
        .limit(20);
      candidates = dupes || [];
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY nicht konfiguriert");

    const userPrompt = `Interne Meldung in der MSL:

Art (gemeldet): ${ticket.kind}
Schweregrad (gemeldet): ${ticket.priority}
Titel: ${ticket.title}
Beschreibung:
${ticket.description}

Route: ${ticket.route ?? "—"}
Bezug zu Vorgang: ${ticket.case_id ? "ja" : "nein"}
Client-Meta (Auszug): ${JSON.stringify({
      userAgent: ticket.client_meta?.userAgent,
      viewport: ticket.client_meta?.viewport,
      lastConsoleErrors: (ticket.client_meta?.lastConsoleErrors ?? []).slice(0, 3),
    })}

Mögliche Duplikate (letzte 90 Tage, gleiche Quelle):
${candidates.length > 0 ? candidates.map((c) => `- ${c.ticket_number} (${c.status}): ${c.title}`).join("\n") : "Keine Kandidaten gefunden."}

Bitte triagiere die Meldung und gib eine sachliche Einschätzung zurück.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "triage_internal_ticket",
            description: "Strukturierte Triage einer internen Bug-/Feedback-Meldung.",
            parameters: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["bug", "idee", "frage", "sonstige"], description: "Vom Modell vorgeschlagene Art" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Vorgeschlagener Schweregrad" },
                module: { type: "string", description: "Betroffenes Modul/Bereich der MSL (z. B. Kanban, Vorgangs-Detail, CRM, Portal, Admin)" },
                summary: { type: "string", description: "Kurze sachliche Zusammenfassung (max 240 Zeichen)" },
                possible_duplicates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticket_number: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["ticket_number", "reason"],
                    additionalProperties: false,
                  },
                  description: "Ausgewählte Duplikat-Kandidaten aus der vorgegebenen Liste, optional",
                },
                suggested_next_step: { type: "string", description: "Empfohlener nächster Schritt für den Admin" },
              },
              required: ["kind", "severity", "module", "summary", "suggested_next_step"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "triage_internal_ticket" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Guthaben aufgebraucht" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI-Gateway Fehler");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Keine Triage erhalten");
    const triage = JSON.parse(toolCall.function.arguments);

    const aiTriage = {
      ...triage,
      analyzed_at: new Date().toISOString(),
      candidates_considered: candidates.map((c) => c.ticket_number),
      model: "google/gemini-2.5-flash",
    };

    await admin
      .from("support_tickets")
      .update({ ai_triage: aiTriage })
      .eq("id", ticket_id);

    return new Response(JSON.stringify({ ok: true, ai_triage: aiTriage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-internal-ticket error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
