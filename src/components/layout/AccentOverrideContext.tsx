import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PageAccent } from './pageAccents';

// Lets a page temporarily repaint the title bar in another accent (e.g. Dashboard
// search mode → Student Messages cyan). The Header falls back to the route accent when null.
interface AccentOverride {
  override: PageAccent | null;
  setOverride: (accent: PageAccent | null) => void;
}

const AccentOverrideContext = createContext<AccentOverride>({ override: null, setOverride: () => {} });

export function AccentOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<PageAccent | null>(null);
  return (
    <AccentOverrideContext.Provider value={{ override, setOverride }}>
      {children}
    </AccentOverrideContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccentOverride() {
  return useContext(AccentOverrideContext);
}
