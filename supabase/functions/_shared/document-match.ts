// Duplicate / version detection for MTIQ document intake.
//
// Given the email context and the attachments that were just stored on a
// draft, this helper looks at existing public.documents to find the most
// plausible "this is a new version of an existing document" match. It returns
// proposals that the UI can render with confidence + signals + a suggested
// action (`new_version` vs. `new_document`).
//
// Strategy (no embeddings in this iteration — works fully on metadata):
//   1. Extract identifiers (drawing/article/order numbers) from email subject,
//      body, and attachment filename.
//   2. Pull candidate documents that match either an identifier or the
//      sender's customer (we already get customerNo from the upstream caller).
//   3. Score by signals: identifier hit, filename basename similarity,
//      customer/project link match, same extension.
//   4. Pick the best candidate; if score >= MIN_SCORE -> `new_version`,
//      otherwise -> `new_document`.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AttachmentInput = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
};

export type EmailContext = {
  from: string;
  subject: string;
  body: string;
  customer_no: string | null;
  client_name: string | null;
};

export type MatchSignal =
  | { type: "identifier"; value: string }
  | { type: "filename"; similarity: number }
  | { type: "customer"; customer_no: string }
  | { type: "extension"; ext: string };

export type DocumentCandidate = {
  document_id: string;
  document_title: string;
  current_version: number;
  file_name: string;
  score: number;
  signals: MatchSignal[];
};

export type AttachmentMatchProposal = {
  attachment_id: string;
  attachment_file_name: string;
  recommended_action: "new_version" | "new_document";
  top_match: DocumentCandidate | null;
  alternatives: DocumentCandidate[];
  identifiers: string[];
};

// ---------------------------------------------------------------------------

const IDENT_PATTERNS: RegExp[] = [
  /\b[A-Z]{2,5}[-_/]?\d{3,8}(?:[-_/.][A-Z0-9]{1,6})?\b/g, // ART-12345, VOR-2025-0123, ZNG_4711-A
  /\bZ\d{4,8}(?:[._-][A-Z0-9]{1,4})?\b/g, // Z12345.A
  /\b\d{6,10}\b/g, // bare order/article numbers
];

const STOP_IDS = new Set([
  "AKTE", "RE", "FW", "FWD", "AW", "FYI",
]);

export function extractIdentifiers(text: string): string[] {
  if (!text) return [];
  const upper = text.toUpperCase();
  const hits = new Set<string>();
  for (const re of IDENT_PATTERNS) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(upper))) {
      const id = m[0];
      if (id.length >= 4 && !STOP_IDS.has(id)) hits.add(id);
    }
  }
  return [...hits];
}

export function stripRevisionSuffix(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, "") // extension
    .replace(/[ _-](?:v|rev|version)[ _-]?\d+[a-z]?$/i, "")
    .replace(/[ _-]\(\d+\)$/, "")
    .replace(/[ _-]rev[ _-]?[a-z]$/i, "")
    .trim()
    .toLowerCase();
}

