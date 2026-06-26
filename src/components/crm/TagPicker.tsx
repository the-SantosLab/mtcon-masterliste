import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, Tag as TagIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export type TagEntity = 'company' | 'deal' | 'contact' | 'lead';

interface Tag { id: string; name: string; color: string; scope: string }
interface Assignment { id: string; tag_id: string }

interface Props {
  entityType: TagEntity;
  entityId: string;
  compact?: boolean;
}

const COLORS = ['#64748b', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

export function TagPicker({ entityType, entityId, compact }: Props) {
  const { user } = useAuth();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tagsRes, assignRes] = await Promise.all([
      supabase.from('crm_tags').select('*').or(`scope.eq.${entityType},scope.eq.any`).order('name'),
      supabase.from('crm_tag_assignments').select('id, tag_id').eq('entity_type', entityType).eq('entity_id', entityId),
    ]);
    setAllTags((tagsRes.data ?? []) as Tag[]);
    setAssignments((assignRes.data ?? []) as Assignment[]);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  const assigned = assignments.map(a => allTags.find(t => t.id === a.tag_id)).filter(Boolean) as Tag[];
  const available = allTags.filter(t => !assignments.some(a => a.tag_id === t.id))
    .filter(t => !q.trim() || t.name.toLowerCase().includes(q.toLowerCase()));

  const toggleTag = async (tag: Tag) => {
    const existing = assignments.find(a => a.tag_id === tag.id);
    if (existing) {
      await supabase.from('crm_tag_assignments').delete().eq('id', existing.id);
    } else {
      await supabase.from('crm_tag_assignments').insert({
        tag_id: tag.id, entity_type: entityType, entity_id: entityId, created_by: user?.id ?? null,
      });
    }
    void load();
  };

  const createAndAssign = async () => {
    const name = q.trim();
    if (!name) return;
    setCreating(true);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const { data, error } = await supabase.from('crm_tags').insert({
      name, color, scope: 'any', created_by: user?.id ?? null,
    }).select('*').single();
    if (error) { toast.error(error.message); setCreating(false); return; }
    await supabase.from('crm_tag_assignments').insert({
      tag_id: data.id, entity_type: entityType, entity_id: entityId, created_by: user?.id ?? null,
    });
    setQ('');
    setCreating(false);
    void load();
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${compact ? '' : 'min-h-[28px]'}`}>
      {assigned.map(t => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
          style={{ borderColor: t.color + '60', background: t.color + '20', color: t.color }}
        >
          {t.name}
          <button onClick={() => toggleTag(t)} className="hover:opacity-70"><X className="h-2.5 w-2.5" /></button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40">
            {assigned.length === 0 ? <><TagIcon className="h-2.5 w-2.5" /> Tag</> : <><Plus className="h-2.5 w-2.5" /></>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <Input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Tag suchen oder neu…"
            className="h-7 text-xs mb-2"
            onKeyDown={e => { if (e.key === 'Enter' && available.length === 0) void createAndAssign(); }}
          />
          {loading ? (
            <div className="flex justify-center py-3"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {available.map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t)}
                    className="flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-muted text-left"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                    <span className="text-foreground">{t.name}</span>
                  </button>
                ))}
                {available.length === 0 && !q && (
                  <p className="text-[11px] text-muted-foreground text-center py-2">Keine weiteren Tags.</p>
                )}
              </div>
              {q.trim() && !allTags.some(t => t.name.toLowerCase() === q.trim().toLowerCase()) && (
                <Button
                  onClick={createAndAssign}
                  disabled={creating}
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs mt-2 gap-1.5"
                >
                  <Plus className="h-3 w-3" /> „{q.trim()}" anlegen
                </Button>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
