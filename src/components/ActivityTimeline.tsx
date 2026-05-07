import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ACTION_LABELS, FIELD_LABELS, formatRelativeTime } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { CheckSquare } from 'lucide-react';

type ActivityWithActor = Tables<'case_activity'> & {
  task_id?: string | null;
  actor: { display_name: string; short_code: string } | null;
};

interface ActivityTimelineProps {
  caseId: string;
  refreshKey?: number;
}

const formatValue = (field: string | null, value: string | null, profiles: Record<string, string>, depts: Record<string, string>) => {
  if (!value) return '—';
  if (field === 'assigned_to') return profiles[value] || value.slice(0, 8);
  if (field === 'department_id') return depts[value] || value.slice(0, 8);
  if (field === 'due_at' || field === 'received_at') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString('de-DE');
  }
  return value.length > 80 ? value.slice(0, 80) + '…' : value;
};

export function ActivityTimeline({ caseId, refreshKey }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [depts, setDepts] = useState<Record<string, string>>({});

  const fetchActivities = async () => {
    const { data } = await supabase
      .from('case_activity')
      .select('*, actor:users_profile!case_activity_actor_id_fkey(display_name, short_code)')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });
    setActivities((data as ActivityWithActor[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    Promise.all([
      supabase.from('users_profile').select('id, short_code, display_name'),
      supabase.from('departments').select('id, name'),
    ]).then(([p, d]) => {
      const pMap: Record<string, string> = {};
      (p.data || []).forEach((r: any) => { pMap[r.id] = r.short_code || r.display_name; });
      setProfiles(pMap);
      const dMap: Record<string, string> = {};
      (d.data || []).forEach((r: any) => { dMap[r.id] = r.name; });
      setDepts(dMap);
    });
  }, []);

  useEffect(() => {
    fetchActivities();
    const channel = supabase
      .channel(`activity-${caseId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_activity', filter: `case_id=eq.${caseId}` }, () => {
        fetchActivities();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, refreshKey]);

  if (loading) return <p className="text-xs text-muted-foreground p-4">Laden</p>;
  if (activities.length === 0) return <p className="text-xs text-muted-foreground p-4">Keine Aktivitäten</p>;

  return (
    <div className="divide-y divide-border">
      {activities.map((a) => {
        const isTask = !!a.task_id || (a.action || '').startsWith('task_');
        const fieldLabel = a.field ? (FIELD_LABELS[a.field] || a.field) : null;
        const oldV = formatValue(a.field, a.old_value, profiles, depts);
        const newV = formatValue(a.field, a.new_value, profiles, depts);
        return (
          <div key={a.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <span className="text-xs font-medium text-foreground inline-flex items-center gap-1">
                {isTask && <CheckSquare className="h-3 w-3 text-muted-foreground" />}
                {a.actor?.short_code || 'System'}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatRelativeTime(a.created_at)}
              </span>
            </div>
            {a.action === 'COMMENT' ? (
              <p className="text-xs text-foreground mt-1 whitespace-pre-wrap leading-relaxed">{a.message}</p>
            ) : a.action === 'DEPT_MOVE' ? (
              <p className="text-[11px] text-muted-foreground">
                Abteilung geändert
                {a.old_value && a.new_value && <span> · {depts[a.old_value] || a.old_value} → {depts[a.new_value] || a.new_value}</span>}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {ACTION_LABELS[a.action] || a.action}
                {fieldLabel && (
                  <span>
                    {' · '}{fieldLabel}
                    {a.old_value !== null && <span> {oldV}</span>}
                    {a.new_value !== null && <span> → {newV}</span>}
                  </span>
                )}
                {a.message && !a.field && <span> · {a.message}</span>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
