import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDecimal, formatNumber } from "@/shared/format";
import { Alert, Loading } from "@/shared/ui/feedback";
import { statGrid } from "@/shared/ui/Stat";
import { ExportButton, Stat, Table, td, Th } from "./parts";
import { reportsKeys, type StockReport } from "./types";
import { Banknote, Ruler } from "lucide-react";

/** Qoldiq qiymati: har joyda qancha metr, taxminan necha rulon va tannarx bo'yicha qancha pul turibdi. */
export function StockReportPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const sum = t("settings.units.sum");

  const report = useQuery({
    queryKey: reportsKeys.report("stock", ""),
    queryFn: () => api<StockReport>("/reports/stock"),
  });
  const data = report.data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-muted">{t("reports.stock_intro")}</p>
        <ExportButton path="/reports/stock/export" />
      </div>

      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}

      {data && (
        <>
          <div className={`${statGrid} mt-4 max-w-2xl`}>
            <Stat label={t("reports.stock_value")} value={data.value} unit={sum} icon={Banknote} accent="leaf" />
            <Stat label={t("receiving.total_m")} value={`${formatDecimal(data.meters)} m`} icon={Ruler} accent="sky" />
          </div>
          <div className="mt-4">
            <Table
              head={
                <tr>
                  <Th>{t("inventory.location")}</Th>
                  <Th className="text-right">{t("sales.entry.meters")}</Th>
                  <Th className="text-right">{t("reports.rolls")}</Th>
                  <Th className="text-right">{t("reports.stock_value")}</Th>
                  <Th className="text-right">{t("catalog.tab_skus")}</Th>
                  <Th className="text-right">{t("inventory.stock.only_low")}</Th>
                </tr>
              }
            >
              {data.places.map((place) => (
                <tr key={place.location_id}>
                  <td className={td}>
                    <Link to={`/stock?location_id=${place.location_id}`} className="font-medium text-indigo hover:underline">
                      {place.name}
                    </Link>
                    <span className="block text-[13px] text-muted">{t(`reports.place.${place.type}`)}</span>
                  </td>
                  <td className={`${td} text-right`}>{formatDecimal(place.meters)}</td>
                  <td className={`${td} text-right text-muted`}>≈ {place.rolls}</td>
                  <td className={`${td} text-right font-medium`}>{formatNumber(place.value)}</td>
                  <td className={`${td} text-right`}>{place.skus}</td>
                  <td className={`${td} text-right`}>
                    {place.low > 0 ? (
                      <Link
                        to={`/stock?location_id=${place.location_id}&only=low`}
                        className="font-medium text-saffron hover:underline"
                      >
                        {place.low}
                      </Link>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-page/60 font-medium">
                <td className={td}>{t("reports.total")}</td>
                <td className={`${td} text-right`}>{formatDecimal(data.meters)}</td>
                <td className={td} />
                <td className={`${td} text-right`}>{formatNumber(data.value)}</td>
                <td className={td} />
                <td className={td} />
              </tr>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
