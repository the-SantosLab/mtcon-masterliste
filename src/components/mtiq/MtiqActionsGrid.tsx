import { Zap, CheckCircle2, Edit3, BarChart3, Calendar, Mail } from 'lucide-react';

export interface MtiqAction {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  prompt: string;
}

export const MTIQ_ACTIONS: MtiqAction[] = [
  { key: 'summary', icon: Zap, label: 'Zusammenfassen', desc: 'KI fasst den Vorgang zusammen', prompt: 'Fasse den aktuellen Vorgang prägnant zusammen.' },
  { key: 'todos', icon: CheckCircle2, label: 'To-dos ableiten', desc: 'Aus Notizen Unteraufgaben erstellen', prompt: 'Leite aus den Notizen konkrete Unteraufgaben ab.' },
  { key: 'text', icon: Edit3, label: 'Text formulieren', desc: 'MTIQ hilft beim Beschreibungstext', prompt: 'Hilf mir, den Beschreibungstext professionell zu formulieren.' },
  { key: 'risk', icon: BarChart3, label: 'Status analysieren', desc: 'KI bewertet Fortschritt & Risiken', prompt: 'Bewerte den Fortschritt und mögliche Risiken dieses Vorgangs.' },
  { key: 'meeting', icon: Calendar, label: 'Meeting verarbeiten', desc: 'Transkript einlesen & Vorgänge erstellen', prompt: 'Hier ist ein Meeting-Transkript – extrahiere relevante Aufgaben:\n\n' },
  { key: 'email', icon: Mail, label: 'E-Mail analysieren', desc: 'Eingegangene E-Mail auswerten', prompt: 'Analysiere folgende E-Mail und schlage nächste Schritte vor:\n\n' },
];

export function MtiqActionsGrid({ onPick }: { onPick: (a: MtiqAction) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {MTIQ_ACTIONS.map(a => (
        <button
          key={a.key}
          onClick={() => onPick(a)}
          className="text-left p-3 rounded-xl transition-colors"
          style={{ background: '#181818', border: '1px solid #222' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
          onMouseLeave={e => (e.currentTarget.style.background = '#181818')}
        >
          <div
            className="flex items-center justify-center mb-2"
            style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #0ea5e9 0%, #818cf8 100%)' }}
          >
            <a.icon className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="text-[12px] font-medium" style={{ color: '#e0e0e0' }}>{a.label}</div>
          <div className="text-[10px] mt-0.5 leading-snug" style={{ color: '#666' }}>{a.desc}</div>
        </button>
      ))}
    </div>
  );
}
