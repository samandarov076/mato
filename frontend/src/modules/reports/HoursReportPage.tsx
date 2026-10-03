import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatNumber } from "@/shared/format";
import { Card } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { Bars, ExportButton } from "./parts";
import { useReportFilters } from "./ReportsLayout";
import { reportQuery, reportsKeys, type HoursReport } from "./types";

type Measure = "amount" | "count";

const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Qaysi soatda va haftaning qaysi kunida ko'p sotiladi — sotuvlar summasi yoki soni bo'yicha. */
export function HoursReportPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const filters = useReportFilters();
  const sum = t("settings.units.sum");
  const [measure, setMeasure] = useState<Measure>("amount");
  const query = reportQuery(filters);

  const report = useQuery({
    queryKey: reportsKeys.report("hours", query),
    queryFn: () => api<HoursReport>(`/reports/hours?${query}`),
  });
  const data = report.data;
  const text = (row: { count: number; amount: number }) =>
    `${formatNumber(row.amount)} ${sum} · ${t("reports.sales_count", { count: row.count })}`;

  // Soatlar: birinchi sotuvdan oxirgisigacha, oradagi bo'sh soatlar ham ko'rinadi
  const present = new Map(data?.hours.map((row) => [row.hour, row]));
  const first = Math.min(...(data?.hours.map((row) => row.hour) ?? [0]));
  const last = Math.max(...(data?.hours.map((row) => row.hour) ?? [0]));
  const hours = Array.from({ length: last - first + 1 }, (_, index) => {
    const hour = first + index;
    return present.get(hour) ?? { hour, count: 0, amount: 0 };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Measure>
          label={t("reports.measure")}
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "amount", label: t("reports.by_amount") },
            { value: "count", label: t("reports.by_count") },
          ]}
        />
        <ExportButton path={`/reports/hours/export?${query}`} />
      </div>

      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}

      {data &&
        (data.hours.length === 0 ? (
          <p className="mt-4 text-muted">{t("reports.empty")}</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title={t("reports.hours_title")} icon={Clock} tone="coral">
              <Bars
                summary={t("reports.hours_hint")}
                bars={hours.map((row) => ({
                  key: String(row.hour),
                  value: row[measure],
                  tick: String(row.hour),
                  label: `${hourText(row.hour)}–${hourText((row.hour + 1) % 24)} — ${text(row)}`,
                  strong: true,
                }))}
              />
            </Card>
            <Card title={t("reports.weekdays_title")} icon={CalendarDays} tone="coral">
              <Bars
                summary={t("reports.weekdays_hint")}
                bars={data.weekdays.map((row) => ({
                  key: String(row.weekday),
                  value: row[measure],
                  tick: t(`reports.weekdays_short.${row.weekday}`),
                  label: `${t(`reports.weekdays.${row.weekday}`)} — ${text(row)}`,
                  strong: true,
                }))}
              />
            </Card>
          </div>
        ))}
    </div>
  );
}
