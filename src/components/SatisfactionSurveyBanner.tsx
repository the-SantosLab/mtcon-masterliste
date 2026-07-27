import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import { SatisfactionSurveyDialog } from './SatisfactionSurveyDialog';

const DISMISS_KEY = 'mtcon.survey.dismissedUntil';
const EXCLUDED_PREFIXES = ['/portal', '/auth', '/reset-password', '/mfa-challenge', '/print/'];

export function SatisfactionSurveyBanner() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const excluded = EXCLUDED_PREFIXES.some(p => location.pathname.startsWith(p));

  useEffect(() => {
    if (loading || !user?.id || excluded) {
      setVisible(false);
      return;
    }
    let cancelled = false;

    (async () => {
      // client-seitige Dismiss-Sperre
      try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (raw) {
          const until = parseInt(raw, 10);
          if (Number.isFinite(until) && Date.now() < until) return;
        }
      } catch { void 0; }

      const { data } = await supabase
        .from('user_satisfaction_surveys' as any)
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!cancelled && !data) setVisible(true);
    })();

    return () => { cancelled = true; };
  }, [user?.id, loading, excluded]);

  const dismiss = (days: number) => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400_000));
    } catch { void 0; }
    setVisible(false);
  };

  if (!visible || excluded) return null;

  return (
    <>
      <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 backdrop-blur-sm px-3 py-2 flex items-center gap-3 flex-wrap">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-xs font-medium text-foreground">Kurze Umfrage (60 Sek.): Wie zufrieden bist du mit der Masterliste?</p>
          <p className="text-[10px] text-muted-foreground">Dein Feedback zu Funktionalität, Design und Performance — einmalig.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="h-7 text-[11px]" onClick={() => setDialogOpen(true)}>
            Feedback geben
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => dismiss(1)}>
            Später
          </Button>
          <button
            onClick={() => dismiss(7)}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground"
            aria-label="7 Tage ausblenden"
            title="7 Tage ausblenden"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <SatisfactionSurveyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmitted={() => setVisible(false)}
      />
    </>
  );
}
