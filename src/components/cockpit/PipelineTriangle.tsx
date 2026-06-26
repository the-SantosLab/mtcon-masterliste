import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Wiederverwendbare 1:1-Portierung des Dreieck-Infografiks.
 * Positionen, Farben und Inhalte sind vollständig über Props steuerbar.
 */
export type TriangleWing = {
  id: string;
  number?: string;              // "01"
  title: string;                // "SALES"
  outer: string;                // SVG stroke (helle Hauptfarbe)
  inner: string;                // SVG stroke (innerer Akzent)
  glowRgba: string;             // "255,157,51"  → für rgba(.., 0.07)
  apexClass: 'tri-ring-sales' | 'tri-ring-beschaffung' | 'tri-ring-logistik' | string;
  contentClass:
    | 'tri-sales-content'
    | 'tri-beschaffung-content'
    | 'tri-logistik-content'
    | string;
  numClass: 'orange' | 'green' | 'blue' | string;
  icon: ReactNode;              // <svg> für Apex-Ring
  bullets: ReactNode[];         // <li> Inhalte
  countLabel?: string;          // "3/7"
  slaColor?: string;            // override (rgba) for live SLA tint
  bottleneck?: boolean;         // adds red halo
  pulse?: boolean;              // adds live pulse animation
};

export type TriangleCenterData = {
  caseNo?: string;
  progressPct?: number;
  deadlineLabel?: string;            // e.g. "in 13d" or "—"
  deadlineState?: 'none' | 'ok' | 'warn' | 'crit';
  nextMilestone?: string;
};

export type PipelineTriangleProps = {
  wings: [TriangleWing, TriangleWing, TriangleWing];
  /** Legacy HTML-overlay center (kept for back-compat). Prefer `centerData`. */
  center?: { title?: ReactNode; sub?: ReactNode };
  /** Structured data rendered as SVG <text> at the exact circle center (reliable). */
  centerData?: TriangleCenterData;
  footer?: Array<{ icon: ReactNode; label: string }>;
  hoverIndex?: number | null;
  onHoverChange?: (i: number | null) => void;
  onWingClick?: (wing: TriangleWing, index: number) => void;
  activeIndex?: number | null;  // visuell „gefiltert" markieren
  rotations?: [number, number, number]; // Default [0, 120, 240]
  pivot?: { x: number; y: number };     // Default { x: 500, y: 583 }
  wedgePath?: string;
  className?: string;
};

const DEFAULT_WEDGE_PATH =
  'M315,475 L500,150 L685,475 L617,515 A135,135 0 0 1 383,515 Z';

