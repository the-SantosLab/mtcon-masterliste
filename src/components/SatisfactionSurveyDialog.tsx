import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}

function StarRow({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1 rounded hover:bg-muted/60 transition-colors"
            aria-label={`${n} von 5`}
          >
            <Star className={cn('h-6 w-6 transition-colors', n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground tabular-nums">{value ? `${value}/5` : '–'}</span>
      </div>
    </div>
  );
}

export function SatisfactionSurveyDialog({ open, onOpenChange, onSubmitted }: Props) {
  const { user } = useAuth();
  const [funcScore, setFuncScore] = useState(0);
  const [designScore, setDesignScore] = useState(0);
  const [perfScore, setPerfScore] = useState(0);
  const [missing, setMissing] = useState('');
  const [design, setDesign] = useState('');
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = funcScore >= 1 && designScore >= 1 && perfScore >= 1 && !saving;

  const submit = async () => {
    if (!user?.id || !canSubmit) return;
    setSaving(true);
    const { error } = await supabase.from('user_satisfaction_surveys' as any).insert({
      user_id: user.id,
      score_functionality: funcScore,
      score_design: designScore,
      score_performance: perfScore,
      missing_features: missing.trim() || null,
      design_improvements: design.trim() || null,
      other: other.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Speichern fehlgeschlagen: ' + error.message);
      return;
    }
    toast.success('Vielen Dank für dein Feedback!');
    onSubmitted();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Kurze Zufriedenheits-Umfrage</DialogTitle>
          <DialogDescription className="text-xs">
            Dein Feedback hilft uns, MTCON zu verbessern. Dauert ca. 60 Sekunden — einmalig pro Nutzer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <StarRow label="Wie zufrieden bist du mit der Funktionalität?" value={funcScore} onChange={setFuncScore} />
          <StarRow label="Wie zufrieden bist du mit dem Design / der UI?" value={designScore} onChange={setDesignScore} />
          <StarRow label="Wie zufrieden bist du mit Performance / Geschwindigkeit?" value={perfScore} onChange={setPerfScore} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Fehlende Features / Wünsche <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea rows={3} value={missing} onChange={e => setMissing(e.target.value)} placeholder="Was fehlt dir, das du noch nicht als Ticket gemeldet hast?" className="text-xs" maxLength={2000} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Design-Verbesserungen <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea rows={3} value={design} onChange={e => setDesign(e.target.value)} placeholder="Was würdest du am Design verändern?" className="text-xs" maxLength={2000} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Sonstiges <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea rows={2} value={other} onChange={e => setOther(e.target.value)} placeholder="Weitere Anmerkungen…" className="text-xs" maxLength={2000} />
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={!canSubmit}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Absenden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
