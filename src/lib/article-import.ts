import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

// ---------- File type detection ----------
export type ImportType =
  | 'articles'
  | 'attributes'
  | 'prices'
  | 'price_list_items'
  | 'customer_refs'
  | 'supplier_refs'
  | 'bom'
  | 'status90';

export const IMPORT_TYPE_LABEL: Record<ImportType, string> = {
  articles: 'Artikelstamm',
  attributes: 'Artikelstamm + Sachmerkmale',
  prices: 'Artikelpreise',
  price_list_items: 'Artikelpreisliste',
  customer_refs: 'Kundenartikel',
  supplier_refs: 'Lieferantenartikel',
  bom: 'Stückliste',
  status90: 'Status 90 (Sperrungen)',
};

export function detectImportType(fileName: string): ImportType | null {
  const n = fileName.toLowerCase();
  if (n.includes('sachmerkmale')) return 'attributes';
  if (n.includes('artikelstamm') && n.includes('status90')) return 'status90';
  if (n.includes('status90')) return 'status90';
  if (n.includes('artikelstamm')) return 'articles';
  if (n.includes('artikelpreisliste')) return 'price_list_items';
  if (n.includes('artikelpreis')) return 'prices';
  if (n.includes('kundenartikel')) return 'customer_refs';
  if (n.includes('lieferantenartikel')) return 'supplier_refs';
  if (n.includes('stueckliste') || n.includes('stückliste')) return 'bom';
  return null;
}

// ---------- Helpers ----------
const cleanKey = (k: string) =>
  String(k ?? '').replace(/[☰\[\]]/g, '').replace(/\s+/g, ' ').trim();

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const dat = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};
const bool = (v: any): boolean | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'ja' || s === 'x';
};

// ---------- Parsing ----------
export type Row = Record<string, any>;

export async function readXlsx(file: File): Promise<{ headers: string[]; rows: Row[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true });
  const headersRaw = json.length ? Object.keys(json[0]) : [];
  // Re-key rows with cleaned headers
  const rows = json.map((r) => {
    const o: Row = {};
    for (const h of headersRaw) o[cleanKey(h)] = r[h];
    return o;
  });
  return { headers: headersRaw.map(cleanKey), rows };
}

// ---------- Mappers ----------
function mapArticles(rows: Row[]) {
  return rows
    .map((r) => ({
      art_nr: str(r['Art.-Nr']) ?? str(r['Art-Nr']),
      matchcode: str(r['Matchcode']),
      bezeich_1: str(r['Bezeich 1']),
      bezeich_2: str(r['Bezeich 2']),
      memo_ext: str(r['Memo.Ext']),
      art_gr: str(r['Art-Gr']),
      mat_art: str(r['Mat-art']),
      dispo_kz: str(r['Dispo-Kz.']) ?? str(r['Dispo-Kz']),
      dispo_kz_label: str(r['Dispo-Kz ']) ?? str(r['Dispo-Kz']),
      zolltarif_nr: str(r['Zollt-Nr']),
      zeichnung_nr: str(r['Zeichn-Nr']),
      pe: num(r['PE']),
      me: str(r['ME']),
      bautyp: str(r['Bautyp']),
      t_art: str(r['T-art']),
      mwst_gr: str(r['MwSt-Gr']),
      mwst_gr_label: str(r['MwSt-Gruppe']),
      aend_ind: str(r['Änd-Ind']),
      aend_nr: str(r['Änd-Nr']),
      aend_dat: dat(r['Änd-Dat.']),
      art_stat: str(r['Art-Stat']),
      art_stat_label: str(r['Artikelstatus']),
      kennung: str(r['Kennung']),
      kennung_label: str(r['Artikel - Kennung']),
      ger_lfd_nr: str(r['Ger-Lfd-Nr']),
      weber_art_nr: str(r['Weber ArtN']),
      mass_1: str(r['Maß 1']),
      verp_mg: num(r['Verp.Mg']),
      mb_menge: num(r['MB-Menge']),
    }))
    .filter((r) => r.art_nr);
}

function mapAttributes(rows: Row[]) {
  const out: { art_nr: string; attr_key: string; attr_label: string | null; attr_value: string | null }[] = [];
  for (const r of rows) {
    const art_nr = str(r['Art.-Nr']);
    if (!art_nr) continue;
    for (const key of Object.keys(r)) {
      const m = key.match(/^Merkmal\s+(\d+)$/i);
      if (!m) continue;
      const v = str(r[key]);
      if (!v) continue;
      out.push({
        art_nr,
        attr_key: `merkmal_${m[1]}`,
        attr_label: null,
        attr_value: v,
      });
    }
  }
  return out;
}

