import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizeFileName(name: string): string {
  // Supabase storage keys reject non-ASCII and many special chars.
  // Normalize umlauts and strip anything not [A-Za-z0-9._-]
  const map: Record<string, string> = { 'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss' };
  const replaced = name.replace(/[äöüÄÖÜß]/g, c => map[c] || c);
  const normalized = replaced.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'file';
}
