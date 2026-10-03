/** Hisobot sahifalarining umumiy qismlari: o'zgarish belgisi, ustunli grafik, Excel tugmasi, jadval. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { downloadFile } from "@/shared/api/client";
import { formatNumber, trimDecimal } from "@/shared/format";
import { useErrorText } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { focusRing } from "@/shared/ui/tones";
import { change } from "./types";

/** O'tgan davrga nisbatan: "+15%" (yashil) yoki "−8%" (qizil). Solishtirib bo'lmasa — hech narsa. */
export function Change({
  current,
  previous,
  onColor = false,
}: {
  current: number;
  previous: number;
  /** To'q rangli kartochka ustida (oq matn) */
  onColor?: boolean;
}) {
  const { t } = useTranslation();
  const percent = change(current, previous);
  if (percent === null) return null;
  const up = percent >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[13px] font-medium ${
        onColor ? "bg-white/20 text-white" : up ? "bg-leaf-soft text-leaf" : "bg-madder-soft text-madder"
      }`}
    >
      {/* "O'tgan davrga nisbatan" — ko'rinmas matn: title (tooltip) klaviatura va sensorli ekranda yo'q edi */}
      <span className="sr-only">{t("reports.vs_previous")}: </span>
      <Icon className="size-3.5" aria-hidden="true" />
      {up ? "+" : "−"}
      {Math.abs(percent)}%
    </span>
  );
}

export type Bar = {
  key: string;
  /** O'q ostidagi qisqa yozuv (bo'sh bo'lsa ko'rsatilmaydi) */
  tick?: string;
  /** Ustun ustiga borilganda ko'rinadigan to'liq yozuv: "2-oktabr — 702 000 so'm" */
  label: string;
  value: number;
  /** Ajratib ko'rsatiladigan ustun (masalan, tanlangan davr) */
  strong?: boolean;
};

/**
 * Ustunli grafik. Ustun ustiga borilsa (yoki bosilsa, yoki klaviatura bilan fokus olsa) — tepada uning qiymati ko'rinadi.
 * Har ustun — nomli tugma (ekran o'quvchi ham, klaviatura ham o'qiydi); ro'yxat ko'rinmas `<ul>` da ham bor.
 * Manfiy qiymat (qaytarish savdodan ko'p bo'lgan kun) — qizil, o'qdan pastga emas, kichik belgi bilan.
 */
export function Bars({
  bars,
  summary,
  axis,
  height = 160,
}: {
  bars: Bar[];
  summary: string;
  /** Ustunlar ko'p bo'lganda o'q yozuvlari: chap, o'rta, o'ng (har ustunga `tick` o'rniga) */
  axis?: string[];
  height?: number;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);
  const peak = Math.max(0, ...bars.map((bar) => Math.abs(bar.value)));
  const top = Math.max(1, peak);
  const shown = bars.find((bar) => bar.key === active);
  // Y o'qidagi qisqa yozuv: 1 250 000 → "1.3 mln", 45 000 → "45 ming"
  const short = (value: number) =>
    value >= 1_000_000
      ? `${trimDecimal((value / 1_000_000).toFixed(1))} ${t("reports.short.million")}`
      : value >= 10_000
        ? `${Math.round(value / 1000)} ${t("reports.short.thousand")}`
        : formatNumber(value);
  return (
    <figure>
      <figcaption className="mb-3 min-h-5 text-sm text-muted">{shown ? shown.label : summary}</figcaption>
      <div className="flex gap-2">
      {/* Y o'qi: eng katta qiymat, yarmi va nol — ustun balandligi nimani anglatishi ko'rinib turadi */}
      {peak > 0 && (
        <div
          aria-hidden="true"
          className="flex shrink-0 flex-col justify-between text-right text-[11px] leading-none tabular-nums text-muted"
          style={{ height }}
        >
          <span>{short(peak)}</span>
          <span>{short(peak / 2)}</span>
          <span>0</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
      <div className="relative" style={{ height }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <span className="border-t border-dashed border-line" />
          <span className="border-t border-dashed border-line" />
          <span className="border-t border-line" />
        </div>
      {/* Ustunlar davr bo'yicha tekis taqsimlanadi: oz bo'lsa ham chapga yig'ilib qolmaydi; eni ko'pi bilan 48px */}
      <div
        role="group"
        aria-label={summary}
        className="relative flex h-full items-end justify-around gap-[3px]"
        onMouseLeave={() => setActive(null)}
      >
        {bars.map((bar, index) => (
          <button
            key={bar.key}
            type="button"
            aria-label={bar.label}
            aria-pressed={bar.key === active}
            onMouseEnter={() => setActive(bar.key)}
            onFocus={() => setActive(bar.key)}
            onClick={() => setActive(bar.key)}
            className={`group flex h-full min-w-0 max-w-12 flex-1 items-end rounded-t-[3px] ${focusRing}`}
          >
            <span
              className={`block w-full origin-bottom animate-grow rounded-t-[3px] transition-colors ${
                bar.value < 0
                  ? "bg-madder"
                  : bar.strong || bar.key === active
                    ? "bg-indigo"
                    : "bg-indigo/70 group-hover:bg-indigo"
              }`}
              style={{
                height: `${Math.max(bar.value === 0 ? 1 : 3, (Math.abs(bar.value) / top) * 100)}%`,
                animationDelay: `${Math.min(index * 10, 200)}ms`,
              }}
            />
          </button>
        ))}
      </div>
      </div>
      {/* Ekran o'quvchi uchun o'qish tartibi: barcha ustunlar qiymati bilan ro'yxat sifatida */}
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.key}>{bar.label}</li>
        ))}
      </ul>
      {axis && (
        <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-muted" aria-hidden="true">
          {axis.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
      )}
      {bars.some((bar) => bar.tick) && (
        <div className="mt-1.5 flex justify-around gap-[3px] text-[12px] text-muted" aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.key} className="min-w-0 max-w-12 flex-1 overflow-visible whitespace-nowrap text-center">
              {bar.tick}
            </span>
          ))}
        </div>
      )}
      </div>
      </div>
    </figure>
  );
}

/** Hisobotni Excel faylida yuklab olish. `path` — so'rov bilan: "/reports/sales/export?date_from=..." */
export function ExportButton({ path }: { path: string }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(path);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-sm text-madder">
          {error}
        </span>
      )}
      <Button variant="secondary" size="sm" loading={busy} onClick={() => void save()}>
        {!busy && <Download className="size-4" aria-hidden="true" />}
        {t("reports.excel")}
      </Button>
    </span>
  );
}

export { Stat } from "@/shared/ui/Stat";

// Jadval — umumiy (`shared/ui/table.tsx`): ro'yxat sahifalari ham shuni ishlatadi
export { Table, Th, td, th } from "@/shared/ui/table";
