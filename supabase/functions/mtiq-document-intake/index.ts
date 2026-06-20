// MTIQ Document/Scan Intake
// Accepts a PDF/image file uploaded from the MTIQ widget, classifies it
// (Versicherung, Lieferschein, Anfrage, Bestellung, Sonstiges), extracts
// structured fields and creates an mtiq_drafts row + attachment.
//
// Multipart form fields:
//   file:   the binary (PDF or image)
//   hint:   optional free text from the user (context, title)
//
// Returns: { draft: mtiq_draft_row, classification, routing_suggestion }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Chunked base64 encoding — avoids O(n^2) string concat & stack overflow on large files.
function bufferToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000; // 32 KB
  let bin = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

const SYSTEM_PROMPT = `Du bist MTIQ, der interne KI-Assistent von MtCon (PCB-Steckverbinder-Distributor).
Du erhältst ein eingescanntes Dokument oder PDF (auch handgeschrieben). Analysiere es vollständig (OCR + Inhalt) und ordne es ein.

Mögliche Dokumentklassen (doc_classification):
- "Versicherung"   : Versicherungsschein, Police, Beitragsrechnung, Kfz-Versicherung, Haftpflicht usw.
- "Lieferschein"   : Lieferschein einer Warenlieferung AN uns (Wareneingang).
- "Anfrage"        : Kundenanfrage / RFQ / Angebotsanforderung.
- "Bestellung"     : Kundenbestellung / Auftrag / Purchase Order.
- "Sonstiges"      : alles andere.

Routing-Vorschlag (routing_suggestion):
- "dokument_ablegen" : Wenn es sich primär um ein abzulegendes Dokument handelt (z. B. Versicherung).
- "vorgang_anlegen"  : Wenn ein interner Vorgang nötig ist (z. B. Anfrage, Bestellung).
- "beides"           : Wenn das Dokument abgelegt UND ein Vorgang angelegt werden soll (z. B. Lieferschein → Wareneingang + Ablage).
- "unklar"           : Wenn nicht eindeutig.

MtCon Abteilungen: Vertrieb, Einkauf, Lager, Technik, Konstruktion, Verwaltung, Geschäftsführung.

Gib AUSSCHLIESSLICH valides JSON exakt in dieser Struktur zurück:
{
  "doc_classification": "Versicherung|Lieferschein|Anfrage|Bestellung|Sonstiges",
  "routing_suggestion": "dokument_ablegen|vorgang_anlegen|beides|unklar",
  "title": "kurzer aussagekräftiger Titel",
  "description": "neutrale Zusammenfassung (3-6 Sätze)",
  "department": "primär zuständige Abteilung",
  "priority": "Niedrig|Mittel|Hoch|Kritisch",
  "due_date": "YYYY-MM-DD oder null",
  "extracted_fields": {
    "absender": "Firma/Person oder null",
    "dokumentnummer": "z.B. Lieferschein-/Bestell-/Polizzennr. oder null",
    "datum": "YYYY-MM-DD oder null",
    "betrag": "Betrag inkl. Währung oder null",
    "positionen": [{"artikel":"...","menge":"...","einheit":"..."}],
    "weitere": {}
  },
  "tasks": [
    {"title":"...","department":"...","assignee_hint":null,"due_date":null}
  ],
  "reasoning": "1-2 Sätze: woran du die Klassifikation festmachst"
}

Regeln:
- Alle Texte auf Deutsch.
- Wenn unsicher → "Sonstiges" + "unklar".
- Bei "dokument_ablegen": maximal 1-2 Tasks oder leeres Array.
- Bei "vorgang_anlegen" / "beides": bis zu 6 konkrete Tasks.
- Keine Floskeln, keine Emojis, sachlich.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const creatorId = userRes.user.id;

    const form = await req.formData();
    const file = form.get("file");
    const hint = String(form.get("hint") ?? "").trim();
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "file required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Datei zu groß (max. 20 MB)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mime = file.type || "application/octet-stream";
    const buf = new Uint8Array(await file.arrayBuffer());
    const b64 = bufferToBase64(buf);

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve creator label
    let creatorName = "Mitarbeiter";
    try {
      const { data: prof } = await admin
        .from("users_profile")
        .select("display_name, short_code")
        .eq("id", creatorId)
        .maybeSingle();
      if (prof) creatorName = prof.display_name || prof.short_code || creatorName;
    } catch (_) { /* ignore */ }

    // Build multimodal user message
    const contentBlocks: any[] = [
      { type: "text", text: hint
        ? `Hinweis vom Mitarbeiter (${creatorName}):\n${hint}\n\nAnalysiere das beigefügte Dokument.`
        : `Analysiere das beigefügte Dokument vollständig.` },
    ];
    if (mime.startsWith("image/")) {
      contentBlocks.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${b64}` },
      });
    } else {
      // PDF or other document → file block
      contentBlocks.push({
        type: "file",
        file: {
          filename: file.name || "document.pdf",
          file_data: `data:${mime || "application/pdf"};base64,${b64}`,
        },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contentBlocks },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      return new Response(JSON.stringify({
        error: aiResp.status === 429 ? "Zu viele Anfragen." : "AI-Guthaben aufgebraucht.",
      }), { status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
    }

    const CLASSES = ["Versicherung", "Lieferschein", "Anfrage", "Bestellung", "Sonstiges"];
    const ROUTES = ["dokument_ablegen", "vorgang_anlegen", "beides", "unklar"];
    const PRIORITIES = ["Niedrig", "Mittel", "Hoch", "Kritisch"];

    const doc_classification = CLASSES.includes(parsed?.doc_classification) ? parsed.doc_classification : "Sonstiges";
    const routing_suggestion = ROUTES.includes(parsed?.routing_suggestion) ? parsed.routing_suggestion : "unklar";
    const priority = PRIORITIES.includes(parsed?.priority) ? parsed.priority : "Mittel";
    const due_date = parsed?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date) ? parsed.due_date : null;
    const title = String(parsed?.title ?? "").slice(0, 500) || (hint ? hint.slice(0, 200) : file.name || "Scan");
    const description = String(parsed?.description ?? "") || hint || "";

    const tasks = Array.isArray(parsed?.tasks)
      ? parsed.tasks.slice(0, 8).map((t: any) => ({
          title: String(t?.title ?? "").slice(0, 300),
          department: t?.department ? String(t.department).slice(0, 120) : null,
          assignee_hint: t?.assignee_hint ? String(t.assignee_hint).slice(0, 120) : null,
          assignee_id: null,
          due_date: t?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
        })).filter((t: any) => t.title)
      : [];

    const extracted_fields = (parsed?.extracted_fields && typeof parsed.extracted_fields === "object")
      ? parsed.extracted_fields : {};

    const originalSnapshot = {
      title, description, department: parsed?.department ?? null,
      priority, due_date, tasks,
      doc_classification, routing_suggestion, extracted_fields,
    };

    // Insert draft
    const { data: inserted, error: insErr } = await admin.from("mtiq_drafts").insert({
      created_by: creatorId,
      source_email_from: `Scan · ${creatorName}`,
      source_email_subject: hint || file.name || "Scan-Upload",
      source_email_body: hint || null,
      draft_title: title,
      draft_description: description,
      draft_department: parsed?.department ? String(parsed.department).slice(0, 120) : null,
      draft_priority: priority,
      draft_due_date: due_date,
      draft_tasks: tasks,
      mtiq_reasoning: String(parsed?.reasoning ?? "") || null,
      status: "pending",
      doc_classification,
      routing_suggestion,
      extracted_fields,
      source_kind: "scan",
      original_snapshot: originalSnapshot,
    }).select().single();
    if (insErr) throw insErr;

    // Upload file as draft attachment
    try {
      const safe = (file.name || "scan.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${creatorId}/${inserted.id}/${Date.now()}-${safe}`;
      const up = await admin.storage.from("mtiq-draft-attachments").upload(path, buf, {
        contentType: mime, upsert: false,
      });
      if (up.error) {
        console.error("attachment upload failed", up.error.message);
      } else {
        await admin.from("mtiq_draft_attachments").insert({
          draft_id: inserted.id,
          file_name: file.name || "scan.bin",
          mime_type: mime,
          size_bytes: buf.length,
          storage_path: path,
        });
      }
    } catch (e) {
      console.error("attachment persist error", e);
    }

    return new Response(JSON.stringify({
      draft: inserted,
      doc_classification,
      routing_suggestion,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mtiq-document-intake error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
