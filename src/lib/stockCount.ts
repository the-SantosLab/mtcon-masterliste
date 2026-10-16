export interface CountLine { expected_qty: number; counted_qty: number | null }

/** Differenz Zählmenge minus Sollbestand; null solange nicht gezählt. */
export function countDelta(l: CountLine): number | null {
  if (l.counted_qty == null) return null;
  return Math.round((Number(l.counted_qty) - Number(l.expected_qty)) * 1000) / 1000;
}

export function countProgress(lines: CountLine[]) {
  const counted = lines.filter(l => l.counted_qty != null).length;
  const deviations = lines.filter(l => { const d = countDelta(l); return d != null && d !== 0; }).length;
  return { total: lines.length, counted, open: lines.length - counted, deviations, complete: lines.length > 0 && counted === lines.length };
}
