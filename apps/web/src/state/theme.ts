import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const key = 'sparko-theme';
const listeners = new Set<() => void>();

/** The theme on <html>, set before first paint by the script in index.html. */
function current(): Theme {
  return document.documentElement.dataset['theme'] === 'light'
    ? 'light'
    : 'dark';
}
export function setTheme(theme: Theme) {
  document.documentElement.dataset['theme'] = theme;
  try {
    localStorage.setItem(key, theme);
  } catch {
    // Private windows can refuse storage; the theme still applies now.
  }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => 'dark' as const);
  const toggle = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme],
  );
  return { theme, toggle };
}
