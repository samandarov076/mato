import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDecimal, formatNumber } from "@/shared/format";
import { tileClass } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { statGrid } from "@/shared/ui/Stat";
import { ExportButton, Stat, Table, td, Th } from "./parts";
import { useReportFilters } from "./ReportsLayout";
import { reportQuery, reportsKeys, type DeviationBy, type DeviationReport } from "./types";
import { Banknote, Tag } from "lucide-react";

/** Farq: arzon sotilgan — qizil, qimmat sotilgan — yashil, farq yo'q — xira. */
function Diff({ value, percent }: { value: number; percent: string }) {
  const tone = value < 0 ? "text-madder" : value > 0 ? "text-leaf" : "text-muted";
  return (
    <span className={`whitespace-nowrap ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {formatNumber(Math.abs(value))}
      <span className="text-[13px]">
        {" "}
        ({value > 0 ? "+" : value < 0 ? "−" : ""}
        {percent.replace("-", "")}%)
      </span>
    </span>
  );
}

/** Narx og'ishi: sotuvlar tavsiya narxdan qancha farq qilgan — tovar yoki sotuvchi bo'yicha. */
export function DeviationReportPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const filters = useReportFilters();
  const sum = t("settings.units.sum");
  const [by, setBy] = useState<DeviationBy>("sku");
  const query = reportQuery(filters, { by });

  const report = useQuery({
    queryKey: reportsKeys.report("deviation", query),
    queryFn: () => api<DeviationReport>(`/reports/price-deviation?${query}`),
  });
  const data = report.data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<DeviationBy>
          label={t("reports.group_by")}
          value={by}
          onChange={setBy}
          options={[
            { value: "sku", label: t("reports.by_item") },
            { value: "seller", label: t("reports.by_seller") },
          ]}
        />
        <ExportButton path={`/reports/price-deviation/export?${query}`} />
      </div>
      <p className="mt-3 max-w-2xl text-muted">{t("reports.deviation_intro")}</p>

      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}
      {data && data.rows.length === 0 && <p className="mt-4 text-muted">{t("reports.empty")}</p>}

      {data && data.rows.length > 0 && (
        <>
          <div className={`${statGrid} mt-4 lg:grid-cols-3`}>
            <Stat label={t("reports.expected")} value={data.expected} unit={sum} icon={Tag} accent="plum" />
            <Stat label={t("reports.actual")} value={data.actual} unit={sum} icon={Banknote} accent="leaf" />
            <section className={`${tileClass} col-span-2 lg:col-span-1`}>
              <p className="text-sm text-muted">{t("reports.diff")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                <Diff value={data.diff} percent={data.percent} />
              </p>
            </section>
          </div>
          <div className="mt-4">
            <Table
              head={
                <tr>
                  <Th>{t(by === "seller" ? "sales.list.seller" : "sales.card.col_item")}</Th>
                  <Th className="text-right">{t("sales.entry.meters")}</Th>
                  <Th className="text-right">{t("reports.expected")}</Th>
                  <Th className="text-right">{t("reports.actual")}</Th>
                  <Th className="text-right">{t("reports.diff")}</Th>
                </tr>
              }
            >
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} font-medium`}>{row.label}</td>
                  <td className={`${td} text-right`}>{formatDecimal(row.meters)}</td>
                  <td className={`${td} text-right text-muted`}>{formatNumber(row.expected)}</td>
                  <td className={`${td} text-right`}>{formatNumber(row.actual)}</td>
                  <td className={`${td} text-right`}>
                    <Diff value={row.diff} percent={row.percent} />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
