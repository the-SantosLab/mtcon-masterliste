import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserAvatar } from '@/components/UserAvatar';
import { Users, Clock, Plane, Stethoscope, Loader2, ChevronDown, ChevronUp, TrendingUp, SlidersHorizontal, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';



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
  const [selected, setSelected] = useState<Profile | null>(null);


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
      // Überstunden = worked_minutes - 8h pro gearbeitetem Tag (Baseline)
      const overtimeMin = (from: string) =>
        userAtt.filter((x) => x.work_date >= from && x.work_date <= today && (x.worked_minutes || 0) > 0)
          .reduce((s, x) => s + ((x.worked_minutes || 0) - 480), 0);

      return {
        user: u,
        status,
        today: todayAtt,
        todayAbs,
        week: sumMin(wkFrom),
        month: sumMin(mFrom),
        year: sumMin(yFrom),
        overtimeYear: overtimeMin(yFrom),
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
  const totalOvertimeYear = rows.reduce((s, r) => s + r.overtimeYear, 0);
  const totalSickYear = rows.reduce((s, r) => s + r.sickYear, 0);
  const totalVacYear = rows.reduce((s, r) => s + r.vacYear, 0);
  const totalWorkedYear = rows.reduce((s, r) => s + r.year, 0);
  const currentYear = new Date().getFullYear();


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

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-b border-border">
          <div className="bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Überstunden {currentYear}
            </div>
            <div className={cn(
              'text-lg font-semibold tabular-nums mt-1',
              totalOvertimeYear >= 0 ? 'text-emerald-400' : 'text-destructive',
            )}>
              {totalOvertimeYear >= 0 ? '+' : ''}{(totalOvertimeYear / 60).toFixed(1)}h
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Team gesamt (Basis 8h/Tag)</div>
          </div>
          <div className="bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Stethoscope className="h-3 w-3" /> Krankheitstage {currentYear}
            </div>
            <div className="text-lg font-semibold tabular-nums mt-1 text-amber-400">
              {totalSickYear.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Team gesamt</div>
          </div>
          <div className="bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Plane className="h-3 w-3" /> Urlaubstage {currentYear}
            </div>
            <div className="text-lg font-semibold tabular-nums mt-1 text-sky-400">
              {totalVacYear.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Team gesamt</div>
          </div>
          <div className="bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3 w-3" /> Arbeitszeit {currentYear}
            </div>
            <div className="text-lg font-semibold tabular-nums mt-1 text-foreground">
              {(totalWorkedYear / 60).toFixed(0)}h
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Team gesamt</div>
          </div>
        </div>
      )}


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
                  <th className="text-right font-medium px-3 py-2">Überstd.</th>
                  <th className="text-right font-medium px-3 py-2">Urlaub</th>
                  <th className="text-right font-medium px-3 py-2">Krank</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr
                    key={r.user.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelected(r.user)}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <UserAvatar user={r.user as any} size="md" />
                        <div className="min-w-0">
                          <div className="text-xs text-foreground truncate">{r.user.display_name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{r.user.short_code}</div>
                        </div>
                      </div>
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
                    <td className={cn(
                      'px-3 py-2 text-right tabular-nums font-medium',
                      r.overtimeYear >= 0 ? 'text-emerald-400' : 'text-destructive',
                    )}>
                      {r.overtimeYear >= 0 ? '+' : ''}{(r.overtimeYear / 60).toFixed(1)}h
                    </td>

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
      <EmployeeDetailDialog
        user={selected}
        onClose={() => setSelected(null)}
        att={att}
        abs={abs}
        yearFrom={yFrom}
        today={today}
      />
    </div>
  );
}

interface DetailProps {
  user: Profile | null;
  onClose: () => void;
  att: Att[];
  abs: Abs[];
  yearFrom: string;
  today: string;
}

interface DayRow {
  date: string;
  att?: Att;
  absences: Abs[];
}

const fmtDateDE = (s: string) => {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};

const absenceLabel = (a: Abs) => {
  if (a.category === 'vacation') return 'Urlaub';
  if (a.category === 'sick') return 'Krank';
  return a.absence_type || 'Abwesenheit';
};

const absenceTone = (a: Abs) => {
  if (a.category === 'vacation') return 'text-sky-400 bg-sky-400/10 border-sky-400/20';
  if (a.category === 'sick') return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
  return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
};

const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function resolvePeriod(value: string, year: number, todayIso: string) {
  let from: string;
  let to: string;
  switch (value) {
    case 'year': from = `${year}-01-01`; to = `${year}-12-31`; break;
    case 'Q1': from = `${year}-01-01`; to = `${year}-03-31`; break;
    case 'Q2': from = `${year}-04-01`; to = `${year}-06-30`; break;
    case 'Q3': from = `${year}-07-01`; to = `${year}-09-30`; break;
    case 'Q4': from = `${year}-10-01`; to = `${year}-12-31`; break;
    default: {
      const m = parseInt(value.slice(1), 10);
      from = `${year}-${String(m).padStart(2, '0')}-01`;
      to = new Date(year, m, 0).toISOString().slice(0, 10);
    }
  }
  if (to > todayIso) to = todayIso;
  return { from, to };
}

const absenceOptions = [
  { value: 'all', label: 'Alle Abwesenheiten' },
  { value: 'cat:vacation', label: 'Urlaub (alle)' },
  { value: 'cat:sick', label: 'Krankheit' },
  { value: 'cat:other', label: 'Sonstige (alle)' },
  { value: 'Bezahlter Urlaub', label: 'Bezahlter Urlaub' },
  { value: 'Sonderurlaub', label: 'Sonderurlaub' },
  { value: 'Home Office', label: 'Home Office' },
  { value: 'Dienstreise', label: 'Dienstreise' },
  { value: 'Fortbildung', label: 'Fortbildung' },
  { value: 'Berufsschule', label: 'Berufsschule' },
  { value: 'Freizeitausgleich', label: 'Freizeitausgleich' },
];

function matchesAbsenceFilter(a: Abs, filter: string) {
  if (filter === 'all') return true;
  if (filter.startsWith('cat:')) return a.category === filter.slice(4);
  return a.absence_type === filter;
}

function EmployeeDetailDialog({ user, onClose, att, abs, yearFrom, today }: DetailProps) {
  const [period, setPeriod] = useState('year');
  const [absFilter, setAbsFilter] = useState('all');
  const [bucketChoice, setBucketChoice] = useState<'auto' | 'day' | 'week' | 'month'>('auto');
  const [drill, setDrill] = useState<{ from: string; to: string; label: string } | null>(null);
  const currentYear = parseInt(yearFrom.slice(0, 4), 10);

  // Reset drill when filters change
  useEffect(() => { setDrill(null); }, [period, absFilter, bucketChoice, user?.id]);


  const { days, totals } = useMemo(() => {
    if (!user) return { days: [] as DayRow[], totals: { worked: 0, overtime: 0, vacation: 0, sick: 0, other: 0 } };
    const userAtt = att.filter((x) => x.user_id === user.id);
    const userAbs = abs.filter((x) => x.user_id === user.id);

    const { from: pFrom, to: pTo } = resolvePeriod(period, currentYear, today);

    const map = new Map<string, DayRow>();
    const ensure = (date: string) => {
      if (!map.has(date)) map.set(date, { date, absences: [] });
      return map.get(date)!;
    };

    for (const a of userAtt) {
      if (a.work_date < yearFrom || a.work_date > today) continue;
      if (a.work_date < pFrom || a.work_date > pTo) continue;
      ensure(a.work_date).att = a;
    }
    for (const ab of userAbs) {
      const start = ab.start_date > yearFrom ? ab.start_date : yearFrom;
      const end = ab.end_date < today ? ab.end_date : today;
      if (start > end) continue;
      const d = new Date(start + 'T00:00:00');
      const endD = new Date(end + 'T00:00:00');
      while (d <= endD) {
        const iso = d.toISOString().slice(0, 10);
        if (iso >= pFrom && iso <= pTo) {
          ensure(iso).absences.push(ab);
        }
        d.setDate(d.getDate() + 1);
      }
    }

    const allDays = Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

    let worked = 0, overtime = 0, vacation = 0, sick = 0, other = 0;
    const filteredDays: DayRow[] = [];

    for (const d of allDays) {
      if (d.att?.worked_minutes) {
        worked += d.att.worked_minutes;
        overtime += (d.att.worked_minutes - 480);
      }
      const seen = new Set<string>();
      let dayVac = 0, daySick = 0, dayOther = 0;
      for (const a of d.absences) {
        const key = `${a.start_date}|${a.end_date}|${a.category}|${a.absence_type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (a.category === 'vacation') dayVac += 1;
        else if (a.category === 'sick') daySick += 1;
        else dayOther += 1;
      }

      const hasMatchingAbs = d.absences.some((a) => matchesAbsenceFilter(a, absFilter));
      const include = absFilter === 'all' || hasMatchingAbs;

      if (include) {
        filteredDays.push(d);
        vacation += dayVac;
        sick += daySick;
        other += dayOther;
      }
    }
    return { days: filteredDays, totals: { worked, overtime, vacation, sick, other } };
  }, [user, att, abs, yearFrom, today, period, absFilter, currentYear]);

  const open = !!user;
  const periodLabel = period === 'year' ? 'Gesamtjahr' : period.startsWith('Q') ? period : monthNames[parseInt(period.slice(1)) - 1];

  const { chartData, bucketMode } = useMemo(() => {
    const autoMode: 'month' | 'day' = period === 'year' || period.startsWith('Q') ? 'month' : 'day';
    const mode: 'day' | 'week' | 'month' = bucketChoice === 'auto' ? autoMode : bucketChoice;
    type Bucket = { key: string; label: string; from: string; to: string; overtime: number; vacation: number; sick: number; other: number };
    const buckets = new Map<string, Bucket>();
    const ensure = (key: string, label: string, from: string, to: string) => {
      if (!buckets.has(key)) buckets.set(key, { key, label, from, to, overtime: 0, vacation: 0, sick: 0, other: 0 });
      return buckets.get(key)!;
    };

    const { from: pFrom, to: pTo } = resolvePeriod(period, currentYear, today);
    const fromD = new Date(pFrom + 'T00:00:00');
    const toD = new Date(pTo + 'T00:00:00');

    const isoWeek = (d: Date): { year: number; week: number; monday: Date; sunday: Date } => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayNum);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { year: date.getUTCFullYear(), week, monday, sunday };
    };
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // Seed continuous buckets across the period
    if (mode === 'month') {
      const cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
      while (cur <= toD) {
        const y = cur.getFullYear(); const m = cur.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const last = new Date(y, m + 1, 0);
        ensure(key, monthNames[m].slice(0, 3), `${key}-01`, iso(last));
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (mode === 'week') {
      const w0 = isoWeek(fromD);
      const cur = new Date(w0.monday);
      while (cur <= toD) {
        const w = isoWeek(cur);
        const key = `${w.year}-W${String(w.week).padStart(2, '0')}`;
        ensure(key, `KW${w.week}`, iso(w.monday), iso(w.sunday));
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      const cur = new Date(fromD);
      while (cur <= toD) {
        const key = iso(cur);
        ensure(key, `${String(cur.getDate()).padStart(2, '0')}.${String(cur.getMonth() + 1).padStart(2, '0')}`, key, key);
        cur.setDate(cur.getDate() + 1);
      }
    }

    for (const d of days) {
      const dDate = new Date(d.date + 'T00:00:00');
      let key: string;
      if (mode === 'month') key = d.date.slice(0, 7);
      else if (mode === 'week') {
        const w = isoWeek(dDate);
        key = `${w.year}-W${String(w.week).padStart(2, '0')}`;
      } else key = d.date;
      const b = buckets.get(key);
      if (!b) continue;
      if (d.att?.worked_minutes) b.overtime += (d.att.worked_minutes - 480) / 60;
      const seen = new Set<string>();
      for (const a of d.absences) {
        const k = `${a.start_date}|${a.end_date}|${a.category}|${a.absence_type}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (a.category === 'vacation') b.vacation += 1;
        else if (a.category === 'sick') b.sick += 1;
        else b.other += 1;
      }
    }
    const data = Array.from(buckets.values())
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((b) => ({ ...b, overtime: Math.round(b.overtime * 10) / 10 }));
    return { chartData: data, bucketMode: mode };
  }, [days, period, currentYear, bucketChoice, today]);

  const visibleDays = useMemo(() => {
    if (!drill) return days;
    return days.filter((d) => d.date >= drill.from && d.date <= drill.to);
  }, [days, drill]);

  const handleBarClick = (data: any) => {
    if (!data) return;
    const payload = data.activePayload?.[0]?.payload ?? data.payload ?? data;
    if (!payload?.from || !payload?.to) return;
    if (drill && drill.from === payload.from && drill.to === payload.to) {
      setDrill(null);
    } else {
      setDrill({ from: payload.from, to: payload.to, label: payload.label });
    }
  };



  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-4 border-b border-border flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            {user && <UserAvatar user={user as any} size="md" />}
            <div>
              <DialogTitle className="text-sm font-medium">{user?.display_name}</DialogTitle>
              <div className="text-[10px] font-mono text-muted-foreground">{user?.short_code} · Personio-Transaktionen {currentYear}</div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border-b border-border">
          <div className="bg-card px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Arbeitszeit</div>
            <div className="text-sm font-semibold tabular-nums">{(totals.worked / 60).toFixed(1)}h</div>
          </div>
          <div className="bg-card px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Überstunden</div>
            <div className={cn('text-sm font-semibold tabular-nums', totals.overtime >= 0 ? 'text-emerald-400' : 'text-destructive')}>
              {totals.overtime >= 0 ? '+' : ''}{(totals.overtime / 60).toFixed(1)}h
            </div>
          </div>
          <div className="bg-card px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Urlaubstage</div>
            <div className="text-sm font-semibold tabular-nums text-sky-400">{totals.vacation}</div>
          </div>
          <div className="bg-card px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Krankheitstage</div>
            <div className="text-sm font-semibold tabular-nums text-amber-400">{totals.sick}</div>
          </div>
          <div className="bg-card px-3 py-2">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Sonstige</div>
            <div className="text-sm font-semibold tabular-nums text-violet-400">{totals.other}</div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-border bg-muted/20 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
            <CalendarDays className="h-3 w-3" />
            Zeitraum
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-[140px] text-xs bg-card">
              <SelectValue placeholder="Zeitraum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="year">Gesamtjahr</SelectItem>
              <SelectItem value="Q1">Q1</SelectItem>
              <SelectItem value="Q2">Q2</SelectItem>
              <SelectItem value="Q3">Q3</SelectItem>
              <SelectItem value="Q4">Q4</SelectItem>
              {monthNames.map((name, i) => (
                <SelectItem key={i} value={`M${i + 1}`}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide ml-2">
            <SlidersHorizontal className="h-3 w-3" />
            Abwesenheit
          </div>
          <Select value={absFilter} onValueChange={setAbsFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs bg-card">
              <SelectValue placeholder="Abwesenheitsart" />
            </SelectTrigger>
            <SelectContent>
              {absenceOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(period !== 'year' || absFilter !== 'all') && (
            <div className="ml-auto text-[10px] text-muted-foreground">
              {days.length} {days.length === 1 ? 'Tag' : 'Tage'} · {periodLabel}
              {absFilter !== 'all' && ` · ${absenceOptions.find((o) => o.value === absFilter)?.label}`}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-b border-border bg-muted/10">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              Trend · Überstunden & Abwesenheiten
            </div>
            <div className="text-[10px] text-muted-foreground">
              {bucketMode === 'month' ? 'Monatlich' : 'Täglich'}
            </div>
          </div>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === 'Überstunden') return [`${Number(value) >= 0 ? '+' : ''}${value}h`, name];
                    return [`${value} Tage`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                <Bar yAxisId="right" dataKey="vacation" name="Urlaub" stackId="abs" fill="hsl(199 89% 60%)" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="sick" name="Krank" stackId="abs" fill="hsl(38 92% 60%)" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="other" name="Sonstige" stackId="abs" fill="hsl(262 70% 65%)" radius={[2, 2, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="overtime" name="Überstunden" stroke="hsl(160 70% 50%)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">

          {days.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Keine Transaktionen für den gewählten Zeitraum und Filter.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Datum</th>
                  <th className="text-left font-medium px-3 py-2">Stempelzeiten</th>
                  <th className="text-right font-medium px-3 py-2">Arbeitszeit</th>
                  <th className="text-right font-medium px-3 py-2">Δ 8h</th>
                  <th className="text-left font-medium px-3 py-2">Abwesenheit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map((d) => {
                  const delta = d.att?.worked_minutes ? d.att.worked_minutes - 480 : 0;
                  const seen = new Set<string>();
                  const uniqAbs = d.absences.filter((a) => {
                    const k = `${a.start_date}|${a.end_date}|${a.category}|${a.absence_type}`;
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                  });
                  const visibleAbs = absFilter === 'all'
                    ? uniqAbs
                    : uniqAbs.filter((a) => matchesAbsenceFilter(a, absFilter));
                  return (
                    <tr key={d.date} className="hover:bg-muted/30">
                      <td className="px-4 py-2 whitespace-nowrap text-foreground">{fmtDateDE(d.date)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {d.att?.start_time
                          ? `${fmtTime(d.att.start_time)}–${fmtTime(d.att.end_time)}`
                          : '–'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.att?.worked_minutes ? fmtHours(d.att.worked_minutes) : '–'}
                      </td>
                      <td className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        d.att?.worked_minutes
                          ? (delta >= 0 ? 'text-emerald-400' : 'text-destructive')
                          : 'text-muted-foreground',
                      )}>
                        {d.att?.worked_minutes
                          ? `${delta >= 0 ? '+' : ''}${(delta / 60).toFixed(1)}h`
                          : '–'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {visibleAbs.map((a, i) => (
                            <span
                              key={i}
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px]',
                                absenceTone(a),
                              )}
                              title={`${a.start_date} → ${a.end_date} (${a.days_count} Tage)`}
                            >
                              {absenceLabel(a)}
                            </span>
                          ))}
                          {visibleAbs.length === 0 && <span className="text-muted-foreground">–</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

