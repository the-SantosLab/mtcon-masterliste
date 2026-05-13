import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, Briefcase, LogOut } from 'lucide-react';
import mtconLogo from '@/assets/mtcon_logo.png';

export default function ModuleSelect() {
  const navigate = useNavigate();
  const { profile, signOut, user } = useAuth();

  // CRM is beta-only for js@santoslab.de
  if (user?.email !== 'js@santoslab.de') {
    return <Navigate to="/" replace />;
  }

  const choose = (mod: 'ops' | 'crm') => {
    localStorage.setItem('mtcon.module', mod);
    navigate(mod === 'crm' ? '/crm/dashboard' : '/');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background glass-bg p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <img src={mtconLogo} alt="MTCON" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-xs text-muted-foreground">Angemeldet als</p>
              <p className="text-sm font-medium text-foreground">{profile?.display_name || '–'}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" /> Abmelden
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-1">Modul wählen</h1>
        <p className="text-sm text-muted-foreground mb-8">Wählen Sie den Arbeitsbereich, mit dem Sie fortfahren möchten.</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => choose('ops')}
            className="group text-left p-6 rounded-lg border border-border bg-card/60 backdrop-blur-xl hover:border-primary/60 hover:bg-card/80 transition-all"
          >
            <div className="h-10 w-10 rounded bg-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary/25">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">Masterliste / OPS</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Vorgangs- und Auftragsbearbeitung, Projekte, Support.
            </p>
          </button>

          <button
            onClick={() => choose('crm')}
            className="group text-left p-6 rounded-lg border border-border bg-card/60 backdrop-blur-xl hover:border-primary/60 hover:bg-card/80 transition-all"
          >
            <div className="h-10 w-10 rounded bg-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary/25">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <p className="text-base font-semibold text-foreground mb-1">CRM</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Vertriebspipeline, Unternehmen, Kontakte, Angebote.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
