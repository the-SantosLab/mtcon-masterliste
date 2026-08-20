import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "__chunk_reload_at";

/**
 * React.lazy with retry + one-time hard reload.
 * Handles stale chunk hashes after a new deploy.
 */
export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // Second attempt (transient network / partially warm cache)
      try {
        await new Promise((r) => setTimeout(r, 400));
        return await factory();
      } catch (err2) {
        try {
          const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
          if (Date.now() - last > 10_000) {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
            window.location.reload();
            // Keep the promise pending while the page reloads
            return await new Promise<{ default: T }>(() => {});
          }
        } catch {
          window.location.reload();
          return await new Promise<{ default: T }>(() => {});
        }
        throw err2 ?? err;
      }
    }
  });
}
