import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Shield, FolderArchive, Boxes, Inbox, Sparkles, Package, Copy, Check, Mail, FileSignature } from "lucide-react";
import { useContainerUnread, markContainerSeen } from "@/hooks/useContainerUnread";
import { useContainerBlocks } from "@/hooks/useContainerBlocks";
import { Lock } from "lucide-react";
import { toast } from "sonner";

const INTAKE_EMAIL = "mtiq@inbox.kscommand.com";

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
    angle: -38.6,
  },
  {
    href: "/bestellungen",
    label: "Bestellungen",
    sub: "Eingänge · Aufträge",
    icon: Package,
    color: "25 90% 55%", // orange
    angle: 12.9,
  },
  {
    href: "/ghv",
    label: "GHV",
    sub: "Geheimhaltungserklärungen",
    icon: FileSignature,
    color: "265 85% 65%",
    angle: 64.3,
  },
  {
    href: "/documents",
    label: "Dokumente",
    sub: "Verträge · Dateien",
    icon: FolderArchive,
    color: "255 85% 65%", // violet
    angle: 115.7,
  },
  {
    href: "/issos",
    label: "ISSOS",
    sub: "APS-Delta · Trigger",
    icon: Boxes,
    color: "160 80% 50%", // emerald
    angle: 167.1,
  },
  {
    href: "/inbox/documents",
    label: "Inbox Archiv",
    sub: "Verarbeitete Eingänge",
    icon: Inbox,
    color: "320 85% 65%", // fuchsia
    angle: 218.6,
  },
];

export default function Container3D() {
  const navigate = useNavigate();
  const { counts, total } = useContainerUnread();
  const { isBlocked } = useContainerBlocks();
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(INTAKE_EMAIL);
      setCopied(true);
      toast.success("E-Mail-Adresse kopiert");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const go = (href: string) => {
    if (isBlocked(href)) {
      toast.error("Kein Zugriff auf diesen Ordner. Bitte wende dich an einen Administrator.");
      return;
    }
    markContainerSeen(href);
    navigate(href);
  };


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
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
                3D Container
              </h1>
              {total > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-fuchsia-200 shadow-[0_0_20px_hsl(320_90%_60%/0.35)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300 animate-pulse" />
                  Neuigkeiten · {total}
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-white/60 max-w-2xl">
              Die Intelligent Inbox ist der zentrale Verteiler. Von hier fließt jeder Eingang
              automatisch in das passende Modul.
            </p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <div className="group inline-flex items-stretch overflow-hidden rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-fuchsia-500/10 backdrop-blur-xl shadow-[0_0_30px_hsl(38_95%_60%/0.25)]">
                <button
                  type="button"
                  onClick={copyEmail}
                  onFocus={(e) => {
                    const range = document.createRange();
                    range.selectNodeContents(e.currentTarget);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                  }}
                  title="Klicken zum Kopieren"
                  className="flex items-center gap-2 pl-3.5 pr-2 py-1.5 text-xs md:text-sm font-mono tracking-tight text-amber-100 hover:text-white transition-colors select-all cursor-pointer"
                >
                  <Mail className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                  <span>{INTAKE_EMAIL}</span>
                </button>
                <button
                  type="button"
                  onClick={copyEmail}
                  aria-label="E-Mail-Adresse kopieren"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] border-l border-amber-400/30 bg-amber-500/20 hover:bg-amber-500/30 text-amber-50 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Kopiert" : "Kopieren"}
                </button>
              </div>
              <a
                href={`mailto:${INTAKE_EMAIL}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Mail className="h-3 w-3" />
                E-Mail öffnen
              </a>
            </div>
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
              const unread = counts[s.href] ?? 0;
              const locked = isBlocked(s.href);
              return (
                <button
                  key={s.href}
                  onClick={() => go(s.href)}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl transition-transform focus:outline-none ${locked ? 'cursor-not-allowed' : 'hover:scale-110'}`}
                  style={{
                    left: `${(p.x * 100) / VB}%`,
                    top: `${(p.y * 100) / VB}%`,
                    width: `${(NODE_R * 2 * 100) / VB}%`,
                    height: `${(NODE_R * 2 * 100) / VB}%`,
                    animation: `fade-in 0.6s ease-out ${i * 120}ms both`,
                    opacity: locked ? 0.45 : 1,
                  }}
                  title={locked ? `${s.label} · Kein Zugriff` : (unread > 0 ? `${s.label} · ${unread} neu` : s.label)}
                >
                  {locked && (
                    <span className="absolute inset-0 rounded-full bg-black/40 backdrop-blur-[1px] z-20 flex items-center justify-center">
                      <span className="flex items-center justify-center h-8 w-8 rounded-full bg-black/70 border border-white/30">
                        <Lock className="h-4 w-4 text-white/90" />
                      </span>
                    </span>
                  )}
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

                  {/* unread badge (overlapping top-right) */}
                  {unread > 0 && (
                    <span
                      className="absolute -top-1 -right-1 z-10 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white/30 shadow-[0_0_12px_hsl(0_85%_55%/0.7)] tabular-nums"
                      style={{
                        background: `linear-gradient(135deg, hsl(${s.color}), hsl(${s.color} / 0.7))`,
                      }}
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}

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
      </div>
    </AppLayout>
  );
}
