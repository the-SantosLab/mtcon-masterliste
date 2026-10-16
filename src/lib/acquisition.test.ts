import { describe, it, expect } from 'vitest';
import { buildAcquisitionSuggestions, leadsForChannel, parseAcquisitionAiReply, type AcquisitionLead, type AcquisitionActivity } from './acquisition';

const lead = (patch: Partial<AcquisitionLead> = {}) => ({ id: 'lead-1', company_name: 'Prüffirma', contact_name: 'Anna Test', email: 'anna@example.test', phone: '123', status: 'neu', notes: null, source: 'manuell', ...patch } as AcquisitionLead);
const activity = (patch: Partial<AcquisitionActivity> = {}) => ({ id: 'act-1', lead_id: 'lead-1', completed_at: null, type: 'call', created_at: '2026-10-01T09:00:00Z', ...patch } as AcquisitionActivity);
describe('Acquisition suggestions', () => {
  it('excludes rejected and converted leads', () => {
    expect(buildAcquisitionSuggestions([lead({ status: 'abgelehnt' }), lead({ status: 'konvertiert' })], [])).toEqual([]);
  });
  it('does not suggest duplicate activities for leads with an open next step', () => {
    expect(buildAcquisitionSuggestions([lead()], [activity()])).toEqual([]);
  });
  it('prioritizes missing contact names', () => {
    expect(buildAcquisitionSuggestions([lead({ contact_name: null })], [])[0]?.channel).toBe('people');
  });
  it('suggests follow-up only after seven days', () => {
    const done = activity({ completed_at: '2026-10-01T09:00:00Z' });
    expect(buildAcquisitionSuggestions([lead()], [done], Date.parse('2026-10-08T08:59:59Z'))).toEqual([]);
    expect(buildAcquisitionSuggestions([lead()], [done], Date.parse('2026-10-08T09:00:00Z'))[0]?.priority).toBe('high');
  });
  it('keeps fair leads separate from ordinary followups', () => {
    expect(leadsForChannel('fairs', [lead({ notes: 'Messe Hannover' }), lead({ id: 'other' })], []).map(l => l.id)).toEqual(['lead-1']);
  });
  it('requires an email address for email worklists', () => {
    expect(leadsForChannel('email', [lead({ email: null }), lead({ id: 'with-email' })], []).map(l => l.id)).toEqual(['with-email']);
  });
  it('only accepts MTIQ suggestions for known candidates and preserves their links and types', () => {
    const candidates = buildAcquisitionSuggestions([lead()], []);
    const results = parseAcquisitionAiReply(JSON.stringify([{ id: candidates[0]?.id, title: 'Nachfragen', reason: 'Bedarf erfragen', type: 'call', lead_id: 'wrong' }, { id: 'invented', title: 'Fake', reason: 'Fake' }]), candidates);
    expect(results).toHaveLength(1);
    expect(results[0]?.lead_id).toBe('lead-1');
    expect(results[0]?.type).toBe('email');
  });
});