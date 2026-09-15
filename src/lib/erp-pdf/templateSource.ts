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

const cache = new Map<TemplateDocType, Promise<ArrayBuffer>>();

async function fetchBundled(fallbackUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(fallbackUrl);
  if (!res.ok) throw new Error('Originalvorlage konnte nicht geladen werden');
  return res.arrayBuffer();
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
    const { data: file, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(data.storage_path);
    if (error || !file) return null;
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

/** Vorlagenbytes laden (Backend bevorzugt, sonst mitgelieferte Datei). */
export async function loadTemplateBytes(docType: TemplateDocType, fallbackUrl: string): Promise<ArrayBuffer> {
  const cached = cache.get(docType);
  if (cached) return cached.then((buf) => buf.slice(0));
  const task = (async () => {
    const backend = await fetchBackend(docType);
    return backend ?? (await fetchBundled(fallbackUrl));
  })();
  cache.set(docType, task);
  try {
    const buf = await task;
    return buf.slice(0);
  } catch (err) {
    cache.delete(docType);
    throw err;
  }
}

/** Cache leeren, z. B. nachdem im Backend eine neue Vorlage aktiviert wurde. */
export function clearTemplateCache(docType?: TemplateDocType) {
  if (docType) cache.delete(docType);
  else cache.clear();
}
