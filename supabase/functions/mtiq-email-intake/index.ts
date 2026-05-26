// MTIQ Email-to-Vorgang intake: takes a forwarded email (from/subject/body),
// asks Lovable AI for a structured draft (with similar-case context + correction
// few-shots), runs duplicate detection, and stores everything in mtiq_drafts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getSimilarCases, similarCasesPromptBlock,
  getRecentCorrections, correctionsPromptBlock,
  findDuplicate,
} from "../_shared/mtiq-context.ts";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mtiq-webhook-secret",
};

const DEFAULT_EMAIL_INTAKE_PROMPT = `You are MTIQ, the internal AI assistant for MtCon, a PCB connector distributor.
You receive forwarded emails and must extract a structured Vorgang (case/project) from them.

MtCon departments: Vertrieb, Einkauf, Lager, Technik, Konstruktion, Verwaltung, Geschäftsführung

Analyze the email and return ONLY valid JSON with this exact structure:
{
  "title": "Short, clear Vorgang title",
  "description": "Full context description for the Vorgang",
  "department": "Primary responsible department",
  "priority": "Niedrig|Mittel|Hoch|Kritisch",
  "due_date": "YYYY-MM-DD or null",
  "tasks": [
    {
      "title": "Task title",
      "department": "Responsible department",
      "assignee_hint": "Role or name hint, or null",
      "due_date": "YYYY-MM-DD or null"
    }
  ],
  "reasoning": "2-3 sentences explaining why you structured it this way"
}

Rules:
- All text fields in German.
- Tasks must be sequential and actionable.
- Maximum 8 tasks.
- Be specific, not generic.
- If the email is unclear, still make a best attempt and note uncertainty in the reasoning.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const webhookSecretHeader = req.headers.get("x-mtiq-webhook-secret") ?? "";
    const webhookSecret = Deno.env.get("MTIQ_EMAIL_WEBHOOK_SECRET") ?? "";

    let creatorId: string | null = null;

    if (webhookSecret && webhookSecretHeader && webhookSecretHeader === webhookSecret) {
      // accepted as webhook
    } else {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes } = await userClient.auth.getUser();
      if (!userRes?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      creatorId = userRes.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const from = String(body.from ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const emailBody = String(body.body ?? "").trim();

    if (!subject && !emailBody) {
      return new Response(JSON.stringify({ error: "subject or body required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Context retrieval (parallel)
    const searchBlob = `${subject} ${emailBody}`;
    const [similar, corrections] = await Promise.all([
      getSimilarCases(supabaseUrl, serviceKey, searchBlob, 20),
      getRecentCorrections(supabaseUrl, serviceKey, 5),
    ]);

    const basePrompt = await loadPrompt("mtiq_email_intake", DEFAULT_EMAIL_INTAKE_PROMPT);
    const augmentedSystem =
      basePrompt +
      similarCasesPromptBlock(similar) +
      correctionsPromptBlock(corrections);

    const userPrompt = `Forwarded email to analyze:

From: ${from || "(unknown)"}
Subject: ${subject || "(no subject)"}
Body:
${emailBody || "(empty)"}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: augmentedSystem },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
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
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("Parse error", e, raw);
      const match = String(raw).match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = {}; }
      }
    }

    const priorityAllowed = ["Niedrig", "Mittel", "Hoch", "Kritisch"];
    const priority = priorityAllowed.includes(parsed?.priority) ? parsed.priority : "Mittel";
    const dueDate = parsed?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date) ? parsed.due_date : null;

    const tasks = Array.isArray(parsed?.tasks)
      ? parsed.tasks.slice(0, 8).map((t: any) => ({
          title: String(t?.title ?? "").slice(0, 300),
          department: t?.department ? String(t.department).slice(0, 120) : null,
          assignee_hint: t?.assignee_hint ? String(t.assignee_hint).slice(0, 120) : null,
          due_date: t?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
        })).filter((t: any) => t.title)
      : [];

    const draftTitle = String(parsed?.title ?? "").slice(0, 500) || subject || "(ohne Titel)";
    const duplicate = findDuplicate(similar, { title: draftTitle });

    const originalSnapshot = {
      title: draftTitle,
      description: String(parsed?.description ?? "") || emailBody,
      department: parsed?.department ?? null,
      priority,
      due_date: dueDate,
      tasks,
    };

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: inserted, error } = await admin.from("mtiq_drafts").insert({
      created_by: creatorId,
      source_email_from: from || null,
      source_email_subject: subject || null,
      source_email_body: emailBody || null,
      draft_title: draftTitle,
      draft_description: String(parsed?.description ?? "") || emailBody || "",
      draft_department: parsed?.department ? String(parsed.department).slice(0, 120) : null,
      draft_priority: priority,
      draft_due_date: dueDate,
      draft_tasks: tasks,
      mtiq_reasoning: String(parsed?.reasoning ?? "") || null,
      status: "pending",
      possible_duplicate_of: duplicate?.id ?? null,
      original_snapshot: originalSnapshot,
    }).select().single();

    if (error) throw error;

    return new Response(JSON.stringify({ draft: inserted, duplicate }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-email-intake error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
