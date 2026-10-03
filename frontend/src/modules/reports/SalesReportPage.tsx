import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDayMonth, formatDecimal, formatMonth, formatNumber } from "@/shared/format";
import { Card } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { statGrid } from "@/shared/ui/Stat";
import { Bars, Change, ExportButton, Stat, Table, td, Th } from "./parts";
import { useReportFilters } from "./ReportsLayout";
import { reportQuery, reportsKeys, revenue, type Group, type Money, type SalesReport } from "./types";
import { ChartColumn, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";

/** Savdo, tushum, foyda — kunlar yoki oylar kesimida; o'tgan shunday davr bilan taqqoslanadi. */
export function SalesReportPage() {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const filters = useReportFilters();
  const sum = t("settings.units.sum");
  const [group, setGroup] = useState<Group>("day");
  const query = reportQuery(filters, { group });

  const report = useQuery({
    queryKey: reportsKeys.report("sales", query),
    queryFn: () => api<SalesReport>(`/reports/sales?${query}`),
  });
  const data = report.data;
  const money = (value: number | null) => (value === null ? "—" : formatNumber(value));
  const periodName = (period: string) =>
    period.length === 7 ? formatMonth(period, i18n.language) : formatDate(period);

  const cells = (row: Money) => (
    <>
      <td className={`${td} text-right font-medium`}>{formatNumber(row.sales)}</td>
      <td className={`${td} text-right ${row.returns > 0 ? "text-saffron" : "text-muted"}`}>
        {formatNumber(row.returns)}
      </td>
      <td className={`${td} text-right`}>{money(row.cash)}</td>
      <td className={`${td} text-right`}>{money(row.card)}</td>
      <td className={`${td} text-right ${row.profit < 0 ? "text-madder" : ""}`}>{formatNumber(row.profit)}</td>
      <td className={`${td} text-right`}>{row.count}</td>
      <td className={`${td} text-right`}>{formatDecimal(row.meters)}</td>
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Group>
          label={t("reports.group_by")}
          value={group}
          onChange={setGroup}
          options={[
            { value: "day", label: t("reports.by_day") },
            { value: "month", label: t("reports.by_month") },
          ]}
        />
        <ExportButton path={`/reports/sales/export?${query}`} />
      </div>

      {/* Yuklanish, xato va ma'lumot — bir xil masofada, sahifa sakramaydi */}
      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}

      {data && (
        <>
          <div className={`${statGrid} mt-4 lg:grid-cols-4`}>
            <Stat label={t("reports.sales")} value={data.total.sales} unit={sum} icon={ShoppingBag} accent="indigo">
              <Change current={data.total.sales} previous={data.previous.sales} />
            </Stat>
            <Stat
              label={t("reports.revenue")}
              value={money(revenue(data.total))}
              unit={data.total.cash === null ? undefined : sum}
              icon={Wallet}
              accent="sky"
            >
              {data.total.cash === null
                ? t("reports.no_revenue")
                : t("reports.cash_card", { cash: formatNumber(data.total.cash), card: money(data.total.card) })}
            </Stat>
            <Stat
              label={t("reports.profit")}
              value={data.total.profit}
              unit={sum}
              icon={TrendingUp}
              accent="leaf"
              tone={data.total.profit < 0 ? "text-madder" : "text-leaf"}
            >
              <Change current={data.total.profit} previous={data.previous.profit} />
            </Stat>
            <Stat label={t("reports.count")} value={data.total.count} icon={Receipt} accent="plum">
              {formatDecimal(data.total.meters)} m
            </Stat>
          </div>
          <p className="mt-2 text-sm text-muted">{t("reports.profit_note")}</p>

          {data.rows.length > 1 && (
            <Card title={t("reports.chart_sales")} icon={ChartColumn} tone="coral" className="mt-4">
              <Bars
                summary={t("reports.chart_sales_hint")}
                bars={data.rows.map((row) => ({
                  key: row.period,
                  value: row.sales,
                  label: `${
                    row.period.length === 7
                      ? formatMonth(row.period, i18n.language)
                      : formatDayMonth(row.period, i18n.language)
                  } — ${formatNumber(row.sales)} ${sum}`,
                  strong: true,
                }))}
              />
            </Card>
          )}

          <div className="mt-4">
            <Table
              head={
                <tr>
                  <Th>{t("reports.period")}</Th>
                  <Th className="text-right">{t("reports.sales")}</Th>
                  <Th className="text-right">{t("reports.returns")}</Th>
                  <Th className="text-right">{t("sales.payment.cash")}</Th>
                  <Th className="text-right">{t("sales.payment.card")}</Th>
                  <Th className="text-right">{t("reports.profit")}</Th>
                  <Th className="text-right">{t("reports.count_short")}</Th>
                  <Th className="text-right">{t("sales.entry.meters")}</Th>
                </tr>
              }
            >
              {/* Eng yangi davr tepada; harakatsiz kunlar ko'rsatilmaydi */}
              {[...data.rows]
                .reverse()
                .filter((row) => row.count > 0 || row.returns > 0 || row.cash || row.card)
                .map((row) => (
                  <tr key={row.period}>
                    <td className={`${td} whitespace-nowrap`}>{periodName(row.period)}</td>
                    {cells(row)}
                  </tr>
                ))}
              <tr className="bg-page/60 font-medium">
                <td className={td}>{t("reports.total")}</td>
                {cells(data.total)}
              </tr>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
