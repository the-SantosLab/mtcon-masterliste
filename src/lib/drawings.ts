/** Revision letter for a version number: 1 → A, 26 → Z, 27 → AA. */
export function revLabel(version: number | null | undefined): string {
  let n = Math.max(1, Math.floor(version ?? 1));
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

/** A set item is outdated when it is pinned to an older revision than the drawing's current one. */
export function isOutdated(pinned: number | null, current: number): boolean {
  return pinned != null && current > 0 && pinned < current;
}

export function paramSummary(params: { name: string; value: string | null }[], max = 3): string {
  return params.slice(0, max).map(p => `${p.name}: ${p.value ?? ''}`.trim()).join(' · ');
}

export const isPreviewable = (mime: string | null | undefined, name = '') =>
  /^image\//.test(mime ?? '') || mime === 'application/pdf' || /\.(pdf|png|jpe?g|webp|gif|svg)$/i.test(name);
