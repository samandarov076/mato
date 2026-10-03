import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDecimal, formatNumber } from "@/shared/format";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { rowClass } from "@/shared/ui/list";
import { ExportButton } from "./parts";
import { useReportFilters } from "./ReportsLayout";
import { reportQuery, reportsKeys, type Metric, type TopBy, type TopRow } from "./types";

/** Eng ko'p sotilgan tovarlar: SKU, mato, rang yoki gul bo'yicha; metr, savdo yoki foyda bo'yicha saralanadi. */
export function TopReportPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const filters = useReportFilters();
  const sum = t("settings.units.sum");
  const [by, setBy] = useState<TopBy>("sku");
  const [metric, setMetric] = useState<Metric>("amount");
  const [limit, setLimit] = useState<10 | 20>(10);
  const query = reportQuery(filters, { by, metric, limit: String(limit) });

  const report = useQuery({
    queryKey: reportsKeys.report("top", query),
    queryFn: () => api<TopRow[]>(`/reports/top?${query}`),
  });
  const rows = report.data ?? [];
  const value = (row: TopRow) => (metric === "meters" ? Number(row.meters) : row[metric]);
  const top = Math.max(1, ...rows.map(value));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="overflow-x-auto">
          <Segmented<TopBy>
            label={t("reports.group_by")}
            value={by}
            onChange={setBy}
            options={[
              { value: "sku", label: t("catalog.tab_skus") },
              { value: "fabric", label: t("catalog.sku.fabric") },
              { value: "color", label: t("catalog.sku.color") },
              { value: "pattern", label: t("catalog.sku.pattern") },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <Segmented<Metric>
            label={t("reports.measure")}
            value={metric}
            onChange={setMetric}
            options={[
              { value: "amount", label: t("reports.sales") },
              { value: "meters", label: t("sales.entry.meters") },
              { value: "profit", label: t("reports.profit") },
            ]}
          />
        </div>
        <Segmented<10 | 20>
          label={t("reports.top_limit")}
          value={limit}
          onChange={setLimit}
          options={[
            { value: 10, label: "10" },
            { value: 20, label: "20" },
          ]}
        />
        <span className="ml-auto">
          <ExportButton path={`/reports/top/export?${query}`} />
        </span>
      </div>

      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}
      {report.isSuccess && rows.length === 0 && <p className="mt-4 text-muted">{t("reports.empty")}</p>}

      {rows.length > 0 && (
        <ol className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-panel shadow-card">
          {rows.map((row, index) => (
            <li key={row.id} className={`${rowClass} flex items-center gap-3`}>
              <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.label}</p>
                {/* Tanlangan ko'rsatkich bo'yicha ulush: eng ko'pi — to'liq chiziq */}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-indigo"
                    style={{ width: `${Math.max(2, (Math.max(value(row), 0) / top) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-sm tabular-nums text-muted">
                  {formatDecimal(row.meters)} m · {formatNumber(row.amount)} {sum} ·{" "}
                  <span className={row.profit < 0 ? "text-madder" : ""}>
                    {t("reports.profit_value", { amount: formatNumber(row.profit) })}
                  </span>
                </p>
              </div>
              <p className="whitespace-nowrap text-right font-medium tabular-nums">
                {metric === "meters" ? `${formatDecimal(row.meters)} m` : formatNumber(row[metric])}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
