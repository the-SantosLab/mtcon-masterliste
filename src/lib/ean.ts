/** Prüft GTIN/EAN (8, 12, 13 oder 14 Ziffern) inkl. Prüfziffer. */
export function validateEan(raw: string): string | null {
  const v = raw.trim();
  if (!/^\d+$/.test(v)) return 'EAN darf nur Ziffern enthalten';
  if (![8, 12, 13, 14].includes(v.length)) return 'EAN muss 8, 12, 13 oder 14 Ziffern haben';
  const digits = v.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  if ((10 - (sum % 10)) % 10 !== check) return 'EAN-Prüfziffer ist ungültig';
  return null;
}