export function PipelineTriangle({
  wings,
  center,
  footer,
  hoverIndex = null,
  onHoverChange,
  onWingClick,
  activeIndex = null,
  rotations = [0, 120, 240],
  pivot = { x: 500, y: 583 },
  wedgePath = DEFAULT_WEDGE_PATH,
  className,
}: PipelineTriangleProps) {
  const setHover = (i: number | null) => onHoverChange?.(i);

  return (
    <div className={cn('tri-scene', className)}>
      <div className="tri-grid-overlay" />

      <svg className="tri-shapes" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="triGlowSoft" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="triGlowHex" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {wings.map((w, i) => {
          const isHover = hoverIndex === i;
          const isActive = activeIndex === i;
          const dim = hoverIndex !== null && !isHover ? 0.55 : 1;
          return (
            <g key={w.id} transform={`rotate(${rotations[i]} ${pivot.x} ${pivot.y})`} opacity={dim}>
              <path
                d={wedgePath}
                fill={`rgba(${w.glowRgba},0.07)`}
                stroke={w.outer}
                strokeWidth={isHover || isActive ? 16 : 13}
                filter="url(#triGlowSoft)"
                opacity="0.6"
              />
              <path
                d={wedgePath}
                fill={`rgba(${w.glowRgba},${isActive ? 0.12 : 0.05})`}
                stroke={w.inner}
                strokeWidth={isHover || isActive ? 4.5 : 3.5}
                strokeLinejoin="round"
                style={{ cursor: onWingClick ? 'pointer' : 'default', pointerEvents: 'auto' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onWingClick?.(w, i)}
              />
            </g>
          );
        })}

        {/* dunkle Nähte */}
        <g stroke="#04050d" strokeWidth="11" strokeLinecap="round">
          <line x1="617" y1="515" x2="685" y2="475" />
          <line x1="383" y1="515" x2="315" y2="475" />
          <line x1={pivot.x} y1="718" x2={pivot.x} y2="800" />
        </g>

        {/* Flow-Chevrons */}
        <g fill="none" stroke="#dfeeff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
          <g transform="translate(660,486) rotate(55)"><path d="M-12,-12 L4,0 L-12,12 M2,-12 L18,0 L2,12" /></g>
          <g transform={`translate(${pivot.x},762) rotate(180)`}><path d="M-12,-12 L4,0 L-12,12 M2,-12 L18,0 L2,12" /></g>
          <g transform="translate(340,486) rotate(235)"><path d="M-12,-12 L4,0 L-12,12 M2,-12 L18,0 L2,12" /></g>
        </g>

        {/* Zentrum */}
        <circle cx={pivot.x} cy={pivot.y} r="135" fill="rgba(7,12,28,0.92)" stroke="#3ad6ff" strokeWidth="5.5" filter="url(#triGlowHex)" opacity="0.9" />
        <circle cx={pivot.x} cy={pivot.y} r="135" fill="none" stroke="#9fe9ff" strokeWidth="1.4" />
        <circle cx={pivot.x} cy={pivot.y} r="118" fill="none" stroke="rgba(120,210,255,0.18)" strokeWidth="1" />
      </svg>

      {/* Apex-Ringe */}
      {wings.map((w, i) => {
        const haloShadow = w.bottleneck
          ? '0 0 0 2px rgba(255,90,100,0.9), 0 0 34px 10px rgba(255,90,100,0.5)'
          : w.slaColor
            ? `0 0 0 1.5px ${w.slaColor}, 0 0 28px 8px ${w.slaColor.replace(/,[\d.]+\)$/, ',0.45)')}`
            : undefined;
        return (
          <button
            key={w.id}
            type="button"
            aria-label={w.title}
            className={cn(
              'tri-ring',
              w.apexClass,
              hoverIndex === i && 'is-hover',
              activeIndex === i && 'is-active',
              w.pulse && 'cockpit-pulse',
            )}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onWingClick?.(w, i)}
            style={{ cursor: onWingClick ? 'pointer' : 'default', ...(haloShadow ? { boxShadow: haloShadow } : {}) }}
          >
            {w.icon}
            {w.bottleneck && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', top: -10, right: -10,
                  fontSize: 8, letterSpacing: '0.15em', fontWeight: 700,
                  padding: '2px 5px', borderRadius: 4,
                  background: 'rgba(255,60,80,0.92)', color: '#fff',
                  textShadow: '0 0 4px rgba(0,0,0,0.5)',
                }}
              >ENGPASS</span>
            )}
          </button>
        );
      })}

      {/* Content-Blöcke */}
      {wings.map((w, i) => (
        <div
          key={`${w.id}-content`}
          className={cn('tri-content', `tri-${w.contentClass}`, activeIndex === i && 'is-active')}
        >
          {w.number && <p className={cn('tri-num', `tri-num--${w.numClass}`)}>{w.number}</p>}
          <p className="tri-title">{w.title}</p>
          <ul className={cn('tri-bullets', `tri-bullets--${w.numClass}`)}>
            {w.bullets.length > 0 ? (
              w.bullets
            ) : (
              <li>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                <span className="opacity-60">Keine offenen Aufgaben</span>
              </li>
            )}
          </ul>
          {w.countLabel && <div className="tri-count">{w.countLabel}</div>}
        </div>
      ))}

      {/* Zentrums-Text */}
      {center && (
        <div className="tri-hex-text">
          {center.title && <p className="tri-hex-label">{center.title}</p>}
          {center.sub && <p className="tri-hex-sub">{center.sub}</p>}
        </div>
      )}

      {/* Footer */}
      {footer && footer.length > 0 && (
        <div className="tri-footer-bar">
          {footer.map((f, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="tri-footer-divider" />}
              <div className="tri-footer-item">{f.icon}{f.label}</div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export default PipelineTriangle;
