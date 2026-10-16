import type { Tables } from '@/integrations/supabase/types';

export type Offer = Tables<'offers'>;

/** Each sidebar point under "Angebote" is backed by its own page. */
export const offerPages = [
  { key: 'kalkulation', title: 'Angebotsentwürfe', short: 'Entwürfe', path: '/crm/angebote/kalkulation' },
  { key: 'versand', title: 'Versand & Nachverfolgung', short: 'Versand', path: '/crm/angebote/versand' },
  { key: 'versionen', title: 'Angebotsversionen', short: 'Versionen', path: '/crm/angebote/versionen' },
  { key: 'freigegeben', title: 'Angenommene Angebote', short: 'Angenommen', path: '/crm/angebote/freigegeben' },
  { key: 'auftraege', title: 'Aufträge erzeugen', short: 'Aufträge', path: '/crm/angebote/auftraege' },
] as const;
export type OfferPageKey = typeof offerPages[number]['key'];

export const statusLabel: Record<string, string> = {
  entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt', abgelaufen: 'Abgelaufen',
};

/** An offer still counts as open until it is accepted, rejected or expired. */
export const isOpenOffer = (o: Offer) => o.status === 'entwurf' || o.status === 'versendet';

/** Sent offer whose validity date has passed and that was never decided. */
export function isValidityOverdue(o: Offer, now = Date.now()): boolean {
  return o.status === 'versendet' && Boolean(o.valid_until) && new Date(o.valid_until!).getTime() < now;
}

/** Accepted offer that has not yet been turned into an order (no linked case). */
export const needsOrder = (o: Offer) => o.status === 'angenommen' && !o.case_id;

/** Data gaps that block sending or deciding the offer. */
export function missingOfferData(o: Offer): string[] {
  const m: string[] = [];
  if (!o.company_id) m.push('Firma');
  if (!o.primary_contact_id) m.push('Ansprechpartner');
  if (o.total == null) m.push('Gesamtbetrag');
  if (!o.valid_until) m.push('Gültig bis');
  if (!o.owner_id) m.push('Zuständige:r');
  return m;
}

const byValidAsc = (a: Offer, b: Offer) => (a.valid_until ?? '9999').localeCompare(b.valid_until ?? '9999');
const byTotalDesc = (a: Offer, b: Offer) => (b.total ?? 0) - (a.total ?? 0);
const byUpdatedDesc = (a: Offer, b: Offer) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '');

/** Which offers a sidebar page shows, and in which order. */
export function filterForPage(key: OfferPageKey | null, offers: Offer[], now = Date.now()): Offer[] {
  switch (key) {
    case 'kalkulation':
      return offers.filter(o => o.status === 'entwurf').sort(byUpdatedDesc);
    case 'versand':
      return offers.filter(o => o.status === 'versendet').sort(byValidAsc);
    case 'versionen':
      return offers.filter(o => (o.version ?? 1) > 1 || o.parent_offer_id).sort(byUpdatedDesc);
    case 'freigegeben':
      return offers.filter(o => o.status === 'angenommen').sort(byUpdatedDesc);
    case 'auftraege':
      return offers.filter(needsOrder).sort(byValidAsc);
    default:
      return [...offers].sort(byUpdatedDesc);
  }
}

/** Headline numbers for the overview page. */
export function overviewStats(offers: Offer[], now = Date.now()) {
  const open = offers.filter(isOpenOffer);
  return {
    open: open.length,
    openValue: open.reduce((s, o) => s + (o.total ?? 0), 0),
    drafts: offers.filter(o => o.status === 'entwurf').length,
    sent: offers.filter(o => o.status === 'versendet').length,
    overdue: offers.filter(o => isValidityOverdue(o, now)).length,
    accepted: offers.filter(o => o.status === 'angenommen').length,
    rejected: offers.filter(o => o.status === 'abgelehnt').length,
    needsOrder: offers.filter(needsOrder).length,
    unassigned: offers.filter(o => isOpenOffer(o) && !o.owner_id).length,
  };
}

/** Offers per status for the overview chart, in a fixed order. */
export function statusGroups(offers: Offer[]) {
  return ['entwurf', 'versendet', 'angenommen', 'abgelehnt', 'abgelaufen'].map(status => ({
    status,
    label: statusLabel[status],
    offers: offers.filter(o => o.status === status).sort(byTotalDesc),
  }));
}
