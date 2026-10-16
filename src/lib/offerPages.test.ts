import { describe, expect, it } from 'vitest';
import {
  filterForPage, isOpenOffer, isValidityOverdue, missingOfferData, needsOrder,
  overviewStats, statusGroups, type Offer,
} from './offerPages';

const base = {
  id: '1', offer_no: 'AN-1', deal_id: null, valid_until: null, total: null,
  sent_at: null, created_by: null, created_at: null, company_id: 'c1',
  primary_contact_id: null, delivery_address: null, payment_terms: null, notes: null,
  pdf_url: null, version: 1, parent_offer_id: null, owner_id: null,
  accepted_at: null, rejected_at: null, locked: false, locked_at: null, locked_by: null,
  case_id: null, updated_at: '2026-01-01',
} as unknown as Offer;

const offer = (over: Partial<Offer>): Offer => ({ ...base, ...over });
const NOW = new Date('2026-10-16T00:00:00Z').getTime();

describe('offerPages rules', () => {
  it('counts entwurf and versendet as open, everything decided as closed', () => {
    expect(isOpenOffer(offer({ status: 'entwurf' }))).toBe(true);
    expect(isOpenOffer(offer({ status: 'versendet' }))).toBe(true);
    expect(isOpenOffer(offer({ status: 'angenommen' }))).toBe(false);
    expect(isOpenOffer(offer({ status: 'abgelehnt' }))).toBe(false);
  });

  it('flags only sent offers whose validity date has passed', () => {
    expect(isValidityOverdue(offer({ status: 'versendet', valid_until: '2026-10-01' }), NOW)).toBe(true);
    expect(isValidityOverdue(offer({ status: 'versendet', valid_until: '2026-12-01' }), NOW)).toBe(false);
    expect(isValidityOverdue(offer({ status: 'entwurf', valid_until: '2026-10-01' }), NOW)).toBe(false);
  });

  it('requires an order only for accepted offers without a linked case', () => {
    expect(needsOrder(offer({ status: 'angenommen', case_id: null }))).toBe(true);
    expect(needsOrder(offer({ status: 'angenommen', case_id: 'case-1' }))).toBe(false);
    expect(needsOrder(offer({ status: 'versendet', case_id: null }))).toBe(false);
  });

  it('lists missing data for kalkulation', () => {
    expect(missingOfferData(offer({ company_id: null, total: null, valid_until: null })))
      .toEqual(['Firma', 'Ansprechpartner', 'Gesamtbetrag', 'Gültig bis', 'Zuständige:r']);
    expect(missingOfferData(offer({ primary_contact_id: 'p1', total: 100, valid_until: '2026-11-01', owner_id: 'u1' }))).toEqual([]);
  });

  it('filters each page to its own slice', () => {
    const list = [
      offer({ id: 'a', status: 'entwurf' }),
      offer({ id: 'b', status: 'versendet', valid_until: '2026-10-01' }),
      offer({ id: 'c', status: 'angenommen', case_id: null }),
      offer({ id: 'd', status: 'angenommen', case_id: 'case-1' }),
      offer({ id: 'e', status: 'entwurf', version: 2, parent_offer_id: 'a' }),
    ];
    expect(filterForPage('kalkulation', list).map(o => o.id)).toEqual(['e', 'a']);
    expect(filterForPage('versand', list).map(o => o.id)).toEqual(['b']);
    expect(filterForPage('versionen', list).map(o => o.id)).toEqual(['e']);
    expect(filterForPage('freigegeben', list).map(o => o.id).sort()).toEqual(['c', 'd']);
    expect(filterForPage('auftraege', list).map(o => o.id)).toEqual(['c']);
  });

  it('computes overview stats', () => {
    const list = [
      offer({ status: 'entwurf', total: 100 }),
      offer({ status: 'versendet', total: 200, valid_until: '2026-10-01' }),
      offer({ status: 'angenommen', case_id: null }),
      offer({ status: 'abgelehnt' }),
    ];
    const s = overviewStats(list, NOW);
    expect(s).toMatchObject({ open: 2, openValue: 300, drafts: 1, sent: 1, overdue: 1, accepted: 1, rejected: 1, needsOrder: 1, unassigned: 2 });
  });

  it('groups offers per status in fixed order', () => {
    const groups = statusGroups([offer({ status: 'versendet' }), offer({ status: 'entwurf' })]);
    expect(groups.map(g => g.status)).toEqual(['entwurf', 'versendet', 'angenommen', 'abgelehnt', 'abgelaufen']);
    expect(groups[0].offers).toHaveLength(1);
    expect(groups[1].offers).toHaveLength(1);
  });
});
