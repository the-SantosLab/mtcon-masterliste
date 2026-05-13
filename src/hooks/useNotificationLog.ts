import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a map { notification_type -> last sent_at ISO string } for a given case,
 * plus the full recent log (most recent first, max 20).
 */
export function useNotificationLog(caseId: string | undefined, refreshKey: number = 0) {
  const [lastByType, setLastByType] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<Array<{ id: string; type: string; sent_at: string; recipient_email: string }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications_log')
      .select('id, type, sent_at, recipient_email')
      .eq('vorgang_id', caseId)
      .order('sent_at', { ascending: false })
      .limit(50);
    const rows = (data as any[]) || [];
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (!map[r.type]) map[r.type] = r.sent_at;
    }
    setLastByType(map);
    setRecent(rows.slice(0, 20));
    setLoading(false);
  }, [caseId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { lastByType, recent, loading, refresh: load };
}

export function formatLastSent(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}
