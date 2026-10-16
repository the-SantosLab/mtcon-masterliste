// Allgemeine Kalkulation nach Excel-Vorlage "Kalkulation_Standard/Blank/SWS".
// Alle Beträge je 1.000 Stück.

export type CalcRow = {
  qty: number | null;
  hk: number | null; // Herstellkosten /1000
  galvanik: number | null;
  pruefung: number | null;
  sws_wkz?: number | null;
  sws_gurt?: number | null;
};

export type CalcOptions = {
  with_galvanik: boolean;
  with_pruefung: boolean;
  with_lz: boolean;
  with_sws: boolean;
};

export type Setting = { key: string; value: number | null; status: 'unclear' | 'confirmed' };

export type RowResult = {
  lz: number | null;
  mgk1: number | null;
  mgk2: number | null;
  vk1000: number | null;
  vkPiece: number | null;
  missing: string[];
};

export function lzValue(avg: number | null, base: number | null, consumption: number | null): number | null {
  if (avg == null || base == null || consumption == null) return null;
  return (avg - base) * consumption;
}

export function calcRow(row: CalcRow, opt: CalcOptions, factor: number | null, lz: number | null): RowResult {
  const missing: string[] = [];
  if (row.hk == null) missing.push('Herstellkosten');
  if (opt.with_lz && lz == null) missing.push('Legierungszuschlag');
  if (factor == null) missing.push('Faktor');
  const parts = [row.hk, opt.with_galvanik ? row.galvanik ?? 0 : 0, opt.with_pruefung ? row.pruefung ?? 0 : 0, opt.with_lz ? lz : 0];
  const mgk1 = row.hk == null || (opt.with_lz && lz == null) ? null : parts.reduce((s: number, v) => s + (v ?? 0), 0);
  const mgk2 = mgk1 == null || factor == null ? null : mgk1 * factor;
  // SWS: Rechenweg für MGK 3 ist in der Vorlage nicht hinterlegt -> kein Verkaufspreis.
  if (opt.with_sws) missing.push('SWS-Rechenweg (MGK 3)');
  const vk1000 = opt.with_sws ? null : mgk2;
  return { lz: opt.with_lz ? lz : null, mgk1, mgk2, vk1000, vkPiece: vk1000 == null ? null : vk1000 / 1000, missing };
}

export function openPoints(settings: Setting[], opt: CalcOptions, usedKeys = ['factor', ...(opt.with_lz ? ['lz_quarter_avg', 'lz_base'] : []), ...(opt.with_sws ? ['sws_factor'] : [])]): string[] {
  const map = new Map(settings.map((s) => [s.key, s]));
  const out: string[] = [];
  for (const k of usedKeys) {
    const s = map.get(k);
    if (!s || s.value == null) out.push(`${k}: kein Wert hinterlegt`);
    else if (s.status === 'unclear') out.push(`${k}: Wert ungeklärt`);
  }
  if (opt.with_sws) out.push('SWS: Rechenweg für MGK 3 nicht geklärt');
  return out;
}
