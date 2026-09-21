// MTIQ PDF-Übersetzung
// Nimmt ein PDF (multipart, Feld "file") entgegen und liefert den vollständigen
// Inhalt strukturiert und übersetzt zurück (Standard: Deutsch).
// Das eigentliche PDF wird clientseitig daraus erzeugt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function bufferToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const form = await req.formData();
    const file = form.get("file");
    const targetLang = String(form.get("target_lang") ?? "Deutsch").trim().slice(0, 60) || "Deutsch";
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
    const mime = file.type || "application/pdf";
    if (mime !== "application/pdf") {
      return new Response(JSON.stringify({ error: "Nur PDF-Dateien werden unterstützt." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const b64 = bufferToBase64(buf);

    const system = `Du bist MTIQ, der interne KI-Assistent von MtCon. Du erhältst ein PDF-Dokument.
Aufgabe: Lies den gesamten Textinhalt und übersetze ihn vollständig und sinngemäß nach ${targetLang}.

Regeln:
- Übersetze ALLE relevanten Textinhalte, keine Auslassungen, keine Zusammenfassung.
- Tabellen und Aufzählungen gibst du als strukturierte Absätze wieder (z. B. "Pos. 1: Artikel X, Menge 5, Preis 10 EUR").
- Fachbegriffe (Elektrotechnik/Steckverbinder) korrekt übersetzen; Eigennamen, Artikelnummern, Normen und Maße unverändert lassen.
- Sachlicher, neutraler Ton. Keine Emojis, keine Kommentare.

Gib AUSSCHLIESSLICH valides JSON in dieser Struktur zurück:
{
  "title": "übersetzter Dokumenttitel",
  "source_language": "erkannte Ausgangssprache (z. B. Englisch)",
  "sections": [
    { "heading": "Abschnittsüberschrift oder leer", "paragraphs": ["Absatz 1", "Absatz 2"] }
  ]
}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: `Übersetze das beigefügte Dokument vollständig nach ${targetLang}.` },
              { type: "file", file: { filename: file.name || "document.pdf", file_data: `data:${mime};base64,${b64}` } },
            ],
          },
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

    const sections = Array.isArray(parsed?.sections)
      ? parsed.sections.slice(0, 80).map((s: any) => ({
          heading: String(s?.heading ?? "").slice(0, 300),
          paragraphs: Array.isArray(s?.paragraphs)
            ? s.paragraphs.slice(0, 60).map((p: any) => String(p ?? "").slice(0, 4000)).filter(Boolean)
            : [],
        })).filter((s: any) => s.heading || s.paragraphs.length)
      : [];

    if (!sections.length) {
      return new Response(JSON.stringify({ error: "Kein übersetzbarer Text im Dokument gefunden." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      title: String(parsed?.title ?? "").slice(0, 300) || file.name || "Übersetzung",
      source_language: String(parsed?.source_language ?? "").slice(0, 60) || null,
      target_language: targetLang,
      sections,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mtiq-translate-pdf error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
