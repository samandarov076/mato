import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { feedback } from "@/shared/feedback";
import { formatNumber } from "@/shared/format";
import { focusRing } from "@/shared/ui/tones";
import type { Aging } from "./types";

export const AGING_KEYS = [
  "total",
  "not_due",
  "d1_30",
  "d31_60",
  "d60_plus",
] as const;
export type AgingKey = (typeof AGING_KEYS)[number];
const BUCKETS = ["not_due", "d1_30", "d31_60", "d60_plus"] as const;

/** Mijozlar ro'yxatidagi `only` filtri: "Jami" — barcha qarzdorlar, qolgani — o'z oralig'i */
export const agingFilter = (key: AgingKey) =>
  key === "total" ? "debtors" : key;

// Chiziq va belgi rangi — kechikish ortgani sari "issiqroq": yashil → sariq → to'q sariq → qizil
const FILL: Record<(typeof BUCKETS)[number], string> = {
  not_due: "bg-leaf",
  d1_30: "bg-saffron",
  d31_60: "bg-coral",
  d60_plus: "bg-madder",
};

/**
 * Nasiya muddat taqsimoti — beshta kartochka: jami qarz (ostida ulushlar chizig'i) va to'rt oraliq (summa, ulush chizig'i va foizi).
 * Kun — qarz muddatidan (`due_date`) necha kun o'tgani. 60+ kunlik qarz qizil rangda (eng xavflisi).
 * Har ko'rsatkich bosiladi: `onSelect` berilsa — ro'yxat shu oraliq bo'yicha filtrlanadi (yana bosilsa olinadi),
 * berilmasa — Nasiya sahifasi shu filtr bilan ochiladi.
 * `compact` — bosh sahifadagi kartada: faqat muddati o'tgan oraliqlar, bir qator matn.
 */
export function AgingRow({
  aging,
  compact = false,
  selected,
  onSelect,
}: {
  aging: Aging;
  compact?: boolean;
  selected?: AgingKey | null;
  onSelect?: (key: AgingKey | null) => void;
}) {
  const { t } = useTranslation();
  const sum = t("settings.units.sum");
  if (compact) {
    return (
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] tabular-nums">
        {(["d1_30", "d31_60", "d60_plus"] as const).map((key) => (
          <span
            key={key}
            className={
              key === "d60_plus" && aging[key] > 0
                ? "font-medium text-madder"
                : "text-muted"
            }
          >
            {t(`credit.aging.${key}`)}: {formatNumber(aging[key])}
          </span>
        ))}
      </span>
    );
  }

  const share = (key: (typeof BUCKETS)[number]) =>
    aging.total > 0 ? (aging[key] / aging.total) * 100 : 0;
  // Bitta oraliq tanlanganda qolgan kartochkalar xiralashadi
  const dimmed = (key: AgingKey) =>
    !!selected && selected !== "total" && selected !== key;

  /** Bosiladigan kartochka: filtr tugmasi yoki (hisobotda) Nasiya sahifasiga havola */
  function card(key: AgingKey, children: ReactNode) {
    const active = selected === key;
    const classes = `lift pressable block w-full rounded-card border bg-panel p-4 text-left shadow-card transition-[transform,border-color,opacity] duration-base hover:-translate-y-1 sm:p-5 first:col-span-2 sm:first:col-span-1 ${focusRing} ${
      active
        ? "border-indigo ring-1 ring-indigo"
        : "border-line hover:border-edge"
    } ${dimmed(key) ? "opacity-60" : ""}`;
    if (!onSelect) {
      return (
        <Link
          key={key}
          to={`/customers?only=${agingFilter(key)}`}
          className={classes}
        >
          {children}
        </Link>
      );
    }
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={(event) => {
          feedback("tick", event);
          onSelect(active ? null : key);
        }}
        className={classes}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("credit.aging.title")}
      className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
    >
      {/* Jami: katta son, ostida — oraliqlar ulushi bitta chiziqda */}
      {card(
        "total",
        <>
          <span className="block text-sm text-muted">
            {t("credit.aging.total")}
          </span>
          <span className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-2xl font-semibold leading-tight tabular-nums">
            <span className="whitespace-nowrap">{formatNumber(aging.total)}</span>{" "}
            <span className="text-sm font-normal text-muted">{sum}</span>
          </span>
          <span
            aria-hidden="true"
            className="mt-3.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-line"
          >
            {BUCKETS.map(
              (key) =>
                aging[key] > 0 && (
                  <span
                    key={key}
                    style={{ width: `${share(key)}%` }}
                    className={`min-w-1 ${FILL[key]}`}
                  />
                ),
            )}
          </span>
        </>,
      )}
      {BUCKETS.map((key) =>
        card(
          key,
          <>
            <span className="flex items-center gap-2 whitespace-nowrap text-sm text-muted">
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${FILL[key]}`} />
              {t(`credit.aging.${key}`)}
            </span>
            <span
              className={`mt-2 flex flex-wrap items-baseline gap-x-1.5 text-2xl font-semibold leading-tight tabular-nums ${
                aging[key] === 0
                  ? "text-muted"
                  : key === "d60_plus"
                    ? "text-madder"
                    : ""
              }`}
            >
              <span className="whitespace-nowrap">{formatNumber(aging[key])}</span>{" "}
              <span className="text-sm font-normal text-muted">{sum}</span>
            </span>
            {/* Ulush chizig'i va foizi — jami qarzning qanchasi shu oraliqda */}
            <span className="mt-3.5 flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
              >
                <span
                  style={{ width: `${share(key)}%` }}
                  className={`block h-full rounded-full ${FILL[key]}`}
                />
              </span>
              <span className="w-9 text-right text-[13px] tabular-nums text-muted">
                {Math.round(share(key))}%
              </span>
            </span>
          </>,
        ),
      )}
    </div>
  );
}
