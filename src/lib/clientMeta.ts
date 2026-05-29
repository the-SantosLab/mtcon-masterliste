// Sammelt schlanke Browser-/App-Metadaten für Bug-Meldungen.
// Hält außerdem die letzten Konsolenfehler in einem In-Memory-Ringpuffer.

const MAX_LOG_ENTRIES = 5;
const recentErrors: { ts: string; level: 'error' | 'warn'; message: string }[] = [];

let installed = false;

export function installConsoleCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origError = console.error;
  const origWarn = console.warn;

  const push = (level: 'error' | 'warn', args: unknown[]) => {
    try {
      const message = args
        .map((a) => {
          if (a instanceof Error) return a.message;
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(' ')
        .slice(0, 500);
      recentErrors.push({ ts: new Date().toISOString(), level, message });
      while (recentErrors.length > MAX_LOG_ENTRIES) recentErrors.shift();
    } catch {
      /* ignore */
    }
  };

  console.error = (...args: unknown[]) => { push('error', args); origError.apply(console, args as []); };
  console.warn = (...args: unknown[]) => { push('warn', args); origWarn.apply(console, args as []); };

  window.addEventListener('error', (e) => push('error', [e.message]));
  window.addEventListener('unhandledrejection', (e) => push('error', [`Unhandled rejection: ${String(e.reason)}`]));
}

export function collectClientMeta(extra?: Record<string, unknown>) {
  const w = typeof window !== 'undefined' ? window : null;
  return {
    captured_at: new Date().toISOString(),
    url: w?.location.href ?? null,
    route: w?.location.pathname ?? null,
    viewport: w ? { width: w.innerWidth, height: w.innerHeight, dpr: w.devicePixelRatio } : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    language: typeof navigator !== 'undefined' ? navigator.language : null,
    platform: typeof navigator !== 'undefined' ? (navigator as any).userAgentData?.platform ?? navigator.platform : null,
    recent_console: [...recentErrors],
    app_version: (import.meta as any).env?.VITE_APP_VERSION ?? null,
    ...(extra ?? {}),
  };
}
