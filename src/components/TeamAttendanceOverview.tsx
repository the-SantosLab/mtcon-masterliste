import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { UserAvatar } from '@/components/UserAvatar';
import { Users, Clock, Plane, Stethoscope, Loader2, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  display_name: string;
  short_code: string;
  avatar_url: string | null;
  department_id: string | null;
}
interface Att {
  user_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  worked_minutes: number;
}
interface Abs {
  user_id: string;
  category: string | null;
  absence_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
}

const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '–');
const fmtHours = (m: number) => (m > 0 ? `${(m / 60).toFixed(1)}h` : '0h');
const todayStr = () => new Date().toISOString().slice(0, 10);
const startOfWeek = () => {
  const x = new Date();
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
};
const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

export function TeamAttendanceOverview() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [att, setAtt] = useState<Att[]>([]);
  const [abs, setAbs] = useState<Abs[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');

  const load = async () => {
    const from = startOfYear();
    const to = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [u, a, ab] = await Promise.all([
      supabase.from('users_profile')
        .select('id, display_name, short_code, avatar_url, department_id')
        .eq('active', true)
        .order('display_name'),
      supabase.from('personio_attendances')
        .select('user_id, work_date, start_time, end_time, worked_minutes')
        .gte('work_date', from).lte('work_date', to),
      supabase.from('personio_absences')
        .select('user_id, category, absence_type, start_date, end_date, days_count')
        .gte('end_date', from).lte('start_date', to),
    ]);
    setUsers((u.data as Profile[]) || []);
    setAtt((a.data as Att[]) || []);
    setAbs((ab.data as Abs[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('team-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personio_attendances' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personio_absences' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const today = todayStr();
  const wkFrom = startOfWeek();
  const mFrom = startOfMonth();
  const yFrom = startOfYear();

  const rows = useMemo(() => {
    return users.map((u) => {
      const userAtt = att.filter((x) => x.user_id === u.id);
      const userAbs = abs.filter((x) => x.user_id === u.id);
      const todayAtt = userAtt.find((x) => x.work_date === today);
      const todayAbs = userAbs.find((x) => today >= x.start_date && today <= x.end_date);

      let status: { label: string; tone: string; dot: string } = {
        label: 'Nicht eingestempelt', tone: 'text-muted-foreground', dot: 'bg-muted-foreground/40',
      };
      if (todayAbs) {
        if (todayAbs.category === 'vacation') status = { label: 'Urlaub', tone: 'text-sky-400', dot: 'bg-sky-400' };
        else if (todayAbs.category === 'sick') status = { label: 'Krank', tone: 'text-amber-400', dot: 'bg-amber-400' };
        else status = { label: todayAbs.absence_type, tone: 'text-violet-400', dot: 'bg-violet-400' };
      } else if (todayAtt?.start_time && !todayAtt?.end_time) {
        status = { label: `Anwesend seit ${fmtTime(todayAtt.start_time)}`, tone: 'text-emerald-400', dot: 'bg-emerald-400' };
      } else if (todayAtt?.start_time && todayAtt?.end_time) {
        status = { label: `Feierabend ${fmtTime(todayAtt.end_time)}`, tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
      }

      const sumMin = (from: string) =>
        userAtt.filter((x) => x.work_date >= from && x.work_date <= today)
          .reduce((s, x) => s + (x.worked_minutes || 0), 0);
      const sumAbs = (from: string, cat: string) =>
        userAbs.filter((x) => x.category === cat && x.end_date >= from && x.start_date <= today)
          .reduce((s, x) => s + (Number(x.days_count) || 0), 0);

      return {
        user: u,
        status,
        today: todayAtt,
        todayAbs,
        week: sumMin(wkFrom),
        month: sumMin(mFrom),
        year: sumMin(yFrom),
        vacYear: sumAbs(yFrom, 'vacation'),
        sickYear: sumAbs(yFrom, 'sick'),
        present: !!(todayAtt?.start_time && !todayAtt?.end_time),
        absent: !!todayAbs,
      };
    });
  }, [users, att, abs, today, wkFrom, mFrom, yFrom]);

  const filtered = rows.filter((r) => {
    if (filter === 'present') return r.present;
    if (filter === 'absent') return r.absent;
    return true;
  });

  const presentCount = rows.filter((r) => r.present).length;
  const absentCount = rows.filter((r) => r.absent).length;
  const visible = expanded ? filtered : filtered.slice(0, 8);

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Team-Zeiten & Abwesenheiten · Live
        </h2>
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
          {([
            { key: 'all', label: `Alle ${rows.length}` },
            { key: 'present', label: `Anwesend ${presentCount}` },
            { key: 'absent', label: `Abwesend ${absentCount}` },
          ] as const).map((o) => (
            <button
              key={o.key}
              onClick={() => setFilter(o.key)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium rounded transition-colors',
                filter === o.key
                  ? 'bg-card text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Keine Mitarbeitenden.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Mitarbeiter</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-right font-medium px-3 py-2">Heute</th>
                  <th className="text-right font-medium px-3 py-2">Woche</th>
                  <th className="text-right font-medium px-3 py-2">Monat</th>
                  <th className="text-right font-medium px-3 py-2">Jahr</th>
                  <th className="text-right font-medium px-3 py-2">Urlaub</th>
                  <th className="text-right font-medium px-3 py-2">Krank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={r.user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2">
                      <Link to={`/profile`} className="flex items-center gap-2">
                        <UserAvatar user={r.user as any} size="md" />
                        <div className="min-w-0">
                          <div className="text-xs text-foreground truncate">{r.user.display_name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{r.user.short_code}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', r.status.dot, r.present && 'animate-pulse')} />
                        <span className={cn('text-[11px]', r.status.tone)}>{r.status.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">
                      {r.today
                        ? `${fmtTime(r.today.start_time)}–${fmtTime(r.today.end_time)} · ${fmtHours(r.today.worked_minutes)}`
                        : '–'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.week)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtHours(r.month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtHours(r.year)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-400">
                      <span className="inline-flex items-center gap-1"><Plane className="h-2.5 w-2.5" />{r.vacYear.toFixed(1)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                      <span className="inline-flex items-center gap-1"><Stethoscope className="h-2.5 w-2.5" />{r.sickYear.toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 8 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-4 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 border-t border-border flex items-center justify-center gap-1.5 transition-colors"
            >
              {expanded ? <><ChevronUp className="h-3 w-3" />Weniger</> : <><ChevronDown className="h-3 w-3" />{filtered.length - 8} weitere anzeigen</>}
            </button>
          )}
        </>
      )}
    </div>
  );
}
