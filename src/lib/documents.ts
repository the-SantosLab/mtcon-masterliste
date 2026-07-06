import { supabase } from '@/integrations/supabase/client';

export type DocumentEntityType = 'case' | 'project' | 'company' | 'support_ticket';

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  checksum_sha256: string | null;
  storage_path: string;
  category: string | null;
  current_version: number;
  tags: string[];
  owner_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentLinkRow {
  id: string;
  document_id: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  role: string | null;
  linked_by: string;
  linked_at: string;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_no: number;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  checksum_sha256: string | null;
  change_note: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

const BUCKET = 'documents';

export async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function buildStoragePath(documentId: string, versionNo: number, fileName: string): string {
  // Pfadschema: <document_id>/v<version_no>/<file_name>
  const safe = fileName.replace(/[^\w.\-]+/g, '_');
  return `${documentId}/v${versionNo}/${safe}`;
}

export async function findDocumentByChecksum(checksum: string): Promise<DocumentRow | null> {
  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('checksum_sha256', checksum)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle();
  return (data as any) || null;
}

export interface UploadResult {
  document: DocumentRow;
  alreadyExisted: boolean;
}

/**
 * Lädt eine Datei ins zentrale Repository.
 * Bei identischer Checksum wird das vorhandene Dokument zurückgegeben (kein erneuter Upload).
 */
export async function uploadDocument(opts: {
  file: File;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  ownerId: string;
}): Promise<UploadResult> {
  // Session frisch prüfen — auth.uid() muss serverseitig gültig sein, sonst
  // scheitert die RLS-Prüfung `owner_id = auth.uid()` mit „new row violates row-level security policy".
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const authedId = authData?.user?.id;
  if (authErr || !authedId) {
    throw new Error('Sitzung abgelaufen. Bitte neu anmelden und erneut versuchen.');
  }
  // Client-übergebene ownerId ignorieren und die tatsächliche auth.uid() verwenden,
  // damit RLS-Insert nicht an einer veralteten user.id im Frontend scheitert.
  const ownerId = authedId;

  const checksum = await sha256(opts.file);
  const existing = await findDocumentByChecksum(checksum);
  if (existing) return { document: existing, alreadyExisted: true };

  // 1. Doc-Eintrag erzeugen (temporärer storage_path, wird gleich gesetzt)
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      title: opts.title || opts.file.name,
      description: opts.description || null,
      file_name: opts.file.name,
      mime_type: opts.file.type || null,
      size_bytes: opts.file.size,
      checksum_sha256: checksum,
      storage_path: 'pending',
      category: opts.category || null,
      current_version: 1,
      tags: opts.tags || [],
      owner_id: ownerId,
    })
    .select('*')
    .single();
  if (docErr || !doc) {
    const msg = docErr?.message || '';
    if (/row-level security/i.test(msg)) {
      throw new Error('Berechtigung fehlt: Deine Sitzung ist möglicherweise abgelaufen. Bitte neu anmelden und erneut versuchen.');
    }
    throw new Error(msg || 'Dokument konnte nicht angelegt werden');
  }

  const path = buildStoragePath(doc.id, 1, opts.file.name);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, opts.file, {
    contentType: opts.file.type || undefined,
    upsert: false,
  });
  if (upErr) {
    await supabase.from('documents').delete().eq('id', doc.id);
    throw new Error(upErr.message);
  }

  await supabase.from('documents').update({ storage_path: path }).eq('id', doc.id);
  await supabase.from('document_versions').insert({
    document_id: doc.id,
    version_no: 1,
    storage_path: path,
    file_name: opts.file.name,
    mime_type: opts.file.type || null,
    size_bytes: opts.file.size,
    checksum_sha256: checksum,
    uploaded_by: ownerId,
  });

  return { document: { ...(doc as any), storage_path: path }, alreadyExisted: false };
}

export async function addNewVersion(opts: {
  documentId: string;
  file: File;
  uploadedBy: string;
  changeNote?: string;
}): Promise<DocumentVersionRow> {
  const { data: doc } = await supabase
    .from('documents')
    .select('current_version, file_name')
    .eq('id', opts.documentId)
    .single();
  if (!doc) throw new Error('Dokument nicht gefunden');

  const checksum = await sha256(opts.file);
  const nextVersion = (doc.current_version || 0) + 1;
  const path = buildStoragePath(opts.documentId, nextVersion, opts.file.name);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, opts.file, {
    contentType: opts.file.type || undefined,
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: ver, error: vErr } = await supabase
    .from('document_versions')
    .insert({
      document_id: opts.documentId,
      version_no: nextVersion,
      storage_path: path,
      file_name: opts.file.name,
      mime_type: opts.file.type || null,
      size_bytes: opts.file.size,
      checksum_sha256: checksum,
      change_note: opts.changeNote || null,
      uploaded_by: opts.uploadedBy,
    })
    .select('*')
    .single();
  if (vErr || !ver) throw new Error(vErr?.message || 'Version konnte nicht gespeichert werden');

  await supabase
    .from('documents')
    .update({
      current_version: nextVersion,
      storage_path: path,
      file_name: opts.file.name,
      mime_type: opts.file.type || null,
      size_bytes: opts.file.size,
      checksum_sha256: checksum,
    })
    .eq('id', opts.documentId);

  return ver as any;
}

export async function linkDocument(opts: {
  documentId: string;
  entityType: DocumentEntityType;
  entityId: string;
  linkedBy: string;
  role?: string;
}): Promise<void> {
  const { error } = await supabase.from('document_links').insert({
    document_id: opts.documentId,
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    role: opts.role || null,
    linked_by: opts.linkedBy,
  });
  // 23505 = unique_violation -> bereits verknüpft, ist OK
  if (error && (error as any).code !== '23505') throw new Error(error.message);
}

export async function unlinkDocument(linkId: string): Promise<void> {
  const { error } = await supabase.from('document_links').delete().eq('id', linkId);
  if (error) throw new Error(error.message);
}

export async function listLinksForEntity(
  entityType: DocumentEntityType,
  entityId: string,
): Promise<Array<DocumentLinkRow & { document: DocumentRow }>> {
  const { data, error } = await supabase
    .from('document_links')
    .select('*, document:documents(*)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('linked_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as any) || [];
}

export async function listLinksForDocument(documentId: string): Promise<DocumentLinkRow[]> {
  const { data } = await supabase
    .from('document_links')
    .select('*')
    .eq('document_id', documentId)
    .order('linked_at', { ascending: false });
  return (data as any) || [];
}

export async function listVersions(documentId: string): Promise<DocumentVersionRow[]> {
  const { data } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version_no', { ascending: false });
  return (data as any) || [];
}

export async function getSignedUrl(storagePath: string, expiresIn = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function searchDocuments(query: string, limit = 25): Promise<DocumentRow[]> {
  let q = supabase.from('documents').select('*').is('archived_at', null).limit(limit);
  if (query.trim()) {
    const term = `%${query.trim()}%`;
    q = q.or(`title.ilike.${term},description.ilike.${term},file_name.ilike.${term}`);
  }
  q = q.order('updated_at', { ascending: false });
  const { data } = await q;
  return (data as any) || [];
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
