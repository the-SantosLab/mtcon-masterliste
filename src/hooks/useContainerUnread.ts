import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Source = {
  href: string;
  table: string;
  dateColumn: string;
};

const SOURCES: Source[] = [
  { href: '/mtiq/drafts', table: 'mtiq_drafts', dateColumn: 'created_at' },
  { href: '/insurance', table: 'insurance_policies', dateColumn: 'updated_at' },
  { href: '/bestellungen', table: 'orders', dateColumn: 'created_at' },
  { href: '/documents', table: 'documents', dateColumn: 'updated_at' },
  { href: '/issos', table: 'issos_documents', dateColumn: 'created_at' },
  { href: '/inbox/documents', table: 'inbox_documents', dateColumn: 'received_at' },
];

const KEY = (href: string) => `container:lastSeen:${href}`;
const getLastSeen = (href: string) => {
  try { return localStorage.getItem(KEY(href)) || new Date(Date.now() - 30 * 24 * 3600_000).toISOString(); }
  catch { return new Date(0).toISOString(); }
};

export function markContainerSeen(href: string) {
  try { localStorage.setItem(KEY(href), new Date().toISOString()); } catch { /* ignore */ }
}

export function useContainerUnread() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      SOURCES.map(async (s) => {
        const since = getLastSeen(s.href);
        try {
          const { count, error } = await (supabase as any)
            .from(s.table)
            .select('*', { count: 'exact', head: true })
            .gt(s.dateColumn, since);
          if (error) return [s.href, 0] as const;
          return [s.href, count ?? 0] as const;
        } catch {
          return [s.href, 0] as const;
        }
      }),
    );
    setCounts(Object.fromEntries(results));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total, refresh };
}
