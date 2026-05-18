import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TAB_TOKEN_KEY = 'mtcon.session_token';
const BROWSER_TOKEN_KEY = 'mtcon.browser_session_token';
const BLOCKED_KEY = 'mtcon.session_blocked';
const POLL_MS = 60_000;

// WICHTIG: sessionStorage statt localStorage, damit jeder Tab seinen
// eigenen Token hat. localStorage wird zwischen Tabs desselben Browsers
// geteilt — dann würde Single-Session-Enforcement nicht greifen, wenn der
// Nutzer in mehreren Tabs eingeloggt ist.
export function getLocalSessionToken(): string | null {
  try { return sessionStorage.getItem(TAB_TOKEN_KEY); } catch { return null; }
}
export function setLocalSessionToken(t: string | null) {
  try {
    if (t) {
      sessionStorage.setItem(TAB_TOKEN_KEY, t);
      sessionStorage.removeItem(BLOCKED_KEY);
      localStorage.setItem(BROWSER_TOKEN_KEY, t);
    } else {
      sessionStorage.removeItem(TAB_TOKEN_KEY);
    }
  } catch {}
}

export function isCurrentTabSessionBlocked(): boolean {
  try { return sessionStorage.getItem(BLOCKED_KEY) === '1'; } catch { return false; }
}

export function clearSessionEnforcementState() {
  try {
    sessionStorage.removeItem(TAB_TOKEN_KEY);
    sessionStorage.removeItem(BLOCKED_KEY);
    localStorage.removeItem(BROWSER_TOKEN_KEY);
    localStorage.removeItem(TAB_TOKEN_KEY);
  } catch {}
}

function blockCurrentTab() {
  try {
    sessionStorage.removeItem(TAB_TOKEN_KEY);
    sessionStorage.setItem(BLOCKED_KEY, '1');
  } catch {}
}

function getBrowserSessionToken(): string | null {
  try { return localStorage.getItem(BROWSER_TOKEN_KEY); } catch { return null; }
}

function goToAuth() {
  if (window.location.pathname !== '/auth') window.location.href = '/auth';
}

export function useSessionEnforcement(enabled: boolean, userId: string | undefined) {
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;

    const check = async () => {
      if (checkingRef.current) return;
      if (isCurrentTabSessionBlocked()) return;
      checkingRef.current = true;
      try {
        const local = getLocalSessionToken();
        const { data, error } = await supabase
          .from('users_profile')
          .select('active_session_token')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const remote = (data as any).active_session_token as string | null;

        if (!local) {
          if (remote) {
            blockCurrentTab();
            toast.error('Diese Sitzung ist bereits in einem anderen Tab aktiv. Bitte melde dich hier erneut an, um sie zu übernehmen.');
            goToAuth();
            return;
          }

          const token = crypto.randomUUID();
          const { error: updateError } = await supabase
            .from('users_profile')
            .update({ active_session_token: token } as any)
            .eq('id', userId);
          if (!updateError && !cancelled) setLocalSessionToken(token);
          return;
        }

        if (!remote) {
          blockCurrentTab();
          clearSessionEnforcementState();
          await supabase.auth.signOut();
          toast.error('Deine Sitzung wurde beendet. Bitte melde dich erneut an.');
          goToAuth();
          return;
        }

        if (remote !== local) {
          const sameBrowserTakeover = getBrowserSessionToken() === remote;
          setLocalSessionToken(null);
          blockCurrentTab();
          if (!sameBrowserTakeover) {
            clearSessionEnforcementState();
            await supabase.auth.signOut();
          }
          toast.error('Du wurdest abgemeldet, da dein Konto in einem anderen Browser geöffnet wurde.');
          goToAuth();
        }
      } finally {
        checkingRef.current = false;
      }
    };

    check();
    const id = window.setInterval(check, POLL_MS);
    const onFocus = () => check();
    const onStorage = (event: StorageEvent) => {
      if (event.key === BROWSER_TOKEN_KEY && event.newValue !== getLocalSessionToken()) check();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, userId]);
}
