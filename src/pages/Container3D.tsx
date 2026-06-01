import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Shield, FolderArchive, Boxes, Inbox, Sparkles } from "lucide-react";

type Module = {
  href: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string; // hsl
  angle: number; // degrees on the orbit
};

const SATELLITES: Module[] = [
  {
    href: "/mtiq/drafts",
    label: "MTIQ Posteingang",
    sub: "Entwürfe · KI-Vorschläge",
    icon: Sparkles,
    color: "38 95% 60%", // amber
    angle: -90,
  },
  {
    href: "/insurance",
    label: "Versicherungen",
    sub: "Policies · Verträge",
    icon: Shield,
    color: "190 90% 55%", // cyan
    angle: -18,
  },
  {
    href: "/documents",
    label: "Dokumente",
    sub: "Verträge · Dateien",
    icon: FolderArchive,
    color: "255 85% 65%", // violet
    angle: 54,
  },
  {
    href: "/issos",
    label: "ISSOS",
    sub: "APS-Delta · Trigger",
    icon: Boxes,
    color: "160 80% 50%", // emerald
    angle: 126,
  },
  {
    href: "/inbox/documents",
    label: "Inbox Archiv",
    sub: "Verarbeitete Eingänge",
    icon: Inbox,
    color: "320 85% 65%", // fuchsia
    angle: 198,
  },
];

