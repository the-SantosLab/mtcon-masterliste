import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/** MTIQ-Vorgangsvorschlag aus einer Kundenanfrage. Erzeugt nur einen Entwurf, der vor dem Anlegen geprüft werden muss. */
export function MtiqRequestSuggest({ title, text }: { title: string; text: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (text.trim().length < 5) { toast.error('Zu wenig Inhalt für einen Vorschlag'); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('mtiq-text-intake', { body: { text: `Kundenanfrage: ${text.trim()}`.slice(0, 8000), title } });
    setBusy(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error ?? error?.message ?? 'Vorschlag fehlgeschlagen'); return; }
    toast.success('MTIQ-Vorgangsvorschlag erstellt – bitte prüfen');
    const id = (data as any)?.draft?.id;
    navigate('/mtiq/drafts' + (id ? `?id=${id}` : ''));
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      MTIQ-Vorgangsvorschlag
    </Button>
  );
}
