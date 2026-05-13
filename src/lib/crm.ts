export const STAGES = [
  { key: 'anfrage', label: 'Anfrage' },
  { key: 'qualifikation', label: 'Qualifikation' },
  { key: 'angebot_versendet', label: 'Angebot versendet' },
  { key: 'verhandlung', label: 'Verhandlung' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
] as const;

export type StageKey = typeof STAGES[number]['key'];

export const stageColor = (s: StageKey) => {
  switch (s) {
    case 'anfrage': return 'hsl(var(--status-open))';
    case 'qualifikation': return 'hsl(var(--status-planning))';
    case 'angebot_versendet': return 'hsl(var(--status-working))';
    case 'verhandlung': return 'hsl(var(--status-overdue))';
    case 'won': return 'hsl(var(--status-done))';
    case 'lost': return 'hsl(var(--status-rejected))';
  }
};

export const formatEUR = (n: number | null | undefined) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
    : '–';

export const daysSince = (iso: string | null | undefined) => {
  if (!iso) return 0;
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
};
