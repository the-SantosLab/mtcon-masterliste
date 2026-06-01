import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { storeAuthRedirect } from '@/lib/authRedirect';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
const WARNING_MS = 15 * 60 * 1000; // 15 min before logout

export function useSessionTimeout(enabled: boolean) {
  const [timeoutHours, setTimeoutHours] = useState<number | null>(8);
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingMs, setRemainingMs] = useState(WARNING_MS);
  const location = useLocation();

  const lastActivityRef = useRef<number>(Date.now());
  const warnTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // Load timeout setting
  useEffect(() => {
    if (!enabled) return;
    supabase.from('system_settings').select('value').eq('key', 'session_timeout_hours').maybeSingle()
      .then(({ data }) => {
        const v = data?.value;
        if (v === null || v === 'never' || v === 0) setTimeoutHours(null);
        else if (typeof v === 'number') setTimeoutHours(v);
        else if (typeof v === 'string') setTimeoutHours(v === 'never' ? null : Number(v));
      });
  }, [enabled]);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) { window.clearTimeout(warnTimerRef.current); warnTimerRef.current = null; }
    if (logoutTimerRef.current) { window.clearTimeout(logoutTimerRef.current); logoutTimerRef.current = null; }
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const doLogout = useCallback(async () => {
    clearTimers();
    setWarningOpen(false);
    await supabase.auth.signOut();
    const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    storeAuthRedirect(target);
    window.location.href = `/auth?redirect=${encodeURIComponent(target)}`;
  }, [clearTimers]);

  const resetTimer = useCallback(() => {
    if (!enabled || timeoutHours === null) return;
    lastActivityRef.current = Date.now();
    setWarningOpen(false);
    clearTimers();
    const totalMs = timeoutHours * 60 * 60 * 1000;
    const warnAt = Math.max(totalMs - WARNING_MS, 1000);
    warnTimerRef.current = window.setTimeout(() => {
      setRemainingMs(WARNING_MS);
      setWarningOpen(true);
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - (lastActivityRef.current + warnAt);
        const left = WARNING_MS - elapsed;
        setRemainingMs(left > 0 ? left : 0);
      }, 1000);
      logoutTimerRef.current = window.setTimeout(() => { doLogout(); }, WARNING_MS);
    }, warnAt);
  }, [enabled, timeoutHours, clearTimers, doLogout]);

  // Attach activity listeners
  useEffect(() => {
    if (!enabled || timeoutHours === null) { clearTimers(); return; }
    resetTimer();
    const onActivity = () => {
      if (warningOpen) return; // during warning only modal buttons reset
      const now = Date.now();
      // Throttle: only reset if >5s since last
      if (now - lastActivityRef.current > 5000) resetTimer();
      else lastActivityRef.current = now;
    };
    ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, onActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, onActivity));
      clearTimers();
    };
  }, [enabled, timeoutHours, resetTimer, clearTimers, warningOpen]);

  // Reset on route change
  useEffect(() => {
    if (!warningOpen) resetTimer();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    warningOpen,
    remainingMs,
    stayLoggedIn: resetTimer,
    logoutNow: doLogout,
  };
}
