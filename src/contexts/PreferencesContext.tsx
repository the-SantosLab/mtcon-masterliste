import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Preferences {
  theme: 'dark' | 'light';
  compactTables: boolean;
}

interface PreferencesContextType {
  preferences: Preferences;
  setTheme: (theme: 'dark' | 'light') => void;
  setCompactTables: (compact: boolean) => void;
  loading: boolean;
}

const DEFAULT: Preferences = { theme: 'dark', compactTables: true };

const PreferencesContext = createContext<PreferencesContextType>({
  preferences: DEFAULT,
  setTheme: () => {},
  setCompactTables: () => {},
  loading: true,
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT);
  const [loading, setLoading] = useState(true);

  // Apply theme to document root
  const applyTheme = (theme: 'dark' | 'light') => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  };

  // Load preferences from DB
  useEffect(() => {
    if (!user) {
      applyTheme(DEFAULT.theme);
      setPreferences(DEFAULT);
      setLoading(false);
      return;
    }
    supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const prefs: Preferences = {
          theme: (data?.theme as 'dark' | 'light') ?? DEFAULT.theme,
          compactTables: data?.compact_tables ?? DEFAULT.compactTables,
        };
        setPreferences(prefs);
        applyTheme(prefs.theme);
        setLoading(false);
      });
  }, [user]);

  const persistPrefs = useCallback(async (next: Preferences) => {
    if (!user) return;
    await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, theme: next.theme, compact_tables: next.compactTables });
  }, [user]);

  const setTheme = (theme: 'dark' | 'light') => {
    const next = { ...preferences, theme };
    setPreferences(next);
    applyTheme(theme);
    persistPrefs(next);
  };

  const setCompactTables = (compactTables: boolean) => {
    const next = { ...preferences, compactTables };
    setPreferences(next);
    persistPrefs(next);
  };

  return (
    <PreferencesContext.Provider value={{ preferences, setTheme, setCompactTables, loading }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
