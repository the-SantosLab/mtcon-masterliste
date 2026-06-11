import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { UserAvatar } from '@/components/UserAvatar';
import { TwoFactorSettings } from '@/components/TwoFactorSettings';
import { AttendancePanel } from '@/components/AttendancePanel';

export default function Profile() {
  const { profile, role } = useAuth();
  const [deptName, setDeptName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.department_id) return;
    supabase.from('departments').select('name').eq('id', profile.department_id).single()
      .then(r => setDeptName(r.data?.name || null));
  }, [profile?.department_id]);

  if (!profile) return <AppLayout><div className="p-8 text-xs text-muted-foreground">Laden…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center text-center space-y-4">
          <UserAvatar
            user={profile as any}
            size="xl"
            tooltip={false}
            ringColor="hsl(var(--primary))"
          />
          <div>
            <h1 className="text-xl font-semibold text-foreground">{profile.display_name}</h1>
            <p className="text-xs font-mono text-muted-foreground mt-1">{profile.short_code}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs pt-4 border-t border-border w-full max-w-xs">
            <span className="text-muted-foreground text-left">Rolle</span>
            <span className="text-foreground capitalize text-right">{role || '–'}</span>
            <span className="text-muted-foreground text-left">Abteilung</span>
            <span className="text-foreground text-right">{deptName || '–'}</span>
          </div>
        </div>

        {/* Personio Zeit- & Abwesenheitsdaten – live hinter dem Hero */}
        <AttendancePanel userId={profile.id} />

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Sicherheit</h2>
          <TwoFactorSettings />
        </div>
      </div>
    </AppLayout>
  );
}
