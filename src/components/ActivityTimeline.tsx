import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ACTION_LABELS, formatRelativeTime } from '@/lib/case-utils';
import type { Tables } from '@/integrations/supabase/types';
import { MessageSquare, ArrowRight } from 'lucide-react';

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

  if (loading) return <p className="text-sm text-muted-foreground p-4">Laden...</p>;
  if (activities.length === 0) return <p className="text-sm text-muted-foreground p-4">Keine Aktivitäten</p>;

  return (
    <div className="space-y-0">
      {activities.map((a) => (
        <div key={a.id} className="flex gap-3 px-4 py-3 border-b border-border last:border-b-0">
          <div className="mt-0.5 shrink-0">
            {a.action === 'COMMENT' ? (
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
              </div>
            ) : (
              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center">
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">
                {a.actor?.short_code || 'System'}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(a.created_at)}
              </span>
            </div>
            {a.action === 'COMMENT' ? (
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{a.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {ACTION_LABELS[a.action] || a.action}
                {a.field && (
                  <span>
                    {' · '}{a.field}
                    {a.old_value && <span>: {a.old_value}</span>}
                    {a.new_value && <span> → {a.new_value}</span>}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
