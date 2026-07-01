// Global session-scoped toast queue with hard cap + dedup.
// Prevents burst-toast storms (e.g. SLA alerts) from blocking navigation.
import { toast } from 'sonner';

type Variant = 'default' | 'success' | 'error' | 'warning' | 'info';
type Options = { description?: string; duration?: number; dedupKey?: string; dedupTtlMs?: number };

const MAX_ACTIVE = 3;              // max simultaneously visible toasts
const MAX_PER_WINDOW = 8;          // rate limit per rolling window
const WINDOW_MS = 10_000;
const DEFAULT_DEDUP_TTL = 60_000;  // suppress identical key within this window

const recentKeys = new Map<string, number>(); // key -> lastShownAt
const timestamps: number[] = [];
let active = 0;
const pending: Array<() => void> = [];

function pump() {
  while (active < MAX_ACTIVE && pending.length > 0) {
    const run = pending.shift()!;
    run();
  }
}

function withinRate(): boolean {
  const now = Date.now();
  while (timestamps.length && now - timestamps[0] > WINDOW_MS) timestamps.shift();
  return timestamps.length < MAX_PER_WINDOW;
}

function pruneDedup() {
  const now = Date.now();
  for (const [k, t] of recentKeys) {
    if (now - t > DEFAULT_DEDUP_TTL) recentKeys.delete(k);
  }
}

export function queueToast(variant: Variant, message: string, opts: Options = {}): boolean {
  pruneDedup();
  const key = opts.dedupKey ?? `${variant}:${message}:${opts.description ?? ''}`;
  const ttl = opts.dedupTtlMs ?? DEFAULT_DEDUP_TTL;
  const last = recentKeys.get(key);
  if (last && Date.now() - last < ttl) return false;
  if (!withinRate()) return false;

  recentKeys.set(key, Date.now());
  timestamps.push(Date.now());

  const duration = opts.duration ?? 4000;
  const run = () => {
    active += 1;
    const fn = variant === 'default' ? toast : (toast as any)[variant];
    fn(message, {
      description: opts.description,
      duration,
      onDismiss: () => { active -= 1; pump(); },
      onAutoClose: () => { active -= 1; pump(); },
    });
  };

  if (active < MAX_ACTIVE) run();
  else pending.push(run);
  return true;
}

export const qToast = {
  success: (m: string, o?: Options) => queueToast('success', m, o),
  error:   (m: string, o?: Options) => queueToast('error', m, o),
  warning: (m: string, o?: Options) => queueToast('warning', m, o),
  info:    (m: string, o?: Options) => queueToast('info', m, o),
  show:    (m: string, o?: Options) => queueToast('default', m, o),
};