export function fileExtension(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

// Simple normalized Levenshtein similarity, capped O(n*m) for short names.
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  const max = Math.max(la, lb);
  if (max > 80) return a === b ? 1 : 0; // skip very long names
  const dp = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) dp[j] = j;
  for (let i = 1; i <= la; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= lb; j++) {
      const tmp = dp[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return 1 - dp[lb] / max;
}

// ---------------------------------------------------------------------------

const MIN_SCORE_NEW_VERSION = 6;
const TOP_ALTS = 2;

export async function proposeAttachmentMatches(
  supabaseUrl: string,
  serviceKey: string,
  attachments: AttachmentInput[],
  ctx: EmailContext,
): Promise<AttachmentMatchProposal[]> {
  if (!attachments.length) return [];

  const admin: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const ctxBlob = `${ctx.subject} ${ctx.body}`;
  const ctxIdentifiers = extractIdentifiers(ctxBlob);

  const proposals: AttachmentMatchProposal[] = [];

  for (const att of attachments) {
    if (att.mime_type === "message/rfc822") continue; // skip the trigger eml

    const attIdentifiers = extractIdentifiers(att.file_name);
    const allIdentifiers = [...new Set([...attIdentifiers, ...ctxIdentifiers])];
    const baseName = stripRevisionSuffix(att.file_name);
    const ext = fileExtension(att.file_name);

    // ------ Pull candidate documents ----------------------------------------
    const candidates = new Map<string, {
      id: string; title: string; file_name: string; current_version: number; tags: string[];
    }>();

    // by identifier (title / file_name / tags substring)
    for (const id of allIdentifiers) {
      try {
        const { data } = await admin
          .from("documents")
          .select("id,title,file_name,current_version,tags")
          .or(`title.ilike.%${id}%,file_name.ilike.%${id}%`)
          .is("archived_at", null)
          .limit(15);
        for (const d of data ?? []) candidates.set(d.id, d as any);
      } catch (e) {
        console.warn("doc lookup by identifier failed", id, e);
      }
    }

    // by basename similarity – pull a small page and rank in code
    if (baseName.length >= 4) {
      try {
        const { data } = await admin
          .from("documents")
          .select("id,title,file_name,current_version,tags")
          .ilike("file_name", `%${baseName.split(/\s+/)[0]}%`)
          .is("archived_at", null)
          .limit(20);
        for (const d of data ?? []) candidates.set(d.id, d as any);
      } catch (e) {
        console.warn("doc lookup by basename failed", e);
      }
    }

    // ------ Score -----------------------------------------------------------
    const scored: DocumentCandidate[] = [];
    for (const c of candidates.values()) {
      const signals: MatchSignal[] = [];
      let score = 0;

      // identifier signal (strongest)
      for (const id of allIdentifiers) {
        const hay = `${c.title} ${c.file_name} ${(c.tags ?? []).join(" ")}`.toUpperCase();
        if (hay.includes(id)) {
          signals.push({ type: "identifier", value: id });
          score += 6;
          break;
        }
      }

      // filename similarity
      const candidateBase = stripRevisionSuffix(c.file_name);
      const sim = similarity(baseName, candidateBase);
      if (sim >= 0.7) {
        signals.push({ type: "filename", similarity: Math.round(sim * 100) / 100 });
        score += Math.round(sim * 5); // up to +5
      }

      // matching extension
      const candExt = fileExtension(c.file_name);
      if (ext && candExt && ext === candExt) {
        signals.push({ type: "extension", ext });
        score += 1;
      }

      // customer match via tags (cheap heuristic – tags often hold customer_no)
      if (ctx.customer_no && (c.tags ?? []).includes(ctx.customer_no)) {
        signals.push({ type: "customer", customer_no: ctx.customer_no });
        score += 3;
      }

      if (score > 0) {
        scored.push({
          document_id: c.id,
          document_title: c.title,
          file_name: c.file_name,
          current_version: c.current_version ?? 1,
          score,
          signals,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored[0] ?? null;
    const alternatives = scored.slice(1, 1 + TOP_ALTS);

    proposals.push({
      attachment_id: att.id,
      attachment_file_name: att.file_name,
      recommended_action: top && top.score >= MIN_SCORE_NEW_VERSION ? "new_version" : "new_document",
      top_match: top,
      alternatives,
      identifiers: allIdentifiers,
    });
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Heuristic: should the email be routed to "dokument" instead of a Vorgang?
// Used when the AI prompt does not explicitly return a `route` field.

export function inferRoute(
  emailBody: string,
  subject: string,
  attachments: AttachmentInput[],
  proposals: AttachmentMatchProposal[],
): { route: "vorgang" | "dokument" | "unklar"; reason: string } {
  const realAttachments = attachments.filter((a) => a.mime_type !== "message/rfc822");
  if (!realAttachments.length) {
    return { route: "vorgang", reason: "Keine Anhänge – behandelt als Vorgangsentwurf." };
  }

  const body = `${subject}\n${emailBody}`.toLowerCase();
  const actionWords = [
    "bitte", "benötig", "benoetig", "auftrag", "klär", "kläre", "fragen", "frage",
    "rückmeldung", "rueckmeldung", "termin", "wann", "können sie", "koennen sie",
    "anfrage", "angebot", "bestellung",
  ];
  const hasAction = actionWords.some((w) => body.includes(w));

  const matchedCount = proposals.filter((p) => p.recommended_action === "new_version").length;

  if (matchedCount && matchedCount === proposals.length && !hasAction) {
    return {
      route: "dokument",
      reason: `${matchedCount} Anhang(s) sehen wie neue Versionen vorhandener Dokumente aus und der E-Mail-Text enthält keine Aufgabenanfrage.`,
    };
  }
  if (!hasAction && realAttachments.length >= 2 && matchedCount > 0) {
    return {
      route: "dokument",
      reason: "Mehrere Anhänge, keine klare Aufgabenanfrage – wahrscheinlich Dokumentenupdate.",
    };
  }
  if (hasAction) {
    return {
      route: "vorgang",
      reason: "E-Mail enthält eine Anfrage/Aufgabe – als Vorgang behandeln.",
    };
  }
  return {
    route: "unklar",
    reason: "Eindeutige Einordnung nicht möglich – bitte manuell entscheiden.",
  };
}
