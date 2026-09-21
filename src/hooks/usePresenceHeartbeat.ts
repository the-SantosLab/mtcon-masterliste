import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const HEARTBEAT_MS = 30_000;
const ACTIVITY_THROTTLE_MS = 15_000;
// Der App-Rahmen wird bei jedem Seitenwechsel neu aufgebaut; ohne diese
// prozessweite Sperre würde bei jedem Wechsel ein Präsenz-Schreibvorgang laufen.
let lastMountPush = 0;

export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const location = useLocation();
  const lastActiveRef = useRef<number>(0);
  const lastPushedActiveRef = useRef<number>(0);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    lastActiveRef.current = Date.now();

    const push = async (markActive: boolean) => {
      const now = new Date().toISOString();
      const payload = {
        user_id: user.id,
        last_seen_at: now,
        current_path: pathRef.current,
        updated_at: now,
        ...(markActive ? { last_active_at: now } : {}),
      };
      if (markActive) lastPushedActiveRef.current = Date.now();
      await supabase.from('user_presence').upsert(payload, { onConflict: 'user_id' });
    };

    void push(true);

    const interval = setInterval(() => {
      if (cancelled) return;
      const recentlyActive = Date.now() - lastActiveRef.current < 60_000;
      void push(recentlyActive);
    }, HEARTBEAT_MS);

    const onActivity = () => {
      lastActiveRef.current = Date.now();
      if (Date.now() - lastPushedActiveRef.current > ACTIVITY_THROTTLE_MS) {
        void push(true);
      }
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActiveRef.current = Date.now();
        void push(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);
}