export default function Container3D() {
  const navigate = useNavigate();

  // Layout (SVG viewBox coordinate space)
  const VB = 1000;
  const CX = VB / 2;
  const CY = VB / 2;
  const R = 340; // orbit radius
  const NODE_R = 78;
  const HUB_R = 120;

  const toXY = (angleDeg: number, radius: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius };
  };

  return (
    <AppLayout>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[hsl(230_30%_6%)]">
        {/* Background mesh */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, hsl(265 80% 50% / 0.25), transparent 55%), radial-gradient(circle at 15% 90%, hsl(190 90% 50% / 0.18), transparent 50%), radial-gradient(circle at 85% 10%, hsl(320 80% 55% / 0.18), transparent 50%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        <div className="relative flex h-[calc(100vh-4rem)] flex-col p-4 md:p-6 gap-4 animate-fade-in">
          <header className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-white/50">
              <span className="inline-block h-1 w-1 rounded-full bg-fuchsia-400 animate-pulse" />
              Neural Storage Layer · v2
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
              3D Container
            </h1>
            <p className="text-xs md:text-sm text-white/60 max-w-2xl">
              Die Intelligent Inbox ist der zentrale Verteiler. Von hier fließt jeder Eingang
              automatisch in das passende Modul.
            </p>
          </header>

          {/* Graph — square sized to fit remaining viewport */}
          <div className="relative flex-1 min-h-0 flex items-center justify-center">
            <div
              className="relative"
              style={{ width: "min(100%, calc(100vh - 14rem))", aspectRatio: "1 / 1" }}
            >
            <svg
              viewBox={`0 0 ${VB} ${VB}`}
              className="absolute inset-0 h-full w-full"
              aria-hidden
            >

              <defs>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(320 90% 65%)" stopOpacity="0.55" />
                  <stop offset="60%" stopColor="hsl(265 90% 55%)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="hsl(265 90% 55%)" stopOpacity="0" />
                </radialGradient>
                {SATELLITES.map((s, i) => (
                  <linearGradient
                    key={i}
                    id={`edge-${i}`}
                    gradientUnits="userSpaceOnUse"
                    x1={CX}
                    y1={CY}
                    x2={toXY(s.angle, R).x}
                    y2={toXY(s.angle, R).y}
                  >
                    <stop offset="0%" stopColor="hsl(320 90% 70%)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor={`hsl(${s.color})`} stopOpacity="0.9" />
                  </linearGradient>
                ))}
                <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Hub glow */}
              <circle cx={CX} cy={CY} r={260} fill="url(#hubGlow)" />

              {/* Orbit ring */}
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke="hsl(0 0% 100% / 0.08)"
                strokeWidth={1}
                strokeDasharray="4 6"
              />

              {/* Edges */}
              {SATELLITES.map((s, i) => {
                const p = toXY(s.angle, R);
                return (
                  <g key={s.href} filter="url(#softGlow)">
                    <line
                      x1={CX}
                      y1={CY}
                      x2={p.x}
                      y2={p.y}
                      stroke={`url(#edge-${i})`}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    {/* traveling pulse */}
                    <circle r="5" fill={`hsl(${s.color})`} opacity="0.9">
                      <animateMotion
                        dur={`${3 + i * 0.4}s`}
                        repeatCount="indefinite"
                        path={`M ${CX} ${CY} L ${p.x} ${p.y}`}
                      />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0"
                        dur={`${3 + i * 0.4}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                );
              })}
            </svg>

            {/* Hub (central node) */}
            <button
              onClick={() => navigate("/inbox")}
              className="group absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60"
              style={{
                width: `${(HUB_R * 2 * 100) / VB}%`,
                height: `${(HUB_R * 2 * 100) / VB}%`,
              }}
            >
              <span
                className="absolute inset-0 rounded-full blur-2xl opacity-80"
                style={{
                  background:
                    "radial-gradient(circle, hsl(320 90% 65% / 0.7), hsl(265 90% 55% / 0.3) 60%, transparent 75%)",
                }}
              />
              <span className="absolute inset-0 rounded-full border border-white/20 bg-[hsl(230_40%_10%/0.7)] backdrop-blur-xl shadow-[0_0_60px_hsl(320_90%_60%/0.45),inset_0_0_30px_hsl(320_90%_70%/0.15)]" />
              <span className="absolute inset-2 rounded-full border border-fuchsia-400/30 animate-pulse" />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white">
                <Inbox className="h-7 w-7 text-fuchsia-300 drop-shadow-[0_0_8px_hsl(320_90%_70%)]" />
                <span className="text-[11px] font-semibold tracking-wide">Intelligent</span>
                <span className="text-[11px] font-semibold tracking-wide -mt-1">Inbox</span>
                <span className="text-[8px] tracking-[0.25em] uppercase text-white/50 mt-0.5">
                  Main Node
                </span>
              </span>
            </button>

            {/* Satellites */}
            {SATELLITES.map((s, i) => {
              const p = toXY(s.angle, R);
              const Icon = s.icon;
              return (
                <button
                  key={s.href}
                  onClick={() => navigate(s.href)}
                  className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl transition-transform hover:scale-110 focus:outline-none"
                  style={{
                    left: `${(p.x * 100) / VB}%`,
                    top: `${(p.y * 100) / VB}%`,
                    width: `${(NODE_R * 2 * 100) / VB}%`,
                    height: `${(NODE_R * 2 * 100) / VB}%`,
                    animation: `fade-in 0.6s ease-out ${i * 120}ms both`,
                  }}
                  title={s.label}
                >
                  <span
                    className="absolute inset-0 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity"
                    style={{
                      background: `radial-gradient(circle, hsl(${s.color} / 0.6), transparent 70%)`,
                    }}
                  />
                  <span
                    className="absolute inset-0 rounded-full border bg-[hsl(230_40%_10%/0.75)] backdrop-blur-xl"
                    style={{
                      borderColor: `hsl(${s.color} / 0.45)`,
                      boxShadow: `0 0 30px hsl(${s.color} / 0.45), inset 0 0 20px hsl(${s.color} / 0.12)`,
                    }}
                  />
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white px-2 text-center">
                    <Icon
                      className="h-5 w-5"
                      style={{
                        color: `hsl(${s.color})`,
                        filter: `drop-shadow(0 0 6px hsl(${s.color}))`,
                      }}
                    />
                    <span className="text-[10px] font-semibold leading-tight">{s.label}</span>
                  </span>

                  {/* label below */}
                  <span className="absolute left-1/2 top-full -translate-x-1/2 mt-2 whitespace-nowrap text-[9px] tracking-[0.2em] uppercase text-white/45">
                    {s.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
