import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Gauß'sche Osterformel → liefert Datum des Ostersonntags
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const fmtKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Feiertage Baden-Württemberg
function holidaysBW(year: number): Record<string, string> {
  const easter = easterSunday(year);
  const list: [Date, string][] = [
    [new Date(year, 0, 1), 'Neujahr'],
    [new Date(year, 0, 6), 'Heilige Drei Könige'],
    [addDays(easter, -2), 'Karfreitag'],
    [addDays(easter, 1), 'Ostermontag'],
    [new Date(year, 4, 1), 'Tag der Arbeit'],
    [addDays(easter, 39), 'Christi Himmelfahrt'],
    [addDays(easter, 50), 'Pfingstmontag'],
    [addDays(easter, 60), 'Fronleichnam'],
    [new Date(year, 9, 3), 'Tag der Deutschen Einheit'],
    [new Date(year, 10, 1), 'Allerheiligen'],
    [new Date(year, 11, 25), '1. Weihnachtsfeiertag'],
    [new Date(year, 11, 26), '2. Weihnachtsfeiertag'],
  ];
  return Object.fromEntries(list.map(([d, n]) => [fmtKey(d), n]));
}

// ISO-Wochennummer (Mo–So)
function isoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round((diff / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function CalendarWidget() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const { weeks, holidays, todayKey } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Mo=0 .. So=6
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = addDays(firstOfMonth, -startOffset);

    const weeks: { weekNo: number; days: { date: Date; inMonth: boolean }[] }[] = [];
    for (let w = 0; w < 6; w++) {
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(gridStart, w * 7 + i);
        return { date, inMonth: date.getMonth() === month };
      });
      weeks.push({ weekNo: isoWeek(days[0].date), days });
      // Stop early if last row is fully out-of-month after row 4
      if (w >= 4 && days.every(d => !d.inMonth)) {
        weeks.pop();
        break;
      }
    }

    const hol = { ...holidaysBW(year), ...holidaysBW(year + 1), ...holidaysBW(year - 1) };
    return { weeks, holidays: hol, todayKey: fmtKey(today) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  return (
    <div className="glass-card p-4 lg:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          Kalender
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">BW</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground"
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="h-7 px-2 text-[10px] uppercase tracking-wider rounded-md border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground"
            aria-label="Nächster Monat"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="text-center text-sm font-medium text-foreground mb-2 tabular-nums">
        {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
      </div>

      <div className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] gap-y-0.5 text-[11px]">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground text-center pb-1">KW</div>
        {WEEKDAYS.map(w => (
          <div
            key={w}
            className={cn(
              'text-[9px] uppercase tracking-wider text-center pb-1',
              w === 'Sa' || w === 'So' ? 'text-muted-foreground/60' : 'text-muted-foreground',
            )}
          >
            {w}
          </div>
        ))}

        {weeks.map(({ weekNo, days }) => (
          <div key={`row-${weekNo}-${fmtKey(days[0].date)}`} className="contents">
            <div className="text-center text-[10px] tabular-nums text-muted-foreground/70 py-1 border-r border-border/40">
              {weekNo}
            </div>
            {days.map(({ date, inMonth }) => {
              const key = fmtKey(date);
              const holiday = holidays[key];
              const isToday = key === todayKey;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <div
                  key={key}
                  title={holiday || undefined}
                  className={cn(
                    'relative aspect-square min-h-[28px] flex items-center justify-center rounded text-[11px] tabular-nums transition-colors',
                    !inMonth && 'text-muted-foreground/30',
                    inMonth && !holiday && !isWeekend && 'text-foreground',
                    inMonth && isWeekend && !holiday && 'text-muted-foreground/70',
                    inMonth && holiday && 'text-rose-400 font-medium bg-rose-500/10',
                    isToday && 'ring-1 ring-primary bg-primary/15 text-primary font-semibold',
                  )}
                >
                  {date.getDate()}
                  {holiday && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-rose-400" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Feiertage diesen Monat
        </div>
        <div className="space-y-1">
          {(() => {
            const month = cursor.getMonth();
            const year = cursor.getFullYear();
            const entries = Object.entries(holidays)
              .filter(([k]) => {
                const [y, m] = k.split('-').map(Number);
                return y === year && m - 1 === month;
              })
              .sort(([a], [b]) => a.localeCompare(b));
            if (entries.length === 0) {
              return <div className="text-[11px] text-muted-foreground/60">Keine Feiertage</div>;
            }
            return entries.map(([k, name]) => {
              const [, , d] = k.split('-');
              return (
                <div key={k} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    {name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {d}.{String(month + 1).padStart(2, '0')}.
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
