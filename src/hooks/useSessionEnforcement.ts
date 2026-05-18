import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LS_KEY = 'mtcon.session_token';
const POLL_MS = 60_000;

export function getLocalSessionToken(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
export function setLocalSessionToken(t: string | null) {
  try {
    if (t) localStorage.setItem(LS_KEY, t);
    else localStorage.removeItem(LS_KEY);
  } catch {}
}

export function useSessionEnforcement(enabled: boolean, userId: string | undefined) {
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const local = getLocalSessionToken();
        if (!local) return; // not yet established by login flow
        const { data, error } = await supabase
          .from('users_profile')
          .select('active_session_token')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const remote = (data as any).active_session_token as string | null;
        if (remote && remote !== local) {
          setLocalSessionToken(null);
          await supabase.auth.signOut();
          toast.error('Du wurdest abgemeldet, da dein Konto in einem anderen Browser geöffnet wurde.');
          window.location.href = '/auth';
        }
      } finally {
        checkingRef.current = false;
      }
    };

    check();
    const id = window.setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, userId]);
}
