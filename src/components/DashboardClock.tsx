import { memo, useEffect, useState } from 'react';

/**
 * Eigenständige Uhr-Anzeige: der Sekundentakt rendert nur diese Komponente neu,
 * nicht das gesamte Dashboard (Charts, Listen, KPIs).
 */
function DashboardClockBase({ firstName }: { firstName?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
  const timeString = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-[0.2em] text-foreground/70">{dateString}</p>
      <h1 className="mt-2 text-2xl lg:text-3xl font-semibold text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
        {greeting}{firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="mt-1 text-sm tabular-nums text-foreground/70">{timeString} Uhr</p>
    </div>
  );
}

export const DashboardClock = memo(DashboardClockBase);
