import { useCallback, useState } from "react";

/** Kunduzgi / tungi rejim. Tanlov qurilmada saqlanadi; tanlanmagan bo'lsa qurilma sozlamasi ishlaydi. */
export type Theme = "light" | "dark";

const STORAGE_KEY = "mato.theme";

function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* xotira yopiq (maxfiy rejim) — tanlov faqat shu sahifa uchun */
    }
    setTheme(next);
  }, []);

  return { theme, toggle };
}
