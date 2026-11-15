import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const preferenceKey = 'jazmine.theme';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initializeTheme() {
  document.documentElement.dataset.theme = savedTheme() ?? systemTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Theme | null>(savedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = preference ?? system;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === preferenceKey) setPreference(savedTheme());
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPreference(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(preferenceKey, next);
    } catch {
      // The switch still works for this tab when storage is unavailable.
    }
  }
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeToggle requires ThemeProvider');
  const dark = value.theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={
        dark ? 'ເປີດໂໝດສະຫວ່າງ / Switch to light mode' : 'ເປີດໂໝດມືດ / Switch to dark mode'
      }
      aria-pressed={dark}
      title={dark ? 'Light mode' : 'Dark mode'}
      onClick={value.toggle}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
