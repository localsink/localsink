import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

// No default value: the useTheme guard below is only meaningful if a consumer
// outside the provider actually reads undefined.
const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Validate via control flow instead of `as Theme` (no-unsafe-type-assertion).
    const stored = localStorage.getItem(storageKey);
    return stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      root.classList.remove('light', 'dark');
      root.classList.add(
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme,
      );
    };
    apply();

    // In system mode, track OS theme flips live (no reload needed).
    if (theme !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [theme]);

  const value = {
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setTheme(next);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
