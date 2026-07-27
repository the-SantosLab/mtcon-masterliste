import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, Download, Loader2, Users } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  user_id: string;
  score_functionality: number;
  score_design: number;
  score_performance: number;
  missing_features: string | null;
  design_improvements: string | null;
  other: string | null;
  submitted_at: string;
  display_name?: string;
  short_code?: string;
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={cn('h-3 w-3', i <= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
      ))}
      <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">{n}</span>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminFeedback() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [surveyRes, usersRes] = await Promise.all([
        supabase.from('user_satisfaction_surveys' as any).select('*').order('submitted_at', { ascending: false }),
        supabase.from('users_profile').select('id, display_name, short_code, active').eq('active', true),
      ]);

      const profiles = new Map<string, { display_name: string; short_code: string }>();
      (usersRes.data || []).forEach((u: any) => profiles.set(u.id, { display_name: u.display_name, short_code: u.short_code }));

      const merged: Row[] = ((surveyRes.data as any[]) || []).map(r => ({
        ...r,
        display_name: profiles.get(r.user_id)?.display_name || '—',
        short_code: profiles.get(r.user_id)?.short_code || '',
      }));

      setRows(merged);
      setTotalUsers(usersRes.data?.length ?? 0);
      setLoading(false);
    })();
  }, []);

  const avg = useMemo(() => {
    if (!rows.length) return { f: 0, d: 0, p: 0 };
    const s = rows.reduce((a, r) => ({
      f: a.f + r.score_functionality,
      d: a.d + r.score_design,
      p: a.p + r.score_performance,
    }), { f: 0, d: 0, p: 0 });
    return { f: s.f / rows.length, d: s.d / rows.length, p: s.p / rows.length };
  }, [rows]);

  const exportCsv = () => {
    const esc = (s: string | null | undefined) => `"${String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const header = ['Datum', 'User', 'Kürzel', 'Funktionalität', 'Design', 'Performance', 'Fehlende Features', 'Design-Verbesserungen', 'Sonstiges'];
    const lines = [header.join(';')].concat(
      rows.map(r => [
        format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm'),
        esc(r.display_name),
        esc(r.short_code),
        r.score_functionality,
        r.score_design,
        r.score_performance,
        esc(r.missing_features),
        esc(r.design_improvements),
        esc(r.other),
      ].join(';'))
    );
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const responseRate = totalUsers ? Math.round((rows.length / totalUsers) * 100) : 0;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Zufriedenheits-Feedback</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Antworten der internen Umfrage</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5" />CSV-Export
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Antworten" value={String(rows.length)} sub={`${responseRate}% von ${totalUsers} aktiven`} />
          <KPI label="Ø Funktionalität" value={avg.f ? avg.f.toFixed(2) : '–'} />
          <KPI label="Ø Design" value={avg.d ? avg.d.toFixed(2) : '–'} />
          <KPI label="Ø Performance" value={avg.p ? avg.p.toFixed(2) : '–'} />
        </div>

        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">User</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Funktion</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Design</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Perf.</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Wünsche / Feedback</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Laden…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground"><Users className="h-4 w-4 inline mr-2 opacity-50" />Noch keine Antworten.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-muted/40 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-medium text-foreground">{r.display_name}</div>
                    {r.short_code && <div className="text-[10px] text-muted-foreground">{r.short_code}</div>}
                  </td>
                  <td className="px-3 py-2"><Stars n={r.score_functionality} /></td>
                  <td className="px-3 py-2"><Stars n={r.score_design} /></td>
                  <td className="px-3 py-2"><Stars n={r.score_performance} /></td>
                  <td className="px-3 py-2 text-foreground max-w-[500px] space-y-1">
                    {r.missing_features && <div><span className="text-[10px] uppercase text-muted-foreground mr-1">Fehlt:</span>{r.missing_features}</div>}
                    {r.design_improvements && <div><span className="text-[10px] uppercase text-muted-foreground mr-1">Design:</span>{r.design_improvements}</div>}
                    {r.other && <div><span className="text-[10px] uppercase text-muted-foreground mr-1">Sonst:</span>{r.other}</div>}
                    {!r.missing_features && !r.design_improvements && !r.other && <span className="text-muted-foreground">–</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.submitted_at), { addSuffix: true, locale: de })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{rows.length} Antwort(en)</p>
      </div>
    </AppLayout>
  );
}
