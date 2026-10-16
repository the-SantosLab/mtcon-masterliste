import type { Tables } from '@/integrations/supabase/types';

export type Contact = Tables<'contacts'>;
export type ContactActivity = {
  id: string; contact_id: string | null; owner_id: string | null; subject: string;
  type: string; created_at: string; completed_at: string | null; due_at: string | null;
};
export type ContactDeal = { id: string; primary_contact_id: string | null; owner_id: string | null; updated_at: string };

/** Each sidebar point under "Ansprechpartner" is backed by its own page. */
export const contactPages = [
  { key: 'data', title: 'Kontaktdaten pflegen', short: 'Pflegen', path: '/crm/ansprechpartner/pflegen' },
  { key: 'assign', title: 'Zuständigkeit zuweisen', short: 'Zuweisen', path: '/crm/ansprechpartner/zuweisen' },
  { key: 'owners', title: 'Verantwortlichkeiten', short: 'Zuständig', path: '/crm/ansprechpartner/verantwortlichkeiten' },
  { key: 'email', title: 'E-Mail-Adressen', short: 'E-Mail', path: '/crm/ansprechpartner/email' },
  { key: 'phone', title: 'Telefonverzeichnis', short: 'Telefon', path: '/crm/ansprechpartner/telefon' },
  { key: 'history', title: 'Kontaktverlauf', short: 'Verlauf', path: '/crm/ansprechpartner/historie' },
  { key: 'inactive', title: 'Inaktive Kontakte', short: 'Inaktiv', path: '/crm/ansprechpartner/inaktiv' },
] as const;
export type ContactPageKey = typeof contactPages[number]['key'];

export const INACTIVE_AFTER_DAYS = 180;
const DAY = 86_400_000;

export const fullName = (c: Contact) => `${c.first_name} ${c.last_name}`.trim();

/** Master-data gaps that block outreach or assignment. */
export function missingContactData(c: Contact): string[] {
  const m: string[] = [];
  if (!c.company_id) m.push('Firma');
  if (!c.email) m.push('E-Mail');
  if (!c.phone && !c.mobile) m.push('Telefon');
  if (!c.position) m.push('Position');
  if (!c.salutation) m.push('Anrede');
  return m;
}

export function lastActivityFor(contactId: string, activities: ContactActivity[]): ContactActivity | null {
  let best: ContactActivity | null = null;
  for (const a of activities) {
    if (a.contact_id !== contactId) continue;
    if (!best || a.created_at > best.created_at) best = a;
  }
  return best;
}

/** Responsible person: whoever logged the latest activity, otherwise the owner of the linked deal. */
export function responsibleFor(contactId: string, activities: ContactActivity[], deals: ContactDeal[]): string | null {
  const last = lastActivityFor(contactId, activities);
  if (last?.owner_id) return last.owner_id;
  const own = deals
    .filter(d => d.primary_contact_id === contactId && d.owner_id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return own[0]?.owner_id ?? null;
}

/** No recorded conversation for longer than the threshold (or never at all). */
export function isInactive(lastActivityAt: string | null, now = Date.now(), days = INACTIVE_AFTER_DAYS): boolean {
  if (!lastActivityAt) return true;
  return now - new Date(lastActivityAt).getTime() > days * DAY;
}

export type EmailState = 'ohne' | 'abgemeldet' | 'unzustellbar' | 'freigegeben' | 'ohne_freigabe';

export function emailState(c: Contact, opts: { unsubscribed?: boolean; bounced?: boolean } = {}): EmailState {
  if (!c.email) return 'ohne';
  if (opts.unsubscribed || c.email_opt_out_at) return 'abgemeldet';
  if (opts.bounced) return 'unzustellbar';
  if (c.email_opt_in) return 'freigegeben';
  return 'ohne_freigabe';
}

export type ContactView = {
  c: Contact;
  gaps: string[];
  lastActivityAt: string | null;
  lastSubject: string | null;
  responsible: string | null;
  email: EmailState;
  activityCount: number;
};

/** Join contacts with their activity trail, deal ownership and consent signals. */
export function buildContactViews(
  contacts: Contact[],
  activities: ContactActivity[],
  deals: ContactDeal[],
  unsubscribed: Set<string>,
  bounced: Set<string>,
): ContactView[] {
  const acts = new Map<string, ContactActivity[]>();
  for (const a of activities) {
    if (!a.contact_id) continue;
    acts.set(a.contact_id, [...(acts.get(a.contact_id) ?? []), a]);
  }
  const own = new Map<string, ContactDeal[]>();
  for (const dl of deals) {
    if (!dl.primary_contact_id) continue;
    own.set(dl.primary_contact_id, [...(own.get(dl.primary_contact_id) ?? []), dl]);
  }
  return contacts.map(c => {
    const mine = acts.get(c.id) ?? [];
    const last = lastActivityFor(c.id, mine);
    return {
      c,
      gaps: missingContactData(c),
      lastActivityAt: last?.created_at ?? null,
      lastSubject: last?.subject ?? null,
      responsible: responsibleFor(c.id, mine, own.get(c.id) ?? []),
      email: emailState(c, { unsubscribed: unsubscribed.has(c.id), bounced: bounced.has(c.id) }),
      activityCount: mine.length,
    };
  });
}

const emailRank: Record<EmailState, number> = { abgemeldet: 0, unzustellbar: 1, ohne_freigabe: 2, freigegeben: 3, ohne: 4 };

/** Which contacts a sidebar page shows, and in which order. */
export function filterForPage(key: ContactPageKey | null, views: ContactView[], now = Date.now()): ContactView[] {
  switch (key) {
    case 'data':
      return [...views].sort((a, b) => b.gaps.length - a.gaps.length || fullName(a.c).localeCompare(fullName(b.c)));
    case 'assign':
      return views.filter(v => !v.responsible).sort((a, b) => b.gaps.length - a.gaps.length);
    case 'owners':
      return views;
    case 'email':
      return views.filter(v => v.email !== 'ohne').sort((a, b) => emailRank[a.email] - emailRank[b.email]);
    case 'phone':
      return views.filter(v => Boolean(v.c.phone || v.c.mobile));
    case 'history':
      return [...views].sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
    case 'inactive':
      return views.filter(v => isInactive(v.lastActivityAt, now)).sort((a, b) => (a.lastActivityAt ?? '').localeCompare(b.lastActivityAt ?? ''));
    default:
      return [...views].sort((a, b) => b.gaps.length - a.gaps.length);
  }
}

export function groupByResponsible(views: ContactView[], nameOf: (id: string) => string): { name: string; members: ContactView[] }[] {
  const groups = new Map<string, ContactView[]>();
  for (const v of views) {
    const name = v.responsible ? nameOf(v.responsible) : 'Ohne Zuständigkeit';
    groups.set(name, [...(groups.get(name) ?? []), v]);
  }
  return [...groups]
    .map(([name, members]) => ({ name, members }))
    .sort((a, b) =>
      a.name === 'Ohne Zuständigkeit' ? -1
        : b.name === 'Ohne Zuständigkeit' ? 1
          : b.members.length - a.members.length);
}
