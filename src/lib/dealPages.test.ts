import { describe, expect, it } from 'vitest';
import {
  effectiveProbability, filterForPage, isCloseOverdue, isOpenDeal, missingDealData, nextStage,
  overviewStats, pipelineGroups, weightedValue, type Deal,
} from './dealPages';

const NOW = new Date('2026-10-16T08:00:00Z').getTime();
const deal = (over: Partial<Deal>): Deal => ({
  id: crypto.randomUUID(), deal_no: 'D-1', title: 'T', stage: 'anfrage', currency: 'EUR',
  company_id: 'c1', primary_contact_id: 'p1', owner_id: 'u1',
  value_estimated: 10000, value_final: null, probability_override: null,
  expected_close_date: '2026-11-01', quantity: null, sop: null, delivery_address: null,
  lead_source: null, lost_at: null, lost_details: null, lost_reason_id: null,
  won_at: null, won_case_id: null, stage_changed_at: '2026-10-01', created_at: '2026-10-01',
  created_by: null, updated_at: '2026-10-01', ...over,
} as Deal);

const probs = [{ stage: 'anfrage', probability: 20 }, { stage: 'verhandlung', probability: 60 }];

describe('deal page rules', () => {
  it('treats only won and lost as closed', () => {
    expect(isOpenDeal(deal({ stage: 'verhandlung' }))).toBe(true);
    expect(isOpenDeal(deal({ stage: 'won' }))).toBe(false);
    expect(isOpenDeal(deal({ stage: 'lost' }))).toBe(false);
  });

  it('uses the manual probability override before the stage default', () => {
    expect(effectiveProbability(deal({ probability_override: 45 }), probs)).toBe(45);
    expect(effectiveProbability(deal({ stage: 'verhandlung' }), probs)).toBe(60);
    expect(effectiveProbability(deal({ stage: 'qualifikation' }), probs)).toBe(0);
  });

  it('weights the pipeline value by the effective probability', () => {
    expect(weightedValue(deal({ value_estimated: 10000 }), probs)).toBe(2000);
    expect(weightedValue(deal({ value_estimated: 10000, probability_override: 50 }), probs)).toBe(5000);
    expect(weightedValue(deal({ value_estimated: null, value_final: null }), probs)).toBe(0);
  });

  it('flags open deals past their expected close date as overdue', () => {
    expect(isCloseOverdue(deal({ expected_close_date: '2026-10-01' }), NOW)).toBe(true);
    expect(isCloseOverdue(deal({ expected_close_date: '2026-12-01' }), NOW)).toBe(false);
    expect(isCloseOverdue(deal({ stage: 'won', expected_close_date: '2026-10-01' }), NOW)).toBe(false);
    expect(isCloseOverdue(deal({ expected_close_date: null }), NOW)).toBe(false);
  });

  it('lists missing evaluation data', () => {
    expect(missingDealData(deal({}))).toEqual([]);
    expect(missingDealData(deal({ value_estimated: null, expected_close_date: null, company_id: null, primary_contact_id: null, owner_id: null })))
      .toEqual(['Wert', 'Abschlussdatum', 'Firma', 'Ansprechpartner', 'Zuständige:r']);
  });

  it('due page shows only overdue open deals, earliest first', () => {
    const list = [
      deal({ expected_close_date: '2026-09-01' }),
      deal({ expected_close_date: '2026-08-01' }),
      deal({ expected_close_date: '2026-12-01' }),
      deal({ stage: 'lost', expected_close_date: '2026-08-01' }),
    ];
    const out = filterForPage('due', list, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].expected_close_date).toBe('2026-08-01');
  });

  it('assign page shows only open deals without an owner', () => {
    const list = [deal({ owner_id: null }), deal({}), deal({ stage: 'won', owner_id: null })];
    expect(filterForPage('assign', list, NOW)).toHaveLength(1);
  });

  it('pipeline groups open deals by stage in pipeline order', () => {
    const list = [deal({ stage: 'verhandlung' }), deal({ stage: 'anfrage' }), deal({ stage: 'won' })];
    const groups = pipelineGroups(list.filter(isOpenDeal));
    expect(groups.map(g => g.label)).toEqual(['Anfrage', 'Qualifikation', 'Angebot versendet', 'Verhandlung']);
    expect(groups[0].deals).toHaveLength(1);
    expect(groups[3].deals).toHaveLength(1);
  });

  it('overview stats aggregate open, weighted, overdue, won and lost', () => {
    const list = [
      deal({ value_estimated: 10000, expected_close_date: '2026-09-01' }),
      deal({ value_estimated: 20000, owner_id: null }),
      deal({ stage: 'won', won_at: '2026-10-10' }),
      deal({ stage: 'lost', lost_at: '2026-10-09' }),
    ];
    expect(overviewStats(list, probs, NOW)).toEqual({
      open: 2, openValue: 30000, weighted: 6000, overdue: 1, unassigned: 1, won: 1, lost: 1,
    });
  });

  it('advances to the next pipeline stage and stops at the last open stage', () => {
    expect(nextStage(deal({ stage: 'anfrage' }))).toBe('qualifikation');
    expect(nextStage(deal({ stage: 'verhandlung' }))).toBeNull();
    expect(nextStage(deal({ stage: 'won' }))).toBeNull();
  });
});
