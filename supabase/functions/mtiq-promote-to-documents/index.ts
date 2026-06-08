// Promote MTIQ draft attachments into the documents library.
//
// Body:
// {
//   draft_id: string,
//   decisions: [
//     {
//       attachment_id: string,
//       action: "new_version" | "new_document" | "skip",
//       target_document_id?: string,   // required if action === "new_version"
//       change_note?: string,
//       new_title?: string,            // for new_document
//     }
//   ],
//   close_draft?: boolean              // default true
// }
//
// Behaviour
// - "skip"         : log only, leave attachment on the draft.
// - "new_document" : copy file to the documents bucket, create documents row
//                    + initial document_versions row.
// - "new_version"  : copy file to documents bucket, insert document_versions
//                    with version_no = current_version + 1, bump
//                    documents.current_version.
// - All operations are logged to document_intake_log.
// - If close_draft (default true) and at least one decision was processed,
//   set draft.status = 'approved' and draft.route = 'dokument'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Decision = {
  attachment_id: string;
  action: "new_version" | "new_document" | "skip";
  target_document_id?: string;
  change_note?: string;
  new_title?: string;
};

const DOCUMENTS_BUCKET = "documents";
const DRAFT_BUCKET = "mtiq-draft-attachments";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const draftId = String(body?.draft_id ?? "");
    const decisions: Decision[] = Array.isArray(body?.decisions) ? body.decisions : [];
    const closeDraft = body?.close_draft !== false;
    if (!draftId || decisions.length === 0) {
      return new Response(JSON.stringify({ error: "draft_id and decisions required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Authorization: draft owner or admin
    const { data: draft, error: draftErr } = await admin
      .from("mtiq_drafts")
      .select("id, created_by, source_email_subject")
      .eq("id", draftId)
      .single();
    if (draftErr || !draft) {
      return new Response(JSON.stringify({ error: "draft not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await admin.rpc("check_is_admin", { uid: userId });
    if (!isAdmin && draft.created_by !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: attachments } = await admin
      .from("mtiq_draft_attachments")
      .select("id,file_name,mime_type,size_bytes,storage_path")
      .eq("draft_id", draftId);
    const byId = new Map((attachments ?? []).map((a: any) => [a.id, a]));

    const results: any[] = [];

    for (const dec of decisions) {
      const att = byId.get(dec.attachment_id);
      if (!att) {
        results.push({ attachment_id: dec.attachment_id, status: "skipped", reason: "not_found" });
        continue;
      }

      if (dec.action === "skip") {
        await admin.from("document_intake_log").insert({
          mtiq_draft_id: draftId,
          attachment_id: att.id,
          action: "skip",
          created_by: userId,
        });
        results.push({ attachment_id: att.id, status: "skipped" });
        continue;
      }

      // Download bytes from draft bucket
      const { data: blob, error: dlErr } = await admin.storage
        .from(DRAFT_BUCKET)
        .download(att.storage_path);
      if (dlErr || !blob) {
        results.push({ attachment_id: att.id, status: "error", reason: dlErr?.message ?? "download_failed" });
        continue;
      }
      const buf = new Uint8Array(await blob.arrayBuffer());

      if (dec.action === "new_version") {
        if (!dec.target_document_id) {
          results.push({ attachment_id: att.id, status: "error", reason: "missing_target_document" });
          continue;
        }
        const { data: targetDoc, error: tgtErr } = await admin
          .from("documents")
          .select("id, current_version, file_name")
          .eq("id", dec.target_document_id)
          .single();
        if (tgtErr || !targetDoc) {
          results.push({ attachment_id: att.id, status: "error", reason: "target_not_found" });
          continue;
        }

        const newVersionNo = (targetDoc.current_version ?? 1) + 1;
        const safe = att.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${targetDoc.id}/v${newVersionNo}-${Date.now()}-${safe}`;
        const { error: upErr } = await admin.storage
          .from(DOCUMENTS_BUCKET)
          .upload(path, buf, { contentType: att.mime_type ?? "application/octet-stream", upsert: false });
        if (upErr) {
          results.push({ attachment_id: att.id, status: "error", reason: upErr.message });
          continue;
        }

        const { error: verErr } = await admin.from("document_versions").insert({
          document_id: targetDoc.id,
          version_no: newVersionNo,
          storage_path: path,
          file_name: att.file_name,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes ?? buf.byteLength,
          uploaded_by: userId,
          change_note: dec.change_note ?? `Aus MTIQ-Eingang: ${draft.source_email_subject ?? ""}`.slice(0, 500),
        });
        if (verErr) {
          results.push({ attachment_id: att.id, status: "error", reason: verErr.message });
          continue;
        }

        await admin
          .from("documents")
          .update({ current_version: newVersionNo, file_name: att.file_name, storage_path: path, mime_type: att.mime_type, size_bytes: att.size_bytes ?? buf.byteLength, updated_at: new Date().toISOString() })
          .eq("id", targetDoc.id);

        await admin.from("document_intake_log").insert({
          mtiq_draft_id: draftId,
          attachment_id: att.id,
          document_id: targetDoc.id,
          action: "new_version",
          new_version_no: newVersionNo,
          change_note: dec.change_note ?? null,
          created_by: userId,
        });
        results.push({ attachment_id: att.id, status: "ok", document_id: targetDoc.id, version_no: newVersionNo });
        continue;
      }

      if (dec.action === "new_document") {
        const docId = crypto.randomUUID();
        const safe = att.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${docId}/v1-${Date.now()}-${safe}`;
        const { error: upErr } = await admin.storage
          .from(DOCUMENTS_BUCKET)
          .upload(path, buf, { contentType: att.mime_type ?? "application/octet-stream", upsert: false });
        if (upErr) {
          results.push({ attachment_id: att.id, status: "error", reason: upErr.message });
          continue;
        }
        const title = (dec.new_title?.trim() || att.file_name.replace(/\.[a-z0-9]{1,5}$/i, "")).slice(0, 250);
        const { error: docErr } = await admin.from("documents").insert({
          id: docId,
          title,
          file_name: att.file_name,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes ?? buf.byteLength,
          storage_path: path,
          current_version: 1,
          owner_id: userId,
        });
        if (docErr) {
          results.push({ attachment_id: att.id, status: "error", reason: docErr.message });
          continue;
        }
        await admin.from("document_versions").insert({
          document_id: docId,
          version_no: 1,
          storage_path: path,
          file_name: att.file_name,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes ?? buf.byteLength,
          uploaded_by: userId,
          change_note: dec.change_note ?? "Erstanlage aus MTIQ-Eingang",
        });
        await admin.from("document_intake_log").insert({
          mtiq_draft_id: draftId,
          attachment_id: att.id,
          document_id: docId,
          action: "new_document",
          new_version_no: 1,
          change_note: dec.change_note ?? null,
          created_by: userId,
        });
        results.push({ attachment_id: att.id, status: "ok", document_id: docId, version_no: 1 });
        continue;
      }

      results.push({ attachment_id: att.id, status: "skipped", reason: "unknown_action" });
    }

    if (closeDraft && results.some((r) => r.status === "ok" || r.status === "skipped")) {
      await admin
        .from("mtiq_drafts")
        .update({
          status: "approved",
          route: "dokument",
          approved_at: new Date().toISOString(),
          approved_by: userId,
          route_confirmed_at: new Date().toISOString(),
          route_confirmed_by: userId,
        })
        .eq("id", draftId);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-promote-to-documents error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
