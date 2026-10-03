import { useSyncExternalStore } from "react";

/**
 * Ekran kengligi `minWidth` dan kam emasmi. Ko'p ustunli ro'yxatlar planshet va kompyuterda (≥768px) jadval,
 * telefonda kartochka bo'ladi — ikkalasi birga chizilmaydi (DOM'da bitta ko'rinish).
 * `matchMedia` yo'q muhitda (testlar, juda eski brauzer) — tor ekran deb olinadi.
 */
export function useWide(minWidth = 768): boolean {
  const query = `(min-width: ${minWidth}px)`;
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia?.(query);
      media?.addEventListener?.("change", notify);
      return () => media?.removeEventListener?.("change", notify);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
