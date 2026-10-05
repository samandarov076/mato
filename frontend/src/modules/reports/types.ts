/** Hisobotlar API'sining shakllari (/api/reports) va davr yordamchilari. Pul — butun so'm; metr — matn. */
import { presetRange, shift } from "@/shared/period";
import type { Aging } from "@/modules/credit/types";

/** Davr ko'rsatkichlari. Savdo = sotuvlar − qaytarishlar; foyda = savdo − tannarx. */
export type Money = {
  sales: number;
  returns: number;
  profit: number;
  /** Tushum (naqd / karta); mato bo'yicha filtrlanganda hisoblanmaydi */
  cash: number | null;
  card: number | null;
  count: number;
  meters: string;
};

export type SalesRow = Money & { period: string };
export type Group = "day" | "month";
export type SalesReport = { group: Group; rows: SalesRow[]; total: Money; previous: Money };

export type DashboardPeriod = "day" | "week" | "month";
export type Dashboard = {
  date_from: string;
  date_to: string;
  current: Money;
  previous: Money;
  debt_total: number;
  debt_overdue: number;
  debt_aging?: Aging;
  low_stock: number;
  diff_amount: number;
  diff_m: string;
  chart: { day: string; sales: number }[];
};

export type HoursReport = {
  hours: { hour: number; count: number; amount: number }[];
  /** 1 — dushanba ... 7 — yakshanba */
  weekdays: { weekday: number; count: number; amount: number }[];
};

export type TopBy = "sku" | "fabric" | "color" | "pattern";
export type Metric = "meters" | "amount" | "profit";
export type TopRow = { id: number; label: string; meters: string; amount: number; profit: number };

export type StockPlace = {
  location_id: number;
  name: string;
  type: "store" | "warehouse";
  meters: string;
  rolls: number;
  value: number;
  skus: number;
  low: number;
};
export type StockReport = { places: StockPlace[]; meters: string; value: number };

export type CreditReport = {
  debt_total: number;
  debt_overdue: number;
  aging?: Aging;
  debtors: number;
  given: number;
  paid: number;
  returned: number;
  written_off: number;
};

export type DeviationBy = "sku" | "seller";
export type DeviationRow = {
  id: number;
  label: string;
  meters: string;
  expected: number;
  actual: number;
  diff: number;
  percent: string;
};
export type DeviationReport = {
  rows: DeviationRow[];
  expected: number;
  actual: number;
  diff: number;
  percent: string;
};

export const reportsKeys = {
  all: ["reports"] as const,
  dashboard: (period: string, store: string) => ["reports", "dashboard", period, store] as const,
  report: (name: string, query: string) => ["reports", name, query] as const,
};

// ---------- Davr ----------

export type Preset = "today" | "yesterday" | "week" | "month" | "last_month" | "custom";
export const PRESETS: Preset[] = ["today", "yesterday", "week", "month", "last_month", "custom"];

export type Filters = {
  preset: Preset;
  date_from: string;
  date_to: string;
  store_id: string;
  seller_id: string;
  fabric_id: string;
};

// Davr hisobi — umumiy (`shared/period.ts`): ro'yxat filtrlari ham shuni ishlatadi
export { presetRange, shift };

export function defaultFilters(): Filters {
  const [date_from, date_to] = presetRange("month");
  return { preset: "month", date_from, date_to, store_id: "", seller_id: "", fabric_id: "" };
}

/** So'rov satri: davr va tanlangan filtrlar (+ sahifaning o'z parametrlari). */
export function reportQuery(filters: Filters, extra: Record<string, string> = {}): string {
  const params: Record<string, string> = { date_from: filters.date_from, date_to: filters.date_to };
  for (const key of ["store_id", "seller_id", "fabric_id"] as const) {
    if (filters[key]) params[key] = filters[key];
  }
  return new URLSearchParams({ ...params, ...extra }).toString();
}

/** O'tgan davrga nisbatan o'zgarish, %: 115 va 100 → 15. Solishtirib bo'lmasa (o'tgan davr 0) — null. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/** Tushum: naqd + karta (mato bo'yicha filtrlanganda — null). */
export const revenue = (money: Money) =>
  money.cash === null || money.card === null ? null : money.cash + money.card;
