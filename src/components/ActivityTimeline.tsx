import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ACTION_LABELS, formatRelativeTime } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';

type ActivityWithActor = Tables<'case_activity'> & {
  actor: { display_name: string; short_code: string } | null;
};

interface ActivityTimelineProps {
  caseId: string;
  refreshKey?: number;
}

export function ActivityTimeline({ caseId, refreshKey }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityWithActor[]>([]);
  const [loading, setLoading] = useState(true);

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
      {activities.map((a) => (
        <div key={a.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="text-xs font-medium text-foreground">
              {a.actor?.short_code || 'System'}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatRelativeTime(a.created_at)}
            </span>
          </div>
          {a.action === 'COMMENT' ? (
            <p className="text-xs text-foreground mt-1 whitespace-pre-wrap leading-relaxed">{a.message}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {ACTION_LABELS[a.action] || a.action}
              {a.field && (
                <span>
                  {' · '}{a.field}
                  {a.old_value && <span> {a.old_value}</span>}
                  {a.new_value && <span> → {a.new_value}</span>}
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
