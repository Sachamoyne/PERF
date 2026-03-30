import { useEffect, useState } from "react";

export type PerfTheme = "dark" | "light";

const THEME_KEY = "perf_theme";
const THEME_EVENT = "perf_theme_changed";

function applyThemeClass(theme: PerfTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
}

function readStoredTheme(): PerfTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "light" ? "light" : "dark";
}

export function setPerfTheme(theme: PerfTheme) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_KEY, theme);
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  }
  applyThemeClass(theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<PerfTheme>(() => readStoredTheme());

  useEffect(() => {
    applyThemeClass(readStoredTheme());

    const onThemeChanged = (event: Event) => {
      const custom = event as CustomEvent<PerfTheme>;
      const nextTheme = custom.detail ?? readStoredTheme();
      setThemeState(nextTheme);
      applyThemeClass(nextTheme);
    };

    window.addEventListener(THEME_EVENT, onThemeChanged);
    return () => window.removeEventListener(THEME_EVENT, onThemeChanged);
  }, []);

  const setTheme = (nextTheme: PerfTheme) => {
    setThemeState(nextTheme);
    setPerfTheme(nextTheme);
  };

  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
