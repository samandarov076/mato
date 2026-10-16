/**
 * Xabarlar serverda matn emas, hodisa kodi + ma'lumot sifatida saqlanadi. Bu yerda har hodisa uchun
 * foydalanuvchi tilidagi matn va bosilganda ochiladigan sahifa yasaladi.
 */
import type { TFunction } from "i18next";
import {
  ArrowLeftRight,
  Bell,
  CalendarClock,
  Clock,
  HandCoins,
  PackageMinus,
  Ruler,
  Send,
  TriangleAlert,
  Undo2,
  type LucideIcon, PackageCheck } from "lucide-react";
import type { Tone } from "@/shared/ui/tones";
import { formatDate, formatDecimal, formatNumber } from "@/shared/format";

export type Notification = {
  id: number;
  event_code: string;
  data: Record<string, unknown>;
  created_at: string;
  read: boolean;
};

export type NotificationPage = { items: Notification[]; next_cursor: number | null; unread: number };

/** Filtrda ko'rinadigan hodisa turlari */
export const EVENTS = [
  "transfer.arrived",
  "transfer.diff",
  "transfer.waiting",
  "batch.big_diff",
  "batch.empty_open",
  "stock.low",
  "sale.returned",
  "sale.negative_stock",
  "debt.written_off",
  "debt.overdue",
  "telegram.disconnected",
  "pin.store_locked",
] as const;

export const notificationKeys = {
  all: ["notifications"] as const,
  count: ["notifications", "count"] as const,
  list: (event: string) => ["notifications", "list", event] as const,
};

/** Hodisa turining belgisi va rangi — ro'yxatda bir qarashda ajratish uchun (qizil — yo'qotish, sariq — e'tibor) */
const STYLES: Record<string, { icon: LucideIcon; tone: Tone }> = {
  "transfer.arrived": { icon: ArrowLeftRight, tone: "sky" },
  "transfer.diff": { icon: ArrowLeftRight, tone: "madder" },
  "transfer.waiting": { icon: Clock, tone: "saffron" },
  "batch.big_diff": { icon: Ruler, tone: "madder" },
  "batch.empty_open": { icon: PackageCheck, tone: "plum" },
  "stock.low": { icon: PackageMinus, tone: "coral" },
  "sale.returned": { icon: Undo2, tone: "saffron" },
  "sale.negative_stock": { icon: TriangleAlert, tone: "madder" },
  "debt.written_off": { icon: HandCoins, tone: "madder" },
  "debt.overdue": { icon: CalendarClock, tone: "saffron" },
  "telegram.disconnected": { icon: Send, tone: "neutral" },
  "pin.store_locked": { icon: TriangleAlert, tone: "madder" },
};

export const eventStyle = (eventCode: string) => STYLES[eventCode] ?? { icon: Bell, tone: "indigo" as Tone };

const meters = (value: unknown) => formatDecimal(String(Math.abs(Number(value))));

/** Xabar matni va havolasi. Notanish hodisa (yangi versiyadan kelgan) — kodi ko'rsatiladi, havolasiz. */
export function describe(item: Notification, t: TFunction): { text: string; link: string | null } {
  const d = item.data;
  switch (item.event_code) {
    case "transfer.arrived":
      return {
        text: t("notifications.text.transfer.arrived", { ...d, meters: meters(d.meters) }),
        link: `/transfers/${d.transfer_id}`,
      };
    case "transfer.diff":
      return {
        text: t(
          Number(d.diff) > 0 ? "notifications.text.transfer.diff_short" : "notifications.text.transfer.diff_over",
          { ...d, meters: meters(d.diff) },
        ),
        link: `/transfers/${d.transfer_id}`,
      };
    case "transfer.waiting":
      return { text: t("notifications.text.transfer.waiting", d), link: `/transfers/${d.transfer_id}` };
    case "batch.empty_open":
      // "Partiyani yopish" sahifasi: tugagan partiyalar tepada, bir bosishda yopiladi
      return { text: t("notifications.text.batch.empty_open", d), link: "/close" };
    case "batch.big_diff":
      return {
        text: t(
          Number(d.diff) > 0 ? "notifications.text.batch.short" : "notifications.text.batch.over",
          { ...d, meters: meters(d.diff) },
        ),
        link: `/batches/${d.batch_id}`,
      };
    case "stock.low":
      return {
        text: t("notifications.text.stock.low", {
          ...d,
          qty: formatDecimal(String(d.qty)),
          threshold: formatDecimal(String(d.threshold)),
        }),
        link: `/stock?location_id=${d.location_id}&only=low`,
      };
    case "sale.returned":
      return {
        text: t("notifications.text.sale.returned", { ...d, amount: formatNumber(Number(d.amount)) }),
        link: `/sales/${d.sale_id}`,
      };
    case "sale.negative_stock":
      return { text: t("notifications.text.sale.negative_stock", d), link: `/sales/${d.sale_id}` };
    case "debt.written_off":
      return {
        text: t("notifications.text.debt.written_off", { ...d, amount: formatNumber(Number(d.amount)) }),
        link: `/customers/${d.customer_id}`,
      };
    case "debt.overdue":
      return {
        text: t("notifications.text.debt.overdue", {
          ...d,
          amount: formatNumber(Number(d.amount)),
          date: formatDate(String(d.due_date)),
        }),
        link: `/customers/${d.customer_id}`,
      };
    case "telegram.disconnected":
      return { text: t("notifications.text.telegram.disconnected"), link: "/profile" };
    case "pin.store_locked":
      return { text: t("notifications.text.pin.store_locked", d), link: "/structure/staff" };
    default:
      return { text: item.event_code, link: null };
  }
}
