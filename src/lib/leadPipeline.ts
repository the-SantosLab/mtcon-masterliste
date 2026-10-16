import type { AcquisitionLead } from '@/lib/acquisition';

export const leadPages = [
  { key: 'qualify', title: 'Qualifizieren & schützen', short: 'Qualifizieren', path: '/crm/interessenten/qualifizieren' },
  { key: 'score', title: 'Interessenten bewerten', short: 'Bewertung', path: '/crm/interessenten/bewerten' },
  { key: 'assign', title: 'Zuständigkeit zuweisen', short: 'Zuweisen', path: '/crm/interessenten/zuweisen' },
  { key: 'convert', title: 'In Kunde umwandeln', short: 'Umwandeln', path: '/crm/interessenten/umwandeln' },
  { key: 'archive', title: 'Archivierte Interessenten', short: 'Archiv', path: '/crm/interessenten/archiv' },
  { key: 'history', title: 'Interessenten-Historie', short: 'Historie', path: '/crm/interessenten/historie' },
] as const;
export type LeadPageKey = typeof leadPages[number]['key'];

export const scoreBand = (score: number): 'hot' | 'warm' | 'cold' => score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
export const isProtected = (lead: AcquisitionLead, now = Date.now()) => Boolean(lead.protected_until && new Date(lead.protected_until).getTime() > now);
const open = (l: AcquisitionLead) => !['konvertiert', 'abgelehnt'].includes(l.status);

export function leadsForPage(key: LeadPageKey, leads: AcquisitionLead[]): AcquisitionLead[] {
  switch (key) {
    case 'qualify': return leads.filter(l => l.status === 'neu');
    case 'score': return leads.filter(open).sort((a, b) => b.score - a.score);
    case 'assign': return leads.filter(open).sort((a, b) => Number(Boolean(a.assigned_to)) - Number(Boolean(b.assigned_to)));
    case 'convert': return leads.filter(l => l.status === 'qualifiziert' || l.status === 'eingeschrieben');
    case 'archive': return leads.filter(l => l.status === 'abgelehnt');
    case 'history': return [...leads].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}
