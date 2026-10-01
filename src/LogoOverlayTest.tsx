// TEMPORÄRE Testseite: Seitenleiste mit Logo-Overlay über dem Menü, exakt wie
// in AppLayout.tsx, damit das Verhalten bei maximaler Größe geprüft werden kann.
import { useState, useEffect, useRef } from 'react';
import mtconErpLabel from '@/assets/mtcon-erp-label.png';
import { Sun, Moon, AlignJustify, AlignLeft, Type, ClipboardList, FolderKanban, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  'Cockpit', 'Vorgänge', 'Kanban', 'Aufträge', 'Lager', 'Belege', 'CRM',
  'Posteingang', 'Support', 'Personal', 'Einstellungen', 'Admin', 'Vertrieb',
  'Ziele', 'Berichte', 'Archive', 'Werkzeuge',
];

export default function LogoOverlayTest() {
  const LOGO_MIN = 48;
  const LOGO_CAP = 400;
  const asideRef = useRef<HTMLElement | null>(null);
  const logoCtlRowRef = useRef<HTMLDivElement | null>(null);
  const logoMaxRef = useRef<number>(LOGO_CAP);
  const [logoMax, setLogoMax] = useState<number>(LOGO_CAP);
  const [logoBottom, setLogoBottom] = useState<number>(0);
  const [logoSize, setLogoSize] = useState(120);

  const clampLogo = (n: number) =>
    Math.min(Math.max(LOGO_MIN, Math.round(n)), Math.max(LOGO_MIN, logoMaxRef.current));

  useEffect(() => {
    localStorage.setItem('mtcon.sidebarLogoSize', '400');
    const measure = () => {
      const el = asideRef.current;
      if (!el) return;
      const ar = el.getBoundingClientRect();
      const ctlTop = logoCtlRowRef.current?.getBoundingClientRect().top ?? ar.bottom;
      const availH = Math.floor(ctlTop - ar.top - 64);
      const availW = Math.floor(el.clientWidth - 24);
      const next = Math.max(LOGO_MIN, Math.min(LOGO_CAP, availW, availH));
      logoMaxRef.current = next;
      setLogoMax(next);
      setLogoBottom(Math.max(0, Math.round(ar.bottom - ctlTop)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (asideRef.current) ro.observe(asideRef.current);
    if (logoCtlRowRef.current) ro.observe(logoCtlRowRef.current);
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
    <div className="flex h-screen overflow-hidden bg-background" data-harness>
      <aside
        ref={asideRef}
        data-logo-row
        className="fixed lg:relative inset-y-0 left-0 z-50 flex flex-col glass-sidebar overflow-hidden w-64"
      >
        <div className="flex items-center gap-2 px-3 h-14 border-b border-sidebar-border shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground leading-tight">Masterliste</p>
            <p className="text-[8px] text-muted-foreground/60 tracking-widest uppercase">v1.5</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {items.map((t, i) => (
            <button
              key={t}
              data-nav={t}
              onClick={() => localStorage.setItem('mtcon.last_nav', t)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 rounded text-[15px] text-sidebar-foreground hover:bg-sidebar-accent/60',
                i === 0 && 'bg-sidebar-accent/60 text-foreground',
              )}
            >
              {i % 4 === 0 ? <ClipboardList className="h-4 w-4" /> : i % 4 === 1 ? <FolderKanban className="h-4 w-4" /> : i % 4 === 2 ? <Users className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
              <span className="flex-1 text-left">{t}</span>
            </button>
          ))}
        </nav>

        <div className="pointer-events-none absolute left-0 z-20 pl-4" style={{ bottom: logoBottom }}>
          <div className="relative" style={{ width: effectiveLogoSize, height: effectiveLogoSize }}>
            <img
              src={mtconErpLabel}
              alt="MTCON goes ERP"
              draggable={false}
              className="w-full h-full object-contain opacity-90"
            />
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Ziehen: Logo-Größe anpassen"
              onPointerDown={startLogoResize}
              className="pointer-events-auto absolute -top-2 left-0 right-0 h-3 cursor-ns-resize group flex items-start justify-center touch-none"
            >
              <span className="mt-0.5 h-1 w-10 rounded-full bg-muted-foreground/20 group-hover:bg-muted-foreground/50 transition-colors" />
            </div>
          </div>
        </div>

        <div ref={logoCtlRowRef} className="relative z-30 shrink-0 px-4 pt-2 pb-1 flex justify-end">
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground"><Sun className="h-[18px] w-[18px]" /></button>
            <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground"><AlignJustify className="h-[18px] w-[18px]" /></button>
            <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground"><AlignLeft className="h-[18px] w-[18px]" /></button>
            <button type="button" className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground"><Type className="h-[18px] w-[18px]" /></button>
          </div>
        </div>

        <div className="relative z-30 px-3 py-3 shrink-0">
          <button className="flex items-center gap-2.5 w-full rounded px-1 py-1 hover:bg-sidebar-accent/60">
            <span className="h-9 w-9 rounded-full bg-muted shrink-0" />
            <span className="flex-1 min-w-0 text-left">
              <span className="block text-sm font-medium text-foreground truncate">Kai Stolz</span>
              <span className="block text-[10px] text-muted-foreground">admin</span>
            </span>
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6">
        <p className="text-sm text-muted-foreground">Inhalt dahinter – das Logo wächst über das Menü, nicht über die Karte.</p>
      </main>
    </div>
  );
}
