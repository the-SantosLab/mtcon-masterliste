import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface PortalCustomer {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  company_name: string | null;
  is_active: boolean;
}

interface PortalAuthContextType {
  session: Session | null;
  user: User | null;
  customer: PortalCustomer | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextType | undefined>(undefined);

export function PortalAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<PortalCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomer = async (userId: string) => {
    const { data } = await supabase
      .from('portal_customers')
      .select('*')
      .eq('auth_user_id', userId)
      .eq('is_active', true)
      .single();
    setCustomer(data as PortalCustomer | null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => { fetchCustomer(session.user.id); }, 0);
        } else {
          setCustomer(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchCustomer(session.user.id).then(() => setLoading(false));
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setCustomer(null);
  };

  return (
    <PortalAuthContext.Provider value={{ session, user, customer, loading, signIn, signOut }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}
