import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, Enums } from '@/integrations/supabase/types';

type UserProfile = Tables<'users_profile'>;
type AppRole = Enums<'app_role'>;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string, shortCode: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isStaff: boolean;
  isViewer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const PROTECTED_ADMIN_ID = '6da81b97-5ab7-4601-9130-8ebbb4a70e3e';

  const fetchProfileAndRole = async (userId: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from('users_profile').select('id, active, created_at, department_id, display_name, is_admin, is_manager, manager_id, short_code, updated_at, avatar_url').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId).limit(1).single(),
    ]);

    let profileData: any = profileRes.data ?? null;
    let roleData: AppRole | null = roleRes.data?.role ?? null;

    // Self-heal: protected main admin must always have admin role.
    // Note: is_admin flag in users_profile is no longer used by check_is_admin();
    // user_roles is the source of truth, and only admins can write to it.
    if (userId === PROTECTED_ADMIN_ID && roleData !== 'admin') {
      const { error: roleErr } = await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id,role' });
      if (!roleErr) roleData = 'admin';
    }

    if (profileData) setProfile(profileData);
    setRole(roleData);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => { fetchProfileAndRole(session.user.id); }, 0);
        } else {
          setProfile(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndRole(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName: string, shortCode: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: displayName, short_code: shortCode },
      },
    });
    return { error: error as Error | null };
  };

  const signOutFn = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfileAndRole(user.id);
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, role, loading,
      signIn, signUp, signOut: signOutFn, refreshProfile,
      isAdmin: role === 'admin',
      isStaff: role === 'staff',
      isViewer: role === 'viewer',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
