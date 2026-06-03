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

function isOrderMail(payload: any): boolean {
  const hash = String(payload?.MailboxHash || "").toLowerCase();
  if (hash === "orders" || hash === "order" || hash === "bestellung" || hash === "bestellungen") return true;
  const recipientFields = ["ToFull", "CcFull", "BccFull"];
  for (const f of recipientFields) {
    const arr = payload?.[f];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        const email = String(a?.Email || "").toLowerCase();
        if (/^(orders?|bestellung(en)?)[+@]/.test(email)) return true;
      }
    }
  }
  return false;
}

function isIssosMail(payload: any): boolean {
  // Strikte Erkennung: nur über MailboxHash oder explizite Empfänger-Adresse
  // (issos@… / aps-delta@…). Inhaltliche Heuristiken auf Subject/Body/Anhang
  // sind absichtlich entfernt – sonst landen reguläre Mails, in denen nur
  // das Wort "ISSOS" vorkommt, fälschlich im /issos-Archiv statt in MTIQ.
  const hash = String(payload?.MailboxHash || "").toLowerCase();
  if (hash === "issos" || hash === "aps-delta" || hash === "apsdelta" || hash === "aps_delta") return true;
  const recipientFields = ["ToFull", "CcFull", "BccFull"];
  for (const f of recipientFields) {
    const arr = payload?.[f];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        const email = String(a?.Email || "").toLowerCase();
        if (/^(issos|aps[-_.]?delta)[+@]/.test(email)) return true;
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

  // Order intake (own MailboxHash/address)
  if (isOrderMail(payload)) {
    try {
      const fwd = await fetch(`${SUPABASE_URL}/functions/v1/receive-email-order`, {
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
      console.error("forward to receive-email-order failed", e);
    }
  }

  // ISSOS / APS-Delta intake (own MailboxHash/address or strong heuristic on subject/attachments)
  if (isIssosMail(payload)) {
    try {
      const fwd = await fetch(`${SUPABASE_URL}/functions/v1/receive-email-issos`, {
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
      console.error("forward to receive-email-issos failed", e);
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

  // ===== AI-based content routing =====
  // Wenn keine explizite Adresse/Hash gegriffen hat, klassifiziert die KI den
  // Inhalt und leitet an die passende Intake-Funktion weiter. So können alle
  // Mails an mtiq@inbox.<domain> geschickt werden und werden trotzdem korrekt
  // verteilt (Vorgang, ISSOS, Versicherung, Bestellung). Bei "draft" oder bei
  // Fehlern fällt die Funktion auf das bestehende MTIQ-Draft-Verhalten zurück.
  const aiSubject: string = payload?.Subject || "";
  const aiBodyPlain: string = payload?.TextBody || "";
  const aiBodyHtml: string = payload?.HtmlBody || "";
  const aiBody = (aiBodyPlain || aiBodyHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 4000);
  const aiFromEmail: string = payload?.FromFull?.Email || payload?.From || "";
  const aiAttachments: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];
  const aiAttachmentNames = aiAttachments.map((a) => String(a?.Name || "")).filter(Boolean).join(", ").slice(0, 500);

  let aiRoute: "case" | "issos" | "insurance" | "order" | "draft" = "draft";
  if (LOVABLE_API_KEY) {
    try {
      const routerPrompt = `Du bist der Posteingangs-Router von MtCon. Klassifiziere eingehende E-Mails in genau EINE Kategorie:

- "issos": APS-Delta-Inputs, ISSOS-PRO/RKS-Berichte, MSL-/Forecast-Listen von APS (Automotive Production Solutions). Typisch: Anhänge oder Inhalt zu Delta-Mengen, Lieferplänen, MSL, Forecast je Werk.
- "insurance": Versicherungspolicen, Schadenfälle, Prämienrechnungen, Versicherungs-Korrespondenz.
- "order": Eingehende Kundenbestellungen, Auftragsbestätigungen, Bestellungen von Lieferanten an uns.
- "case": Konkrete Anfrage/Problem/Aufgabe, die als interner Vorgang (Ticket) bearbeitet werden soll (Reklamation, technische Anfrage, Angebot etc.).
- "draft": Wenn unklar oder keine der obigen Kategorien klar zutrifft.

Antworte NUR mit JSON: {"route":"case|issos|insurance|order|draft","confidence":0.0-1.0,"reason":"kurz"}`;
      const userPrompt = `Absender: ${aiFromEmail}
Betreff: ${aiSubject}
Anhänge: ${aiAttachmentNames || "(keine)"}
Body:
${aiBody || "(leer)"}`;
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: routerPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const raw = j?.choices?.[0]?.message?.content ?? "{}";
        const parsedRoute = typeof raw === "string" ? JSON.parse(raw) : raw;
        const route = String(parsedRoute?.route || "").toLowerCase();
        const conf = Number(parsedRoute?.confidence ?? 0);
        if (["case", "issos", "insurance", "order", "draft"].includes(route) && conf >= 0.6) {
          aiRoute = route as typeof aiRoute;
        }
        console.log("AI-Router:", { route, conf, reason: parsedRoute?.reason });
      } else {
        console.error("AI router error", r.status, await r.text());
      }
    } catch (e) {
      console.error("AI router failed", e);
    }
  }

  const routeTo: Record<string, string | null> = {
    case: "receive-email",
    issos: "receive-email-issos",
    insurance: "receive-email-insurance",
    order: "receive-email-order",
    draft: null,
  };
  const targetFn = routeTo[aiRoute];
  // WICHTIG: "case" nur weiterleiten, wenn auch eine Vorgangsnummer (VOR-YYYY-NNNN)
  // existiert – sonst verwirft receive-email die Mail still ("no case_no found").
  // Neue/unbekannte Vorgänge fallen stattdessen auf die MTIQ-Draft-Erstellung zurück.
  if (targetFn && aiRoute !== "case") {
    try {
      const fwd = await fetch(`${SUPABASE_URL}/functions/v1/${targetFn}`, {
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
      console.error(`AI-Router forward to ${targetFn} failed`, e);
    }
  }
  if (targetFn && aiRoute === "case") {
    console.log("AI-Router: 'case' ohne VOR-Nummer → fällt auf MTIQ-Draft zurück");
  }



  const messageId: string | null = payload?.MessageID || payload?.MessageId || null;
  const fromEmail: string = payload?.FromFull?.Email || payload?.From || "unknown@unknown";
  const fromName: string | null = payload?.FromFull?.Name || null;
  const subject: string = payload?.Subject || "(kein Betreff)";
  const bodyPlain: string = payload?.TextBody || "";
  const bodyHtml: string = payload?.HtmlBody || "";
  const emailBody = bodyPlain || bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // ===== Intelligent Inbox (Step 3): if mail has a PDF attachment, also create
  // an inbox_documents entry and trigger classification. Runs in parallel to the
  // legacy MTIQ draft creation below so nothing changes for existing flows.
  try {
    const attachments: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];
    const pdfAtt = attachments.find((a) =>
      String(a?.ContentType || "").toLowerCase().includes("pdf") ||
      String(a?.Name || "").toLowerCase().endsWith(".pdf")
    );
    if (pdfAtt && pdfAtt.Content) {
      const bin = atob(pdfAtt.Content);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const safeName = String(pdfAtt.Name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await admin.storage.from("inbox-documents").upload(storagePath, bytes, {
        contentType: pdfAtt.ContentType || "application/pdf", upsert: false,
      });
      if (upErr) {
        console.error("inbox-documents upload failed", upErr);
      } else {
        const { data: ins, error: insErr } = await admin.from("inbox_documents").insert({
          received_at: new Date().toISOString(),
          from_email: fromEmail, from_name: fromName, subject,
          raw_email_id: messageId, storage_path: storagePath, filename: safeName,
          status: "needs_triage",
        }).select("id").single();
        if (insErr) {
          console.error("inbox_documents insert failed", insErr);
        } else if (ins?.id) {
          // Fire & forget classification
          fetch(`${SUPABASE_URL}/functions/v1/classify-inbox-document`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
            body: JSON.stringify({ inbox_document_id: ins.id }),
          }).catch((e) => console.error("classify fire-and-forget failed", e));
        }
      }
    }
  } catch (e) {
    console.error("inbox intake failed", e);
  }

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

  // ===== Persist trigger email + its attachments on the draft, so they can be
  // forwarded to the Vorgang on approval and shown in the draft review UI.
  try {
    const draftId = inserted.id as string;
    const attachments: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];

    // a) Each original attachment as a separate file
    for (const att of attachments) {
      try {
        const name: string = att?.Name || "anhang.bin";
        const mime: string = att?.ContentType || "application/octet-stream";
        const content: string = att?.Content || "";
        if (!content) continue;
        const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
        const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${draftId}/attachments/${Date.now()}-${safe}`;
        const { error: upErr } = await admin.storage
          .from("mtiq-draft-attachments")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) { console.error("draft attachment upload failed", upErr.message); continue; }
        await admin.from("mtiq_draft_attachments").insert({
          draft_id: draftId,
          file_name: name,
          mime_type: mime,
          size_bytes: bytes.byteLength,
          storage_path: path,
          source: "email_attachment",
        });
      } catch (e) {
        console.error("draft attachment error", e);
      }
    }

    // b) The trigger email itself as a single .eml-style snapshot file
    try {
      const headerLines = [
        `From: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
        `Subject: ${subject}`,
        `Date: ${payload?.Date || new Date().toUTCString()}`,
        messageId ? `Message-ID: ${messageId}` : null,
        "Content-Type: text/plain; charset=utf-8",
        "",
      ].filter(Boolean).join("\r\n");
      const emlContent = headerLines + "\r\n" + (bodyPlain || bodyHtml || "");
      const emlBytes = new TextEncoder().encode(emlContent);
      const safeSubject = (subject || "trigger-email").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const emlPath = `${draftId}/trigger/${Date.now()}-${safeSubject}.eml`;
      const { error: emlErr } = await admin.storage
        .from("mtiq-draft-attachments")
        .upload(emlPath, emlBytes, { contentType: "message/rfc822", upsert: false });
      if (emlErr) {
        console.error("trigger eml upload failed", emlErr.message);
      } else {
        await admin.from("mtiq_draft_attachments").insert({
          draft_id: draftId,
          file_name: `Trigger-E-Mail – ${safeSubject}.eml`,
          mime_type: "message/rfc822",
          size_bytes: emlBytes.byteLength,
          storage_path: emlPath,
          source: "trigger_email",
        });
      }
    } catch (e) {
      console.error("trigger eml error", e);
    }
  } catch (e) {
    console.error("draft attachment persistence failed", e);
  }


  return new Response(JSON.stringify({ status: "ok", draft_id: inserted.id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
