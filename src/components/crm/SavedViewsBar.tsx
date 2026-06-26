import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Bookmark, BookmarkPlus, Trash2, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface View {
  id: string;
  user_id: string;
  scope: string;
  name: string;
  filters: any;
  is_shared: boolean;
  is_default: boolean;
}

interface Props {
  scope: 'companies' | 'deals' | 'contacts' | 'leads' | 'activities';
  currentFilters: Record<string, any>;
  onApply: (filters: Record<string, any>) => void;
}

export function SavedViewsBar({ scope, currentFilters, onApply }: Props) {
  const { user } = useAuth();
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('crm_saved_views')
      .select('*')
      .eq('scope', scope)
      .order('name');
    setViews((data ?? []) as View[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [scope]);

  const apply = (v: View) => {
    setActiveId(v.id);
    onApply(v.filters ?? {});
  };

  const save = async () => {
    if (!name.trim() || !user) return;
    setSaving(true);
    const { error } = await supabase.from('crm_saved_views').insert({
      user_id: user.id, scope, name: name.trim(), filters: currentFilters, is_shared: shared,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Ansicht gespeichert');
    setSaveOpen(false); setName(''); setShared(false);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('crm_saved_views').delete().eq('id', id);
    if (error) return toast.error(error.message);
    if (activeId === id) setActiveId(null);
    void load();
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : views.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">Keine Ansichten</span>
      ) : (
        views.map(v => (
          <button
            key={v.id}
            onClick={() => apply(v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors group ${
              activeId === v.id
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            title={v.is_shared ? 'Geteilt' : 'Privat'}
          >
            <Bookmark className="h-2.5 w-2.5" />
            {v.name}
            {v.is_shared && <Users className="h-2.5 w-2.5 opacity-60" />}
            {user?.id === v.user_id && (
              <Trash2
                className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); void remove(v.id); }}
              />
            )}
          </button>
        ))
      )}
      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            <BookmarkPlus className="h-2.5 w-2.5" /> Aktuelle Filter speichern
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <p className="text-xs font-medium mb-2">Ansicht speichern</p>
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name der Ansicht"
            className="h-8 text-xs"
            onKeyDown={e => { if (e.key === 'Enter') void save(); }}
          />
          <label className="flex items-center gap-2 text-xs mt-2 text-muted-foreground">
            <Checkbox checked={shared} onCheckedChange={v => setShared(!!v)} /> Mit allen teilen
          </label>
          <Button onClick={save} disabled={saving || !name.trim()} size="sm" className="w-full h-7 text-xs mt-2">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Speichern'}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
