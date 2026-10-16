import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "encore-theme";

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const setTheme = (t: Theme) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  };
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
