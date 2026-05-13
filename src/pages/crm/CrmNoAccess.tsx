import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function CrmNoAccess() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background glass-bg p-6">
      <div className="max-w-md w-full text-center">
        <div className="h-14 w-14 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-5">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Kein Zugang zum CRM</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Du hast aktuell keinen Zugang zum CRM-Modul. Wende dich an deinen Administrator.
        </p>
        <Button onClick={() => { localStorage.setItem('mtcon.module', 'ops'); navigate('/'); }}>
          Zurück zur Masterliste
        </Button>
      </div>
    </div>
  );
}
