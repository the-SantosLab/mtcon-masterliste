import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MtiqFab } from './MtiqFab';
import { MtiqPanel } from './MtiqPanel';
import { useMtiqUnread } from './useMtiqUnread';

const STORAGE_KEY = 'mtiq-fab-minimized';

export function MtiqWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const { total } = useMtiqUnread();

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, minimized ? '1' : '0'); } catch { /* ignore */ }
  }, [minimized]);

  if (!user) return null;
  if (location.pathname.startsWith('/auth')) return null;
  if (location.pathname.startsWith('/portal')) return null;
  if (location.pathname.startsWith('/reset-password')) return null;
  if (location.pathname.startsWith('/mfa-challenge')) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="MTIQ einblenden"
        title="MTIQ einblenden"
        style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
          zIndex: 9999,
          border: 'none',
          cursor: 'pointer',
          opacity: 0.55,
        }}
      />
    );
  }

  return (
    <>
      <MtiqPanel open={open} onClose={() => setOpen(false)} />
      <MtiqFab open={open} unread={total} onClick={() => setOpen(o => !o)} />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(false); setMinimized(true); }}
        aria-label="MTIQ ausblenden"
        title="MTIQ ausblenden"
        style={{
          position: 'fixed',
          bottom: 72,
          right: 24,
          width: 20,
          height: 20,
          borderRadius: 10,
          background: '#1a1a1a',
          color: '#e0e0e0',
          border: '1px solid #333',
          fontSize: 12,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        −
      </button>
    </>
  );
}
