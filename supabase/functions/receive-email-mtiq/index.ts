// Postmark Inbound Webhook -> MTIQ Posteingang (creates mtiq_drafts via AI)
// Auth: Basic Auth (username "postmark", password = POSTMARK_WEBHOOK_SECRET)
// URL pattern in Postmark:
//   https://postmark:<POSTMARK_WEBHOOK_SECRET>@<project>.supabase.co/functions/v1/receive-email-mtiq
//
// Route any incoming email at e.g. mtiq@inbox.<domain> here. Anything that contains
// a VOR-YYYY-NNNN case number is still forwarded to the existing receive-email flow
// (so users can also send case mails to this same inbox). Everything else becomes a draft.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("POSTMARK_WEBHOOK_SECRET")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const SYSTEM_PROMPT = `You are MTIQ, the internal AI assistant for MtCon, a PCB connector distributor.
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
    { "title": "Task title", "department": "Responsible department", "assignee_hint": "Role or name hint, or null", "due_date": "YYYY-MM-DD or null" }
  ],
  "reasoning": "2-3 sentences explaining why you structured it this way"
}

Rules:
- All text fields in German.
- Tasks must be sequential and actionable.
- Maximum 8 tasks.
- Be specific, not generic.`;

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { ...corsHeaders, "WWW-Authenticate": 'Basic realm="postmark"' },
  });
}

function checkAuth(req: Request): boolean {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("basic ")) return false;
  try {
    const decoded = atob(h.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx === -1) return false;
    const pass = decoded.slice(idx + 1);
    return pass === WEBHOOK_SECRET && WEBHOOK_SECRET.length > 0;
  } catch {
    return false;
  }
}

function hasCaseNo(payload: any): boolean {
  const re = /VOR-\d{4}-\d{4,}/i;
  const fields = ["ToFull", "CcFull", "BccFull"];
  for (const f of fields) {
    const arr = payload?.[f];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        const email: string = a?.Email || "";
        if (re.test(email)) return true;
      }
    }
  }
  if (re.test(payload?.MailboxHash || "")) return true;
  if (re.test(payload?.Subject || "")) return true;
  return false;
}

function isInsuranceMail(payload: any): boolean {
  const hash = String(payload?.MailboxHash || "").toLowerCase();
  if (hash === "insurance" || hash === "versicherung") return true;
  const recipientFields = ["ToFull", "CcFull", "BccFull"];
  for (const f of recipientFields) {
    const arr = payload?.[f];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        const email = String(a?.Email || "").toLowerCase();
        if (/^(insurance|versicherung)[+@]/.test(email)) return true;
      }
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (!checkAuth(req)) return unauthorized();

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  // Insurance intake takes precedence (own MailboxHash/address)
  if (isInsuranceMail(payload)) {
    try {
      const fwd = await fetch(`${SUPABASE_URL}/functions/v1/receive-email-insurance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: req.headers.get("authorization") || "",
        },
        body: JSON.stringify(payload),
      });
      const text = await fwd.text();
      return new Response(text, { status: fwd.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      console.error("forward to receive-email-insurance failed", e);
    }
  }

  // If this looks like a case email, forward to the case intake function
  if (hasCaseNo(payload)) {
    try {
      const fwd = await fetch(`${SUPABASE_URL}/functions/v1/receive-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // forward original Basic Auth header
          authorization: req.headers.get("authorization") || "",
        },
        body: JSON.stringify(payload),
      });
      const text = await fwd.text();
      return new Response(text, { status: fwd.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      console.error("forward to receive-email failed", e);
    }
  }

  const messageId: string | null = payload?.MessageID || payload?.MessageId || null;
  const fromEmail: string = payload?.FromFull?.Email || payload?.From || "unknown@unknown";
  const fromName: string | null = payload?.FromFull?.Name || null;
  const subject: string = payload?.Subject || "(kein Betreff)";
  const bodyPlain: string = payload?.TextBody || "";
  const bodyHtml: string = payload?.HtmlBody || "";
  const emailBody = bodyPlain || bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Dedup by message_id
  if (messageId) {
    const { data: existing } = await admin
      .from("mtiq_drafts")
      .select("id")
      .eq("source_email_message_id", messageId)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ status: "duplicate", id: existing.id }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // AI extraction
  let parsed: any = {};
  if (LOVABLE_API_KEY) {
    try {
      const userPrompt = `Forwarded email to analyze:

From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}
Subject: ${subject}
Body:
${emailBody || "(empty)"}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (aiResp.ok) {
        const aiJson = await aiResp.json();
        const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
        try {
          parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          const m = String(raw).match(/\{[\s\S]*\}/);
          if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
        }
      } else {
        console.error("AI gateway error", aiResp.status, await aiResp.text());
      }
    } catch (e) {
      console.error("AI extraction failed", e);
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

  // Resolve sender email → internal user id so RLS restricts the draft to its owner
  let createdBy: string | null = null;
  try {
    const { data: uid } = await admin.rpc("user_id_by_email", { p_email: fromEmail });
    if (typeof uid === "string") createdBy = uid;
  } catch (e) {
    console.error("user_id_by_email lookup failed", e);
  }

  const { data: inserted, error } = await admin.from("mtiq_drafts").insert({
    created_by: createdBy,
    source_email_from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    source_email_subject: subject,
    source_email_body: emailBody,
    source_email_message_id: messageId,
    draft_title: String(parsed?.title ?? "").slice(0, 500) || subject || "(ohne Titel)",
    draft_description: String(parsed?.description ?? "") || emailBody || "",
    draft_department: parsed?.department ? String(parsed.department).slice(0, 120) : null,
    draft_priority: priority,
    draft_due_date: dueDate,
    draft_tasks: tasks,
    mtiq_reasoning: String(parsed?.reasoning ?? "") || null,
    status: "pending",
  }).select("id").single();

  if (error) {
    console.error("mtiq draft insert failed", error);
    return new Response(JSON.stringify({ error: "insert_failed", detail: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ status: "ok", draft_id: inserted.id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
