import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getSettings } from '../services/settingsService';
import type { AppSettings } from '../types';

interface SettingsContextValue {
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getSettings()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load settings');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  function refetch() {
    setTick((t) => t + 1);
  }

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refetch }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