function mapPrices(rows: Row[]) {
  return rows
    .map((r) => ({
      art_nr: str(r['Art.-Nr']),
      waehrung: str(r['Währung']) ?? 'EUR',
      bewertungspreis: num(r['Bewertungspreis']),
      standardpreis: num(r['Standardpreis (SP)']),
      standardpreis_dat: dat(r['Datum SP']),
      durchschnittspreis: num(r['Durchschnittspreis (DP)']),
      durchschnittspreis_dat: dat(r['Datum DP']),
      letzter_ep: num(r['Letzter EP (LEP)']),
      letzter_ep_dat: dat(r['Datum LEK']),
      einkaufspreis: num(r['Einkaufspreis (EP)']),
      einkaufspreis_dat: dat(r['Datum EP']),
      buchung: str(r['Buchung']),
      inventur: str(r['Inventur']),
      abwertung: num(r['Abwertung']),
      dispo_lager: num(r['Dispo_Lager']),
    }))
    .filter((r) => r.art_nr);
}

function mapPriceListItems(rows: Row[]) {
  return rows
    .map((r) => ({
      art_nr: str(r['Art.-Nr']),
      prl_nr: str(r['Prl-Nr']) ?? '',
      bereich: str(r['Bereich']),
      menge_von: num(r['Menge von']),
      menge_bis: num(r['Menge bis']),
      vk_preis: num(r['VK-Preis']),
      pf_kz: bool(r['PF - Kz']),
      br_preis: num(r['Br-Preis']),
      waehrung: str(r['Währung']),
      me: str(r['ME']),
      pe: num(r['PE']),
      rab: num(r['Rab.']),
      m_vk_preis: num(r['M-VK-Preis']),
      bez_pl: str(r['Bez-PL']),
    }))
    .filter((r) => r.art_nr && r.prl_nr);
}

function mapCustomerRefs(rows: Row[]) {
  return rows
    .map((r) => ({
      art_nr: str(r['Art.-Nr']),
      kunden_nr: str(r['Kunden-Nr']) ?? '',
      matchcode: str(r['Matchcode']),
      art_kunde: str(r['Art/Kunde']) ?? '',
      bez_kunde: str(r['Bez-Kunde']),
      memo: str(r['Memo']),
      aend_ind: str(r['Änd-Ind']),
      aend_dat: dat(r['Änd-Dat.']),
      aend_nr: str(r['Änd-Nr']),
      version_nr: str(r['Version-Nr']),
      la_datum: dat(r['L-A-Datum']),
      la_menge: num(r['L-A-Menge']),
      me: str(r['ME']),
      la_preis: num(r['L-A-Preis']),
      ean_einz: str(r['EAN Einz']),
      ean_samm: str(r['EAN Samm']),
      rtz_kz: str(r['RTZ-Kz']),
    }))
    .filter((r) => r.art_nr && r.kunden_nr);
}

function mapSupplierRefs(rows: Row[]) {
  return rows
    .map((r) => ({
      art_nr: str(r['Art.-Nr']),
      lief_nr: str(r['Lief-Nr']) ?? '',
      name_1: str(r['Name 1']),
      art_lief: str(r['Art-Lief']) ?? '',
      bez_lief: str(r['Bez-Lief']),
      folge: str(r['Folge']),
      me_liefer: str(r['ME-Liefer']),
      me_preis: str(r['ME-Preis']),
      lieferzeit: num(r['Lieferzt.']),
      datum_l: dat(r['Datum L']),
      lb_preis: num(r['L-B-Preis']),
      lb_menge: num(r['L-B-Menge']),
      lb_datum: dat(r['L-B-Datum']),
      bestell_nr: str(r['Bestell-Nr']),
      lieferzeit_a: num(r['Lieferzt.A']),
      dat_a_lz: dat(r['Dat.A.LZ.']),
    }))
    .filter((r) => r.art_nr && r.lief_nr);
}

function mapBom(rows: Row[]) {
  // Duplicate column names "Matchcode", "Art-Stat", "ME", "Menge" — XLSX.utils gives "_1", "_2" suffix
  // We can't rely on suffix order across exports. Use positional fallback.
  return rows
    .map((r) => {
      const keys = Object.keys(r);
      const get = (i: number) => r[keys[i]];
      return {
        parent_art_nr: str(get(0)),
        // 1: parent matchcode, 2: parent art_stat, 3: parent bezeich1
        pos: str(get(4)),
        component_art_nr: str(get(5)),
        component_matchcode: str(get(6)),
        component_art_stat: str(get(7)),
        component_kennung: str(get(8)),
        component_bezeichnung: str(get(9)),
        menge: num(get(10)),
        me: str(get(11)),
        ausschuss: num(get(16)),
        a_kz: bool(get(17)),
        mehrm_me: num(get(18)),
        anfahrmg: num(get(19)),
        kst: str(get(20)),
        kst_label: str(get(21)),
        anzahl: num(get(22)),
        laenge_mm: num(get(23)),
        breite: num(get(24)),
        hoehe: num(get(25)),
        mehrm_ber: num(get(26)),
        et_kz: bool(get(27)),
        set_kz: bool(get(28)),
        v_position: str(get(29)),
      };
    })
    .filter((r) => r.parent_art_nr && r.component_art_nr);
}

