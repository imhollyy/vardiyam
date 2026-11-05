import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { useAppDatabase } from '@/src/data/AppDatabaseProvider';
import { getThemePreference, saveThemePreference, type ThemePreference } from '@/src/data/appPreferencesRepository';
import { colors } from './tokens';

type AppThemeContextValue = {
  mode: ThemePreference;
  ready: boolean;
  theme: (typeof colors)['light'] | (typeof colors)['dark'];
  setMode: (mode: ThemePreference) => Promise<void>;
  toggleMode: () => Promise<void>;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const database = useAppDatabase();
  const [mode, setModeState] = useState<ThemePreference>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void getThemePreference(database).then((preference) => {
      if (active) setModeState(preference);
    }).catch(() => {
      if (active) setModeState('light');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [database]);

  const setMode = useCallback(async (next: ThemePreference) => {
    await saveThemePreference(database, next);
    setModeState(next);
  }, [database]);
  const toggleMode = useCallback(() => setMode(mode === 'light' ? 'dark' : 'light'), [mode, setMode]);
  const value = useMemo(() => ({ mode, ready, theme: colors[mode], setMode, toggleMode }), [mode, ready, setMode, toggleMode]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside AppThemeProvider.');
  return value;
}
