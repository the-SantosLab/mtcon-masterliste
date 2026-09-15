// Lädt die PDF-Originalvorlage für einen Belegtyp.
// Primär aus dem Backend (Tabelle erp_pdf_templates + Bucket erp-templates),
// damit Vorlagen dort ausgetauscht werden können. Fällt auf die mitgelieferte
// Datei zurück, falls keine aktive Vorlage hinterlegt ist.
import { supabase } from '@/integrations/supabase/client';

export type TemplateDocType = 'angebot' | 'ab' | 'bestellung' | 'lieferschein' | 'rechnung';

export const TEMPLATE_DOC_TYPES: { value: TemplateDocType; label: string }[] = [
  { value: 'angebot', label: 'Angebot' },
  { value: 'ab', label: 'Auftragsbestätigung' },
  { value: 'bestellung', label: 'Bestellung' },
  { value: 'lieferschein', label: 'Lieferschein / Rücklieferschein' },
  { value: 'rechnung', label: 'Rechnung' },
];

export const TEMPLATE_BUCKET = 'erp-templates';

export type TemplateScopeKind = 'company' | 'deal' | 'project';

/** Kontext eines Belegs: Vorlage wird Deal → Projekt → Firma → global aufgelöst. */
export interface TemplateScope {
  companyId?: string | null;
  dealId?: string | null;
  projectId?: string | null;
}

const cache = new Map<string, Promise<ArrayBuffer>>();

function scopeKey(docType: TemplateDocType, scope?: TemplateScope) {
  return [docType, scope?.dealId || '', scope?.projectId || '', scope?.companyId || ''].join('|');
}

async function fetchBundled(fallbackUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(fallbackUrl);
  if (!res.ok) throw new Error('Originalvorlage konnte nicht geladen werden');
  return res.arrayBuffer();
}

async function downloadPath(storagePath: string): Promise<ArrayBuffer | null> {
  const { data: file, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(storagePath);
  if (error || !file) return null;
  return await file.arrayBuffer();
}

/** Zugeordnete Vorlage für einen Geltungsbereich suchen (Deal → Projekt → Firma). */
async function fetchAssigned(docType: TemplateDocType, scope?: TemplateScope): Promise<ArrayBuffer | null> {
  const chain: { scope: TemplateScopeKind; id: string }[] = [];
  if (scope?.dealId) chain.push({ scope: 'deal', id: scope.dealId });
  if (scope?.projectId) chain.push({ scope: 'project', id: scope.projectId });
  if (scope?.companyId) chain.push({ scope: 'company', id: scope.companyId });
  for (const entry of chain) {
    try {
      const { data } = await supabase
        .from('erp_template_assignments')
        .select('erp_pdf_templates(storage_path)')
        .eq('scope', entry.scope)
        .eq('scope_id', entry.id)
        .eq('doc_type', docType)
        .maybeSingle();
      const path = (data as any)?.erp_pdf_templates?.storage_path as string | undefined;
      if (path) {
        const bytes = await downloadPath(path);
        if (bytes) return bytes;
      }
    } catch {
      /* nächste Ebene versuchen */
    }
  }
  return null;
}

async function fetchBackend(docType: TemplateDocType): Promise<ArrayBuffer | null> {
  try {
    const { data } = await supabase
      .from('erp_pdf_templates')
      .select('storage_path')
      .eq('doc_type', docType)
      .eq('is_active', true)
      .maybeSingle();
    if (!data?.storage_path) return null;
    return await downloadPath(data.storage_path);
  } catch {
    return null;
  }
}

/** Vorlagenbytes laden (Zuordnung > global aktiv > mitgelieferte Datei). */
export async function loadTemplateBytes(
  docType: TemplateDocType,
  fallbackUrl: string,
  scope?: TemplateScope,
): Promise<ArrayBuffer> {
  const key = scopeKey(docType, scope);
  const cached = cache.get(key);
  if (cached) return cached.then((buf) => buf.slice(0));
  const task = (async () => {
    const assigned = await fetchAssigned(docType, scope);
    if (assigned) return assigned;
    const backend = await fetchBackend(docType);
    return backend ?? (await fetchBundled(fallbackUrl));
  })();
  cache.set(key, task);
  try {
    const buf = await task;
    return buf.slice(0);
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

/** Cache leeren, z. B. nachdem eine Vorlage aktiviert oder zugeordnet wurde. */
export function clearTemplateCache(docType?: TemplateDocType) {
  if (!docType) { cache.clear(); return; }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${docType}|`)) cache.delete(key);
  }
}
