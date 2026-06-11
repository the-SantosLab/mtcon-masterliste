import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock, Plane, Stethoscope, Calendar, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid,
} from 'recharts';

interface Attendance {
  id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  worked_minutes: number;
  source: string;
}
interface Absence {
  id: string;
  absence_type: string;
  category: string | null;
  start_date: string;
  end_date: string;
  days_count: number;
  status: string | null;
}

const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '–');
const fmtHours = (min: number) => (min > 0 ? `${(min / 60).toFixed(1)} h` : '0 h');
const todayStr = () => new Date().toISOString().slice(0, 10);
const startOfWeek = (d = new Date()) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Montag = 0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
};
const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function AttendancePanel({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 400);
    const from = yearAgo.toISOString().slice(0, 10);
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [att, abs, settings] = await Promise.all([
      supabase.from('personio_attendances').select('*')
        .eq('user_id', userId).gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }),
      supabase.from('personio_absences').select('*')
        .eq('user_id', userId).gte('end_date', from).lte('start_date', to)
        .order('start_date', { ascending: false }),
      supabase.from('integration_settings').select('config').eq('id', 'personio').maybeSingle(),
    ]);

    if (att.error && att.error.code === 'PGRST301') setForbidden(true);
    setAttendances((att.data as Attendance[]) || []);
    setAbsences((abs.data as Absence[]) || []);
    const cfg = (settings.data?.config as any) || {};
    setLastSync(cfg.last_attendance_sync_at || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`attendance-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'personio_attendances', filter: `user_id=eq.${userId}` },
        () => load())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'personio_absences', filter: `user_id=eq.${userId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ---- Berechnungen ----
  const today = todayStr();
  const todayAtt = attendances.find((a) => a.work_date === today);
  const todayAbs = absences.find((a) => today >= a.start_date && today <= a.end_date);

  const currentStatus = useMemo(() => {
    if (todayAbs) {
      if (todayAbs.category === 'vacation') return { label: 'Im Urlaub', tone: 'text-sky-400', dot: 'bg-sky-400' };
      if (todayAbs.category === 'sick') return { label: 'Krank gemeldet', tone: 'text-amber-400', dot: 'bg-amber-400' };
      return { label: todayAbs.absence_type, tone: 'text-violet-400', dot: 'bg-violet-400' };
    }
    if (todayAtt?.start_time && !todayAtt?.end_time) {
      return { label: `Anwesend seit ${fmtTime(todayAtt.start_time)}`, tone: 'text-emerald-400', dot: 'bg-emerald-400' };
    }
    if (todayAtt?.start_time && todayAtt?.end_time) {
      return { label: `Feierabend (${fmtTime(todayAtt.end_time)})`, tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
    }
    return { label: 'Nicht eingestempelt', tone: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };
  }, [todayAtt, todayAbs]);

  const aggregate = (from: string) => {
    const minutes = attendances
      .filter((a) => a.work_date >= from && a.work_date <= today)
      .reduce((s, a) => s + (a.worked_minutes || 0), 0);
    const vac = absences
      .filter((a) => a.category === 'vacation' && a.end_date >= from && a.start_date <= today)
      .reduce((s, a) => s + (Number(a.days_count) || 0), 0);
    const sick = absences
      .filter((a) => a.category === 'sick' && a.end_date >= from && a.start_date <= today)
      .reduce((s, a) => s + (Number(a.days_count) || 0), 0);
    return { minutes, vac, sick };
  };

  const week = aggregate(startOfWeek());
  const month = aggregate(startOfMonth());
  const year = aggregate(startOfYear());

  // 30-Tage Chart
  const chartData = useMemo(() => {
    const days: { date: string; label: string; hours: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const att = attendances.find((a) => a.work_date === ds);
      days.push({
        date: ds,
        label: `${d.getDate()}.${d.getMonth() + 1}.`,
        hours: att ? Math.round(((att.worked_minutes || 0) / 60) * 10) / 10 : 0,
      });
    }
    return days;
  }, [attendances]);

  if (forbidden) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-xs text-muted-foreground text-center">
        Keine Berechtigung zur Anzeige dieser Zeitdaten.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const noData = attendances.length === 0 && absences.length === 0;

  return (
    <div className="space-y-3">
      {/* Status-Header */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${currentStatus.dot} animate-pulse`} />
          <div>
            <div className={`text-sm font-semibold ${currentStatus.tone}`}>{currentStatus.label}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {lastSync ? `Sync: ${new Date(lastSync).toLocaleString('de-DE')}` : 'Noch kein Sync'}
            </div>
          </div>
        </div>
        {todayAtt && (
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Heute</div>
            <div className="text-xs font-mono">
              {fmtTime(todayAtt.start_time)} – {fmtTime(todayAtt.end_time)} · {fmtHours(todayAtt.worked_minutes)}
            </div>
          </div>
        )}
      </div>

      {noData && (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
          Noch keine Personio-Daten vorhanden. Der Sync läuft automatisch alle 5 Minuten.
        </div>
      )}

      {/* Aggregate */}
      {!noData && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Woche', data: week, icon: Clock },
            { label: 'Monat', data: month, icon: Calendar },
            { label: 'Jahr', data: year, icon: TrendingUp },
          ].map(({ label, data, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3 w-3" /> {label}
              </div>
              <div className="text-base font-semibold mt-1 tabular-nums">{fmtHours(data.minutes)}</div>
              <div className="text-[10px] text-muted-foreground mt-1 flex gap-2">
                <span className="inline-flex items-center gap-1"><Plane className="h-2.5 w-2.5" />{data.vac.toFixed(1)}</span>
                <span className="inline-flex items-center gap-1"><Stethoscope className="h-2.5 w-2.5" />{data.sick.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {!noData && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            Letzte 30 Tage · Stunden
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={4} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={28} />
                <RTooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11, borderRadius: 6 }}
                  formatter={(v: any) => [`${v} h`, 'Arbeitszeit']}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Geplante / aktive Abwesenheiten */}
      {absences.filter((a) => a.end_date >= today).slice(0, 3).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            Anstehende Abwesenheiten
          </div>
          <ul className="space-y-1.5">
            {absences.filter((a) => a.end_date >= today).slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  {a.category === 'vacation' ? <Plane className="h-3 w-3 text-sky-400" />
                   : a.category === 'sick' ? <Stethoscope className="h-3 w-3 text-amber-400" />
                   : <Calendar className="h-3 w-3 text-muted-foreground" />}
                  {a.absence_type}
                </span>
                <span className="font-mono text-muted-foreground">
                  {new Date(a.start_date).toLocaleDateString('de-DE')}
                  {a.start_date !== a.end_date && ` – ${new Date(a.end_date).toLocaleDateString('de-DE')}`}
                  {' · '}{Number(a.days_count).toFixed(1)} T
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
