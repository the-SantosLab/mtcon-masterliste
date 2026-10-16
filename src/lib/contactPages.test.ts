import { describe, it, expect } from 'vitest';
import {
  buildContactViews, emailState, filterForPage, groupByResponsible, isInactive, missingContactData,
  type Contact, type ContactActivity, type ContactDeal,
} from './contactPages';

const NOW = new Date('2026-06-01T00:00:00Z').getTime();

const contact = (p: Partial<Contact> = {}): Contact => ({
  id: 'k1', first_name: 'Max', last_name: 'Mustermann', company_id: 'f1', email: 'max@beispiel.de',
  phone: '+49 30 1234', mobile: null, position: 'Einkaufsleiter', salutation: 'Herr', notes: null,
  linkedin_url: null, is_decision_maker: false, email_opt_in: true, email_opt_in_at: null,
  email_opt_out_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...p,
} as Contact);

const activity = (p: Partial<ContactActivity> = {}): ContactActivity => ({
  id: 'a1', contact_id: 'k1', owner_id: 'u1', subject: 'Erstkontakt', type: 'call',
  created_at: '2026-01-05T00:00:00Z', completed_at: null, due_at: null, ...p,
});

const deal = (p: Partial<ContactDeal> = {}): ContactDeal => ({
  id: 'd1', primary_contact_id: 'k1', owner_id: 'u9', updated_at: '2026-02-01T00:00:00Z', ...p,
});

describe('Ansprechpartner-Seiten', () => {
  it('flags missing master data', () => {
    expect(missingContactData(contact({ company_id: null, phone: null, position: null }))).toEqual(['Firma', 'Telefon', 'Position']);
  });

  it('takes the responsible person from the newest activity', () => {
    const views = buildContactViews(
      [contact()],
      [activity(), activity({ id: 'a2', owner_id: 'u2', created_at: '2026-03-01T00:00:00Z' })],
      [deal()], new Set(), new Set(),
    );
    expect(views[0].responsible).toBe('u2');
    expect(views[0].activityCount).toBe(2);
  });

  it('falls back to the deal owner when nobody has logged an activity', () => {
    const views = buildContactViews([contact()], [], [deal()], new Set(), new Set());
    expect(views[0].responsible).toBe('u9');
  });

  it('marks contacts inactive only after 180 days without conversation', () => {
    expect(isInactive('2025-11-01T00:00:00Z', NOW)).toBe(true);
    expect(isInactive('2026-05-01T00:00:00Z', NOW)).toBe(false);
    expect(isInactive(null, NOW)).toBe(true);
  });

  it('prioritises withdrawal over a valid consent', () => {
    expect(emailState(contact({ email_opt_out_at: '2026-04-01T00:00:00Z' }))).toBe('abgemeldet');
    expect(emailState(contact(), { bounced: true })).toBe('unzustellbar');
    expect(emailState(contact({ email_opt_in: false }))).toBe('ohne_freigabe');
    expect(emailState(contact({ email: null }))).toBe('ohne');
  });

  it('shows only unassigned contacts on the assignment page', () => {
    const views = buildContactViews(
      [contact({ id: 'k1' }), contact({ id: 'k2', last_name: 'Zweite' })],
      [activity({ contact_id: 'k2' })], [], new Set(), new Set(),
    );
    expect(filterForPage('assign', views, NOW).map(v => v.c.id)).toEqual(['k1']);
  });

  it('lists long-silent contacts first on the inactive page', () => {
    const views = buildContactViews(
      [contact({ id: 'alt' }), contact({ id: 'neu', last_name: 'Neu' }), contact({ id: 'nie', last_name: 'Nie' })],
      [
        activity({ id: 'a1', contact_id: 'alt', created_at: '2025-06-01T00:00:00Z' }),
        activity({ id: 'a2', contact_id: 'neu', created_at: '2025-12-01T00:00:00Z' }),
      ],
      [], new Set(), new Set(),
    );
    expect(filterForPage('inactive', views, NOW).map(v => v.c.id)).toEqual(['alt', 'neu', 'nie']);
  });

  it('keeps unassigned contacts in their own group', () => {
    const views = buildContactViews([contact({ id: 'k1' }), contact({ id: 'k2' })], [activity({ contact_id: 'k2' })], [], new Set(), new Set());
    const groups = groupByResponsible(views, id => (id === 'u1' ? 'Anna Krug' : '–'));
    expect(groups.map(g => g.name)).toEqual(['Ohne Zuständigkeit', 'Anna Krug']);
  });
});
