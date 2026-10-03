import type { Tone } from "./tones";

/**
 * Bo'lim ichidagi tablar. Telefonda — o'raladigan "tabletka"lar (hech biri ekrandan chiqib ketmaydi);
 * keng ekranda — tagiga chizilgan odatiy tablar.
 */
export const tabsNav = "mt-4 flex flex-wrap gap-1.5 sm:gap-1 sm:border-b sm:border-line";

const base =
  "pressable inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm sm:-mb-px sm:min-h-0 sm:rounded-none sm:border-0 sm:border-b-2 sm:bg-transparent sm:px-3 sm:py-2.5 sm:text-base";

const idle = "border-line bg-panel text-muted hover:text-ink sm:border-transparent";

// Klass nomlari to'liq yozilgan — Tailwind ularni matndan topadi
const ACTIVE: Record<Tone, string> = {
  indigo: "border-transparent bg-indigo font-medium text-panel sm:border-indigo sm:text-indigo",
  leaf: "border-transparent bg-leaf font-medium text-panel sm:border-leaf sm:text-leaf",
  saffron: "border-transparent bg-saffron font-medium text-panel sm:border-saffron sm:text-saffron",
  madder: "border-transparent bg-madder font-medium text-panel sm:border-madder sm:text-madder",
  sky: "border-transparent bg-sky font-medium text-panel sm:border-sky sm:text-sky",
  plum: "border-transparent bg-plum font-medium text-panel sm:border-plum sm:text-plum",
  coral: "border-transparent bg-coral font-medium text-panel sm:border-coral sm:text-coral",
  rose: "border-transparent bg-rose font-medium text-panel sm:border-rose sm:text-rose",
  neutral: "border-transparent bg-muted font-medium text-panel sm:border-ink sm:text-ink",
};

export function tabClass(active: boolean, tone: Tone = "indigo") {
  return `${base} ${active ? ACTIVE[tone] : idle}`;
}
