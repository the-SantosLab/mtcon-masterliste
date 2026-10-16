import type { Tables } from '@/integrations/supabase/types';

export type AcquisitionLead = Tables<'leads'>;
export type AcquisitionActivity = Tables<'crm_activities'>;
export type AcquisitionCompany = Tables<'companies'>;
export type AcquisitionContact = Tables<'contacts'>;
export const acquisitionPages = [
  { key: 'research', title: 'Zielkunden recherchieren', short: 'Zielkunden', path: '/crm/outbound/research', type: 'task' },
  { key: 'people', title: 'Ansprechpartner identifizieren', short: 'Ansprechpartner', path: '/crm/outbound/people', type: 'task' },
  { key: 'email', title: 'Erstkontakt per E-Mail', short: 'E-Mail', path: '/crm/outbound/email', type: 'email' },
  { key: 'phone', title: 'Erstkontakt per Telefon', short: 'Telefon', path: '/crm/outbound/phone', type: 'call' },
  { key: 'social', title: 'LinkedIn / Xing', short: 'Netzwerke', path: '/crm/outbound/social', type: 'task' },
  { key: 'fairs', title: 'Messekontakt nachverfolgen', short: 'Messekontakte', path: '/crm/outbound/fairs', type: 'task' },
  { key: 'visits', title: 'Besuchstermin vereinbaren', short: 'Besuchstermine', path: '/crm/outbound/visits', type: 'meeting' },
  { key: 'campaigns', title: 'Akquisekampagnen', short: 'Kampagnen', path: '/crm/outbound/campaigns', type: 'task' },
] as const;
export type AcquisitionKey = typeof acquisitionPages[number]['key'];
export type ActivityKind = 'task' | 'email' | 'call' | 'meeting' | 'note';
export type AcquisitionSuggestion = {
  id: string; title: string; reason: string; channel: AcquisitionKey; type: ActivityKind;
  lead_id: string | null; company_id: string | null; contact_id: string | null;
  entityName: string; priority: 'high' | 'normal'; body?: string;
};
export const isOpenLead = (lead: AcquisitionLead) => !['konvertiert', 'abgelehnt'].includes(lead.status);
export const isFairLead = (lead: AcquisitionLead) => /messe|trade\s?fair|exhibition/i.test(lead.notes ?? '');
export const leadActivities = (lead: AcquisitionLead, activities: AcquisitionActivity[]) => activities.filter(a => a.lead_id === lead.id);

export function buildAcquisitionSuggestions(leads: AcquisitionLead[], activities: AcquisitionActivity[], now = Date.now()): AcquisitionSuggestion[] {
  return leads.filter(isOpenLead).flatMap(lead => {
    const history = leadActivities(lead, activities);
    // A planned next activity already covers this lead. Do not propose a duplicate.
    if (history.some(a => !a.completed_at)) return [];
    const base = { lead_id: lead.id, company_id: null, contact_id: null, entityName: lead.company_name };
    const suggest = (channel: AcquisitionKey, type: ActivityKind, title: string, reason: string, priority: 'high' | 'normal' = 'normal'): AcquisitionSuggestion[] =>
      [{ ...base, id: `${lead.id}:${channel}`, channel, type, title, reason, priority }];
    if (!lead.contact_name?.trim()) return suggest('people', 'task', 'Ansprechpartner recherchieren', 'Noch kein Ansprechpartner am Interessenten hinterlegt.');
    if (!lead.email && !lead.phone) return suggest('research', 'task', 'Kontaktdaten ergänzen', 'E-Mail-Adresse und Telefonnummer fehlen.');
    if (isFairLead(lead)) return suggest('fairs', 'task', 'Messekontakt nachfassen', 'Messebezug in den Notizen; keine nächste Aktivität geplant.', 'high');
    const completed = history.filter(a => a.completed_at).sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
    const last = completed[0];
    if (!last) return lead.email
      ? suggest('email', 'email', 'Erstkontakt vorbereiten', 'E-Mail-Adresse vorhanden; noch keine abgeschlossene Kontaktaktivität.')
      : suggest('phone', 'call', 'Erstgespräch führen', 'Telefonnummer vorhanden; noch keine abgeschlossene Kontaktaktivität.');
    const days = Math.floor((now - new Date(last.completed_at ?? last.created_at).getTime()) / 86_400_000);
    if (days >= 7) return suggest(lead.phone ? 'phone' : 'email', lead.phone ? 'call' : 'email', 'Kontakt wieder aufnehmen', `Letzte abgeschlossene Aktivität vor ${days} Tagen; kein Folgetermin.`, 'high');
    if (lead.status === 'qualifiziert') return suggest('visits', 'meeting', 'Bedarfsgespräch vereinbaren', 'Qualifizierter Interessent ohne geplantes Bedarfsgespräch.');
    return [];
  });
}

export function leadsForChannel(key: AcquisitionKey, leads: AcquisitionLead[], activities: AcquisitionActivity[]) {
  return leads.filter(isOpenLead).filter(lead => {
    const history = leadActivities(lead, activities);
    if (key === 'people') return !lead.contact_name?.trim();
    if (key === 'email') return Boolean(lead.email);
    if (key === 'phone') return Boolean(lead.phone);
    if (key === 'social') return lead.source === 'linkedin';
    if (key === 'fairs') return isFairLead(lead);
    if (key === 'visits') return lead.status === 'qualifiziert' || history.some(a => a.type === 'meeting');
    return true;
  });
}

export function parseAcquisitionAiReply(reply: string, candidates: AcquisitionSuggestion[]): AcquisitionSuggestion[] {
  const trimmed = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) throw new Error('MTIQ hat kein gültiges Vorschlagsformat geliefert.');
  const seen = new Set<string>();
  return parsed.slice(0, 5).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    const candidate = candidates.find(c => c.id === e.id);
    if (!candidate || seen.has(candidate.id) || typeof e.title !== 'string' || !e.title.trim() || typeof e.reason !== 'string' || !e.reason.trim()) return [];
    seen.add(candidate.id);
    return [{ ...candidate, title: e.title.slice(0, 160), reason: e.reason.slice(0, 600), body: typeof e.body === 'string' ? e.body.slice(0, 4000) : '' }];
  });
}