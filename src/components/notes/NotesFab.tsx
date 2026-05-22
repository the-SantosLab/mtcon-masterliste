import { useLocation, useNavigate } from 'react-router-dom';
import { StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotesFab() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide on portal, auth, and notes itself
  if (
    location.pathname.startsWith('/portal') ||
    location.pathname.startsWith('/auth') ||
    location.pathname.startsWith('/notes') ||
    location.pathname.startsWith('/mfa')
  ) return null;

  return (
    <button
      onClick={() => navigate('/notes')}
      title="Notizen öffnen"
      className={cn(
        'fixed bottom-5 right-5 z-[60] h-12 w-12 rounded-full',
        'bg-primary text-primary-foreground shadow-lg hover:shadow-xl',
        'flex items-center justify-center transition-all hover:scale-105'
      )}
    >
      <StickyNote className="h-5 w-5" />
    </button>
  );
}
