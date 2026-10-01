// TEMPORÄRE Testseite: zeigt die Sidebar-Leiste mit Logo und Zieh-Regler exakt
// wie in AppLayout.tsx, damit die Obergrenze in mehreren Breiten geprüft werden kann.
import { useState, useEffect, useMemo, useRef } from 'react';
import mtconErpLabel from '@/assets/mtcon-erp-label.png';
import mtconErpLabelLight from '@/assets/mtcon-erp-label-light.png';
import { Sun, Moon, AlignJustify, AlignLeft, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

const LogoRow = ({ widthClass, isDark }: { widthClass: string; isDark: boolean }) => {
  const LOGO_MIN = 48;
  const LOGO_MAX = 200;
  const logoRowRef = useRef<HTMLDivElement | null>(null);
  const logoBtnsRef = useRef<HTMLDivElement | null>(null);
  const logoMaxRef = useRef<number>(LOGO_MAX);
  const [logoMax, setLogoMax] = useState<number>(LOGO_MAX);
  const [logoSize, setLogoSize] = useState<number>(() => {
    const stored = typeof window !== 'undefined' ? Number(localStorage.getItem('mtcon.sidebarLogoSize')) : NaN;
    return Number.isFinite(stored) && stored >= LOGO_MIN && stored <= LOGO_MAX ? stored : 120;
  });

  const clampLogo = (n: number) =>
    Math.min(Math.max(LOGO_MIN, Math.round(n)), Math.max(LOGO_MIN, logoMaxRef.current));

  useEffect(() => {
    const measure = () => {
      const row = logoRowRef.current;
      if (!row) return;
      const btns = logoBtnsRef.current?.getBoundingClientRect().width ?? 0;
      const avail = Math.floor(row.clientWidth - btns - 8);
      const next = Math.max(LOGO_MIN, Math.min(LOGO_MAX, avail));
      logoMaxRef.current = next;
      setLogoMax(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (logoRowRef.current) ro.observe(logoRowRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const effectiveLogoSize = Math.min(logoSize, logoMax);

  const startLogoResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startSize = clampLogo(logoSize);
    const nextFrom = (clientY: number) => clampLogo(startSize - (clientY - startY));
    const onMove = (ev: PointerEvent) => setLogoSize(nextFrom(ev.clientY));
    const onUp = (ev: PointerEvent) => {
      localStorage.setItem('mtcon.sidebarLogoSize', String(nextFrom(ev.clientY)));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <aside
      data-logo-row
      className={cn('flex flex-col glass-sidebar', widthClass)}
      style={{ height: 260 }}
    >
      <div className="flex-1" />
      <div
        ref={logoRowRef}
        className="relative px-4 pb-3 pt-3 mt-1 shrink-0 flex items-center justify-between gap-2 overflow-hidden"
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          title="Ziehen: Logo-Größe anpassen"
          onPointerDown={startLogoResize}
          className="absolute -top-1 left-2 right-2 h-3 cursor-ns-resize group flex items-start justify-center touch-none"
        >
          <span className="mt-0.5 h-1 w-10 rounded-full bg-muted-foreground/20 group-hover:bg-muted-foreground/50 transition-colors" />
        </div>
        <img
          src={isDark ? mtconErpLabel : mtconErpLabelLight}
          alt="MTCON goes ERP"
          style={{ maxWidth: effectiveLogoSize }}
          className="w-full min-w-0 h-auto opacity-90"
        />
        <div ref={logoBtnsRef} className="flex items-center gap-1 shrink-0">
          <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground">
            <Sun className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground">
            <AlignJustify className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground">
            <AlignLeft className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground">
            <Type className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default function LogoTestHarness() {
  const [dragToMax, setDragToMax] = useState(true);
  useEffect(() => {
    if (dragToMax) localStorage.setItem('mtcon.sidebarLogoSize', '200');
  }, [dragToMax]);
  const widths = useMemo(() => ['w-64', 'w-56', 'w-44'], []);
  return (
    <div className="min-h-screen bg-background p-6 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-foreground">Logo-Größe: maximaler Wert pro Breite</h1>
        <button
          type="button"
          onClick={() => setDragToMax((v) => !v)}
          className="text-xs rounded border border-border px-2 py-1 text-muted-foreground"
        >
          {dragToMax ? 'Regler ganz hoch gezogen' : 'Standardgröße'}
        </button>
      </div>
      <div className="flex items-end gap-6 flex-wrap">
        {widths.map((w) => (
          <div key={w} className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">{w}</span>
            <LogoRow widthClass={w} isDark />
          </div>
        ))}
      </div>
    </div>
  );
}
