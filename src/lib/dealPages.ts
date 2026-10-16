import type { Tables } from '@/integrations/supabase/types';

export type Deal = Tables<'deals'>;
export type StageProbability = { stage: string; probability: number };

/** Each sidebar point under "Verkaufschancen" is backed by its own page. */
export const dealPages = [
  { key: 'pipeline', title: 'Pipeline nach Phase', short: 'Pipeline', path: '/crm/verkaufschancen/pipeline' },
  { key: 'rate', title: 'Bewerten & Umsatzpotenzial', short: 'Bewerten', path: '/crm/verkaufschancen/bewerten' },
  { key: 'stages', title: 'Phase weiterschieben', short: 'Phasen', path: '/crm/verkaufschancen/phasen' },
  { key: 'due', title: 'Fällige Abschlüsse', short: 'Fällig', path: '/crm/verkaufschancen/faellig' },
  { key: 'assign', title: 'Zuständigkeit zuweisen', short: 'Zuweisen', path: '/crm/verkaufschancen/zuweisen' },
  { key: 'closed', title: 'Abgeschlossene Chancen', short: 'Abgeschlossen', path: '/crm/verkaufschancen/abgeschlossen' },
] as const;
export type DealPageKey = typeof dealPages[number]['key'];

export const stageLabel: Record<string, string> = {
  anfrage: 'Anfrage', qualifikation: 'Qualifikation', angebot_versendet: 'Angebot versendet',
  verhandlung: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren',
};
export const openStages = ['anfrage', 'qualifikation', 'angebot_versendet', 'verhandlung'] as const;

export const isOpenDeal = (d: Deal) => d.stage !== 'won' && d.stage !== 'lost';

/** Effective win probability: manual override beats the stage default. */
export function effectiveProbability(d: Deal, stageProbs: StageProbability[]): number {
  if (d.probability_override != null) return d.probability_override;
  return stageProbs.find(p => p.stage === d.stage)?.probability ?? 0;
}

/** Weighted pipeline value in the deal's currency unit. */
export function weightedValue(d: Deal, stageProbs: StageProbability[]): number {
  const v = d.value_final ?? d.value_estimated ?? 0;
  return Math.round(v * effectiveProbability(d, stageProbs)) / 100;
}

/** Open deal whose expected close date lies in the past. */
export function isCloseOverdue(d: Deal, now = Date.now()): boolean {
  return isOpenDeal(d) && Boolean(d.expected_close_date) && new Date(d.expected_close_date!).getTime() < now;
}

/** Data gaps that block a serious evaluation of the deal. */
export function missingDealData(d: Deal): string[] {
  const m: string[] = [];
  if (d.value_estimated == null && d.value_final == null) m.push('Wert');
  if (!d.expected_close_date) m.push('Abschlussdatum');
  if (!d.company_id) m.push('Firma');
  if (!d.primary_contact_id) m.push('Ansprechpartner');
  if (!d.owner_id) m.push('Zuständige:r');
  return m;
}

const byCloseAsc = (a: Deal, b: Deal) => (a.expected_close_date ?? '9999').localeCompare(b.expected_close_date ?? '9999');
const byValueDesc = (a: Deal, b: Deal) => (b.value_final ?? b.value_estimated ?? 0) - (a.value_final ?? a.value_estimated ?? 0);

/** Which deals a sidebar page shows, and in which order. */
export function filterForPage(key: DealPageKey | null, deals: Deal[], now = Date.now()): Deal[] {
  switch (key) {
    case 'pipeline':
      return deals.filter(isOpenDeal).sort(byCloseAsc);
    case 'rate':
      return deals.filter(isOpenDeal).sort((a, b) => missingDealData(b).length - missingDealData(a).length || byValueDesc(a, b));
    case 'stages':
      return deals.filter(isOpenDeal).sort(byCloseAsc);
    case 'due':
      return deals.filter(d => isCloseOverdue(d, now)).sort(byCloseAsc);
    case 'assign':
      return deals.filter(d => isOpenDeal(d) && !d.owner_id).sort(byValueDesc);
    case 'closed':
      return deals.filter(d => !isOpenDeal(d)).sort((a, b) => (b.won_at ?? b.lost_at ?? '').localeCompare(a.won_at ?? a.lost_at ?? ''));
    default:
      return [...deals].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

/** Open deals grouped by stage, in pipeline order. */
export function pipelineGroups(deals: Deal[]): { stage: string; label: string; deals: Deal[] }[] {
  return openStages.map(stage => ({
    stage,
    label: stageLabel[stage],
    deals: deals.filter(d => d.stage === stage).sort(byValueDesc),
  }));
}

/** Overview counters for the workspace start page. */
export function overviewStats(deals: Deal[], stageProbs: StageProbability[], now = Date.now()) {
  const open = deals.filter(isOpenDeal);
  const won = deals.filter(d => d.stage === 'won');
  const lost = deals.filter(d => d.stage === 'lost');
  return {
    open: open.length,
    openValue: open.reduce((s, d) => s + (d.value_final ?? d.value_estimated ?? 0), 0),
    weighted: open.reduce((s, d) => s + weightedValue(d, stageProbs), 0),
    overdue: open.filter(d => isCloseOverdue(d, now)).length,
    unassigned: open.filter(d => !d.owner_id).length,
    won: won.length,
    lost: lost.length,
  };
}

/** Next stage in the pipeline, or null when already at the last open stage. */
export function nextStage(d: Deal): string | null {
  const i = openStages.indexOf(d.stage as typeof openStages[number]);
  return i >= 0 && i < openStages.length - 1 ? openStages[i + 1] : null;
}

/** Project details sales needs before handing a deal over to fulfillment. */
export function missingProjectInfo(d: Pick<Deal, 'sop' | 'delivery_address' | 'quantity'>): string[] {
  const m: string[] = [];
  if (!d.sop?.trim()) m.push('SOP');
  if (!d.delivery_address?.trim()) m.push('Lieferadresse');
  if (d.quantity == null || d.quantity <= 0) m.push('Menge');
  return m;
}

/** Per competitor: how often it appears and how those deals ended. */
export function competitorStats(links: { competitor_id: string; deal_id: string }[], deals: Pick<Deal, 'id' | 'stage'>[]) {
  const stageOf = new Map(deals.map(d => [d.id, d.stage]));
  const map = new Map<string, { deals: number; won: number; lost: number; open: number }>();
  for (const l of links) {
    const s = stageOf.get(l.deal_id); if (!s) continue;
    const e = map.get(l.competitor_id) ?? { deals: 0, won: 0, lost: 0, open: 0 };
    e.deals++; if (s === 'won') e.won++; else if (s === 'lost') e.lost++; else e.open++;
    map.set(l.competitor_id, e);
  }
  return map;
}
