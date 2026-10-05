import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, Eraser, HandCoins, Undo2, Users, Wallet } from "lucide-react";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Card } from "@/shared/ui/Card";
import { Alert, Loading } from "@/shared/ui/feedback";
import { statGrid } from "@/shared/ui/Stat";
import { focusRing } from "@/shared/ui/tones";
import { ExportButton, Stat } from "./parts";
import { useReportFilters } from "./ReportsLayout";
import { reportQuery, reportsKeys, type CreditReport } from "./types";
import { AgingRow } from "@/modules/credit/AgingRow";

/** Nasiya: hozirgi qarz va tanlangan davrdagi harakat. Mijozlar kesimi — "Nasiya" bo'limida. */
export function CreditReportPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const filters = useReportFilters();
  const sum = t("settings.units.sum");
  const query = reportQuery({ ...filters, seller_id: "", fabric_id: "" });

  const report = useQuery({
    queryKey: reportsKeys.report("credit", query),
    queryFn: () => api<CreditReport>(`/reports/credit?${query}`),
  });
  const data = report.data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/customers"
          className={`inline-flex min-h-9 items-center gap-1.5 rounded font-medium text-indigo hover:underline ${focusRing}`}
        >
          {t("reports.credit_customers")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <ExportButton path="/reports/credit/export" />
      </div>

      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}

      {data && (
        <>
          {/* Ikki guruh — har biri sarlavhali kartochkada (yalang'och 13px yozuv emas) */}
          <Card title={t("reports.credit_now")} icon={HandCoins} tone="saffron" className="mt-4">
            {data.aging && (
              <div className="mb-4">
                <AgingRow aging={data.aging} />
              </div>
            )}
            <div className={`${statGrid} lg:grid-cols-3`}>
              <Stat label={t("credit.total_debt")} value={data.debt_total} unit={sum} icon={HandCoins} accent="saffron" />
              <Stat
                label={t("credit.overdue")}
                value={data.debt_overdue}
                unit={sum}
                icon={CalendarClock}
                accent="madder"
                tone={data.debt_overdue > 0 ? "text-madder" : ""}
              />
              <Stat label={t("credit.only_debtors")} value={data.debtors} icon={Users} accent="indigo" />
            </div>
          </Card>

          <Card title={t("reports.credit_period")} icon={CalendarClock} tone="coral" className="mt-4">
            <div className={`${statGrid} lg:grid-cols-4`}>
              <Stat label={t("reports.credit_given")} value={data.given} unit={sum} icon={HandCoins} accent="saffron" />
              <Stat
                label={t("reports.credit_paid")}
                value={data.paid}
                unit={sum}
                icon={Wallet}
                accent="leaf"
                tone="text-leaf"
              />
              <Stat label={t("reports.credit_returned")} value={data.returned} unit={sum} icon={Undo2} accent="sky" />
              <Stat
                label={t("reports.credit_written_off")}
                value={data.written_off}
                unit={sum}
                icon={Eraser}
                accent="madder"
                tone={data.written_off > 0 ? "text-madder" : ""}
              />
            </div>
            <p className="mt-4 max-w-2xl text-sm text-muted">{t("reports.credit_note")}</p>
          </Card>
        </>
      )}
    </div>
  );
}
