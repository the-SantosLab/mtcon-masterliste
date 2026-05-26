import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

interface Prompt {
  id: string;
  key: string;
  label: string;
  description: string | null;
  content: string;
  updated_at: string;
  updated_by: string | null;
}

export default function AdminAiPrompts() {
  const { role, user, loading: authLoading } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('ai_prompts' as any)
        .select('*')
        .order('label');
      if (error) { toast.error('Konnte Prompts nicht laden'); setLoading(false); return; }
      const rows = (data ?? []) as unknown as Prompt[];
      setPrompts(rows);
      const d: Record<string, string> = {};
      rows.forEach(p => { d[p.key] = p.content ?? ''; });
      setDrafts(d);
      setLoading(false);
    })();
  }, []);

  if (authLoading) return null;
  if (role !== 'admin') return <Navigate to="/" replace />;

  const save = async (p: Prompt) => {
    setSavingKey(p.key);
    const { error } = await supabase
      .from('ai_prompts' as any)
      .update({ content: drafts[p.key] ?? '', updated_by: user?.id })
      .eq('id', p.id);
    setSavingKey(null);
    if (error) { toast.error('Speichern fehlgeschlagen: ' + error.message); return; }
    toast.success('Gespeichert');
    setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, content: drafts[p.key] ?? '' } : x));
  };

  const reset = (p: Prompt) => {
    setDrafts(prev => ({ ...prev, [p.key]: '' }));
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">KI System-Prompts</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Hier werden die System-Prompts der MTIQ-Funktionen verwaltet. Ein leerer Inhalt verwendet automatisch den im Code hinterlegten Standard-Prompt. Dynamischer Vorgangs-Kontext (Status, Notizen usw.) wird unabhängig vom Prompt im Code angehängt.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden…
          </div>
        ) : (
          <div className="space-y-4">
            {prompts.map(p => {
              const draft = drafts[p.key] ?? '';
              const dirty = draft !== (p.content ?? '');
              return (
                <div key={p.id} className="rounded-lg border border-border bg-card/40 backdrop-blur-xl p-4">
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{p.label}</p>
                      {p.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono">
                        Key: {p.key} {p.key === 'mtiq_tool' && '· Platzhalter: {{tool}}'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => reset(p)}
                        disabled={savingKey === p.key || draft === ''}
                        title="Auf Standard zurücksetzen (leerer Inhalt = Code-Default)"
                      >
                        <RotateCcw className="h-3 w-3" /> Standard
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => save(p)}
                        disabled={!dirty || savingKey === p.key}
                      >
                        {savingKey === p.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Speichern
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDrafts(prev => ({ ...prev, [p.key]: e.target.value }))}
                    placeholder="(leer = Code-Default verwenden)"
                    className="font-mono text-xs min-h-[180px]"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
