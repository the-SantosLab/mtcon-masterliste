import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MtiqFab } from './MtiqFab';
import { MtiqPanel } from './MtiqPanel';
import { useMtiqUnread } from './useMtiqUnread';

export function MtiqWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { total } = useMtiqUnread();

  if (!user) return null;
  if (location.pathname.startsWith('/auth')) return null;
  if (location.pathname.startsWith('/portal')) return null;
  if (location.pathname.startsWith('/reset-password')) return null;
  if (location.pathname.startsWith('/mfa-challenge')) return null;

  return (
    <>
      <MtiqPanel open={open} onClose={() => setOpen(false)} />
      <MtiqFab open={open} unread={total} onClick={() => setOpen(o => !o)} />
    </>
  );
}