// ---------- Batched upsert ----------
async function batchedUpsert(
  table: string,
  records: any[],
  onConflict: string,
  batchSize = 500,
): Promise<{ inserted: number; failed: number; errors: string[] }> {
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const { error, data } = await (supabase as any)
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: false })
      .select('*', { count: 'exact', head: true });
    if (error) {
      failed += chunk.length;
      errors.push(`Batch @${i}: ${error.message}`);
      console.error('upsert error', table, error);
    } else {
      inserted += chunk.length;
    }
    void data;
  }
  return { inserted, failed, errors };
}

// ---------- Main entrypoint ----------
export interface ImportResult {
  importType: ImportType;
  rowsProcessed: number;
  rowsUpserted: number;
  rowsFailed: number;
  errors: string[];
  durationMs: number;
}

export async function runImport(
  importType: ImportType,
  rows: Row[],
  userId: string,
  fileName: string,
): Promise<ImportResult> {
  const t0 = Date.now();
  let result = { inserted: 0, failed: 0, errors: [] as string[] };

  switch (importType) {
    case 'articles': {
      const recs = mapArticles(rows).map((r) => ({ ...r, updated_by: userId }));
      result = await batchedUpsert('articles', recs, 'art_nr');
      break;
    }
    case 'attributes': {
      // First make sure articles exist (light upsert)
      const articleStubs = rows
        .map((r) => ({ art_nr: str(r['Art.-Nr']), matchcode: str(r['Matchcode']), bezeich_1: str(r['Bezeich 1']) }))
        .filter((r) => r.art_nr);
      await batchedUpsert('articles', articleStubs, 'art_nr');
      const attrs = mapAttributes(rows);
      result = await batchedUpsert('article_attributes', attrs, 'art_nr,attr_key');
      break;
    }
    case 'prices': {
      const recs = mapPrices(rows);
      result = await batchedUpsert('article_prices', recs, 'art_nr');
      break;
    }
    case 'price_list_items': {
      const recs = mapPriceListItems(rows);
      // ensure price_lists header
      const prlMap = new Map<string, string | null>();
      for (const r of recs) if (r.prl_nr) prlMap.set(r.prl_nr, r.bez_pl ?? null);
      const prlRecs = Array.from(prlMap, ([prl_nr, bezeichnung]) => ({ prl_nr, bezeichnung }));
      if (prlRecs.length) await batchedUpsert('article_price_lists', prlRecs, 'prl_nr');
      result = await batchedUpsert(
        'article_price_list_items',
        recs,
        'art_nr,prl_nr,bereich,menge_von,menge_bis',
      );
      break;
    }
    case 'customer_refs': {
      const recs = mapCustomerRefs(rows);
      result = await batchedUpsert('article_customer_refs', recs, 'art_nr,kunden_nr,art_kunde');
      break;
    }
    case 'supplier_refs': {
      const recs = mapSupplierRefs(rows);
      result = await batchedUpsert('article_supplier_refs', recs, 'art_nr,lief_nr,art_lief');
      break;
    }
    case 'bom': {
      const recs = mapBom(rows);
      result = await batchedUpsert('article_bom', recs, 'parent_art_nr,pos,component_art_nr');
      break;
    }
    case 'status90': {
      // Only set art_stat on existing articles
      const stubs = rows
        .map((r) => ({
          art_nr: str(r['Art.-Nr']),
          art_stat: str(r['Art-Stat']) ?? '90',
          art_stat_label: str(r['Artikelstatus']),
        }))
        .filter((r) => r.art_nr);
      result = await batchedUpsert('articles', stubs, 'art_nr');
      break;
    }
  }

  const durationMs = Date.now() - t0;
  const summary: ImportResult = {
    importType,
    rowsProcessed: rows.length,
    rowsUpserted: result.inserted,
    rowsFailed: result.failed,
    errors: result.errors,
    durationMs,
  };

  // Audit log
  await (supabase as any).from('article_import_runs').insert({
    file_name: fileName,
    import_type: importType,
    rows_processed: summary.rowsProcessed,
    rows_inserted: summary.rowsUpserted,
    rows_updated: 0,
    rows_failed: summary.rowsFailed,
    error_details: summary.errors.length ? { errors: summary.errors } : null,
    duration_ms: durationMs,
    imported_by: userId,
  });

  // Archive raw file
  try {
    const path = `${new Date().toISOString().slice(0, 10)}/${importType}/${Date.now()}_${fileName}`;
    // Note: caller passes file separately if it wants archiving
    void path;
  } catch {}

  return summary;
}
