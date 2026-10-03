/** Tayyor davrlar (Toshkent kuni bo'yicha) — hisobotlar va ro'yxat filtrlari bir xil hisoblaydi. */
import { todayISO } from "./format";

export type RangePreset = "today" | "yesterday" | "week" | "month" | "last_month";
/** Ro'yxat filtridagi davr: "" — hammasi, "custom" — ikkita sana qo'lda */
export type ListPreset = "" | "today" | "yesterday" | "week" | "month" | "custom";
export const LIST_PRESETS: ListPreset[] = ["", "today", "yesterday", "week", "month", "custom"];

export type Period = { preset: ListPreset; date_from: string; date_to: string };
export const ALL_TIME: Period = { preset: "", date_from: "", date_to: "" };

const iso = (date: Date) => date.toISOString().slice(0, 10);
const parse = (day: string) => new Date(`${day}T00:00:00Z`);

/** Kunni siljitadi: shift("2026-10-02", -1) → "2026-10-01" */
export function shift(day: string, days: number): string {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

/** Hafta — dushanbadan, oy — 1-kundan bugungacha. */
export function presetRange(preset: RangePreset, today = todayISO()): [string, string] {
  const date = parse(today);
  switch (preset) {
    case "today":
      return [today, today];
    case "yesterday":
      return [shift(today, -1), shift(today, -1)];
    case "week":
      return [shift(today, -((date.getUTCDay() + 6) % 7)), today];
    case "month":
      return [`${today.slice(0, 8)}01`, today];
    case "last_month": {
      const end = shift(`${today.slice(0, 8)}01`, -1);
      return [`${end.slice(0, 8)}01`, end];
    }
  }
}

/** Tanlangan davr: tayyor davr — sanalari bilan; "hammasi" — sanasiz; "custom" — avvalgi sanalar saqlanadi */
export function periodOf(preset: ListPreset, previous: Period = ALL_TIME): Period {
  if (preset === "") return ALL_TIME;
  if (preset === "custom") return { ...previous, preset };
  const [date_from, date_to] = presetRange(preset);
  return { preset, date_from, date_to };
}
