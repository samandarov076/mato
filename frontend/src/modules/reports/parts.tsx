/** Hisobot sahifalarining umumiy qismlari: o'zgarish belgisi, ustunli grafik, Excel tugmasi, jadval. */
import { useEffect, useRef, useState, type ReactNode, type ThHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { downloadFile } from "@/shared/api/client";
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
  const [active, setActive] = useState<string | null>(null);
  const top = Math.max(1, ...bars.map((bar) => Math.abs(bar.value)));
  const shown = bars.find((bar) => bar.key === active);
  return (
    <figure>
      <figcaption className="mb-3 min-h-5 text-sm text-muted">{shown ? shown.label : summary}</figcaption>
      <div
        role="group"
        aria-label={summary}
        className="flex items-end gap-[3px]"
        style={{ height }}
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
        <div className="mt-1.5 flex gap-[3px] text-[12px] text-muted" aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.key} className="min-w-0 max-w-12 flex-1 overflow-visible whitespace-nowrap text-center">
              {bar.tick}
            </span>
          ))}
        </div>
      )}
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

/** Jadval qobig'i: tor ekranda yon tomonga suriladi */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  // Telefonda sarlavha qatori yashiriladi — har katakka o'z ustun nomi yozib qo'yiladi (index.css: .rtable)
  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const labels = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent ?? "");
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, index) => cell.setAttribute("data-label", labels[index] ?? ""));
    }
    // Telefonda CSS jadvalni kartochkaga aylantiradi (display o'zgaradi) — ARIA rollari jadval ma'nosini saqlab qoladi
    table.setAttribute("role", "table");
    table.querySelectorAll("thead, tbody").forEach((group) => group.setAttribute("role", "rowgroup"));
    table.querySelectorAll("tr").forEach((row) => row.setAttribute("role", "row"));
    table.querySelectorAll("th").forEach((cell) => {
      cell.setAttribute("role", "columnheader");
      if (!cell.hasAttribute("scope")) cell.setAttribute("scope", "col");
    });
    table.querySelectorAll("td").forEach((cell) => cell.setAttribute("role", "cell"));
  });
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-panel shadow-card">
      <table ref={ref} className="rtable w-full text-left tabular-nums md:min-w-[640px]">
        <thead className="border-b border-line bg-page/60 text-[13px] text-muted">{head}</thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const th = "px-2.5 py-2.5 font-medium first:pl-5 last:pr-5 lg:px-4";
export const td = "px-2.5 py-3 first:pl-5 last:pr-5 lg:px-4";

/** Ustun sarlavhasi: `scope="col"` — ekran o'quvchi har katakka ustun nomini qo'shib o'qiydi */
export function Th({ className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={`${th} ${className}`} {...rest} />;
}
