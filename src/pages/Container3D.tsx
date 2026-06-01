import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Shield, FolderArchive, Boxes, ArrowUpRight, Inbox, Sparkles } from "lucide-react";

type Module = {
  href: string;
  label: string;
  sub: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  hue: string; // tailwind gradient
  accent: string;
};

const MODULES: Module[] = [
  {
    href: "/inbox",
    label: "Intelligent Inbox",
    sub: "Eingang · KI-Verteiler · Triage",
    desc: "Erster Schritt aller Eingänge: KI klassifiziert, extrahiert und verteilt automatisch an Vorgänge, Versicherungen, Dokumente oder ISSOS.",
    icon: Inbox,
    hue: "from-fuchsia-500/30 via-pink-500/10 to-transparent",
    accent: "text-fuchsia-300",
  },
  {
    href: "/mtiq/drafts",
    label: "MTIQ Posteingang",
    sub: "Entwürfe · KI-Vorschläge",
    desc: "Von MTIQ vorbereitete Antworten, Notizen und Subtask-Vorschläge zur Freigabe – getrennt vom klassischen Eingang.",
    icon: Sparkles,
    hue: "from-amber-500/30 via-orange-500/10 to-transparent",
    accent: "text-amber-300",
  },
  {
    href: "/insurance",
    label: "Versicherungen",
    sub: "Policies · Verträge · Schäden",
    desc: "Zentrale Ablage für Verträge, Versicherungen und Dokumente – mit Versionierung, Volltextsuche und Ablauf-Erinnerung.",
    icon: Shield,
    hue: "from-cyan-500/30 via-sky-500/10 to-transparent",
    accent: "text-cyan-300",
  },
  {
    href: "/documents",
    label: "Dokumente",
    sub: "Verträge · Richtlinien · Dateien",
    desc: "Strukturierte Ablage interner Dokumente mit Metadaten, Verknüpfungen zu Vorgängen und Volltextsuche.",
    icon: FolderArchive,
    hue: "from-indigo-500/30 via-violet-500/10 to-transparent",
    accent: "text-indigo-300",
  },
  {
    href: "/issos",
    label: "ISSOS (APS Delta)",
    sub: "APS-Delta · Trigger-Mails",
    desc: "Automatisch erkannte APS-Delta-Eingänge. Jeder Anhang wird einzeln archiviert und strukturiert auffindbar gemacht.",
    icon: Boxes,
    hue: "from-emerald-500/30 via-teal-500/10 to-transparent",
    accent: "text-emerald-300",
  },
];

export default function Container3D() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
        {/* Background mesh */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 10%, hsl(var(--primary)/0.18), transparent 45%), radial-gradient(circle at 85% 30%, hsl(190 80% 50% / 0.18), transparent 50%), radial-gradient(circle at 50% 90%, hsl(265 80% 60% / 0.16), transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          }}
        />

        <div className="relative p-6 md:p-10 space-y-8 animate-fade-in">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              <span className="inline-block h-1 w-1 rounded-full bg-primary animate-pulse" />
              Storage Layer · v1
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              3D Container
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Zentrale Sicht auf alle Ablagen. Module bleiben unverändert – nur der Zugang ist
              jetzt gebündelt. Jede Kachel führt direkt in das jeweilige Modul.
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((m, i) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.href}
                  onClick={() => navigate(m.href)}
                  className="group relative text-left rounded-2xl border border-border/60 bg-card/40 backdrop-blur-xl p-5 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.35)]"
                  style={{ animation: `fade-in 0.4s ease-out ${i * 80}ms both` }}
                >
                  {/* glow */}
                  <div
                    aria-hidden
                    className={`absolute -top-20 -right-20 h-56 w-56 rounded-full bg-gradient-to-br ${m.hue} blur-2xl opacity-70 group-hover:opacity-100 transition-opacity`}
                  />
                  {/* corner brackets */}
                  <div aria-hidden className="absolute inset-3 pointer-events-none">
                    <span className="absolute top-0 left-0 h-3 w-3 border-t border-l border-foreground/20" />
                    <span className="absolute top-0 right-0 h-3 w-3 border-t border-r border-foreground/20" />
                    <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-foreground/20" />
                    <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-foreground/20" />
                  </div>

                  <div className="relative flex items-start justify-between mb-6">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-background/60 ${m.accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>

                  <div className="relative space-y-1.5">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                      {m.sub}
                    </div>
                    <h2 className="text-lg font-semibold tracking-tight">{m.label}</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {m.desc}
                    </p>
                  </div>

                  <div className="relative mt-5 flex items-center justify-between text-[10px] text-muted-foreground/80">
                    <span className="font-mono">{m.href}</span>
                    <span className="opacity-70 group-hover:opacity-100">Öffnen →</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
