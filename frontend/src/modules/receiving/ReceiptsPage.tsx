import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronRight, PackagePlus, Plus, X } from "lucide-react";
import { InventoryHeader } from "@/modules/inventory/InventoryHeader";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDecimal, formatNumber } from "@/shared/format";
import { ButtonLink } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ALL_TIME, type Period } from "@/shared/period";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField } from "@/shared/ui/fields";
import { FilterPanel } from "@/shared/ui/FilterPanel";
import { Hint } from "@/shared/ui/Hint";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { Chip, Empty, IconChip, LoadMore, RowAction, rowClass, sectionStrip } from "@/shared/ui/list";
import { receivingKeys, type ReceiptOptions, type ReceiptPage, type ReceiptRow } from "./types";

const PAGE_SIZE = 50;

type Filters = { warehouse_id: string; created_by: string };

const NO_FILTERS: Filters = { warehouse_id: "", created_by: "" };

// Keng ekranda ustunlar: kirim · sklad · partiyalar · metr · summa · kim · o'tish belgisi
const columns = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_70px_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_16px]";

/** Kirimlar ro'yxati: eng yangisi tepada; davr, sklad va kiritgan xodim bo'yicha filtr. */
export function ReceiptsPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const set = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value });
  const filtered = Object.values(filters).some(Boolean) || period.preset !== "";
  const params = { date_from: period.date_from, date_to: period.date_to, ...filters };

  const options = useQuery({
    queryKey: receivingKeys.options,
    queryFn: () => api<ReceiptOptions>("/receipts/options"),
  });

  const receipts = useInfiniteQuery({
    queryKey: receivingKeys.list(JSON.stringify(params)),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
      return api<ReceiptPage>(`/receipts?${query}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = receipts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <InventoryHeader
        title={t("receiving.title")}
        action={
          <ButtonLink to="/receiving/new">
            <Plus className="size-[18px]" aria-hidden="true" />
            {t("receiving.create")}
          </ButtonLink>
        }
      />
      <Hint id="receiving" className="mt-6">
        {t("receiving.intro")}
      </Hint>

      <Card className="mt-5">
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="mt-4">
          <FilterPanel
            count={filters.created_by ? 1 : 0}
            main={
              <div className="min-w-0 flex-1 basis-56 sm:max-w-xs">
                <SelectField
                  label={t("receiving.warehouse")}
                  value={filters.warehouse_id}
                  onChange={(v) => set("warehouse_id", v)}
                >
                  <option value="">{t("common.all")}</option>
                  {options.data?.warehouses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            }
            after={
              filtered && (
                <RowAction icon={X} className="h-11" onClick={() => (setFilters(NO_FILTERS), setPeriod(ALL_TIME))}>
                  {t("common.clear")}
                </RowAction>
              )
            }
          >
            <div className="max-w-xs">
              <SelectField
                label={t("receiving.created_by")}
                value={filters.created_by}
                onChange={(v) => set("created_by", v)}
              >
                <option value="">{t("common.all")}</option>
                {options.data?.creators.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </FilterPanel>
        </div>
      </Card>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {/* Sarlavha qatori: chapdagi bo'sh joy — qatorlardagi belgi katakchasi eniga teng */}
        <div className={`${sectionStrip} hidden items-center gap-3 md:flex`}>
          <span aria-hidden="true" className="w-10 shrink-0" />
          <div className={`grid min-w-0 flex-1 items-center gap-x-4 ${columns}`}>
            <span>{t("receiving.receipt")}</span>
            <span>{t("receiving.warehouse")}</span>
            <span className="text-right">{t("receiving.batches")}</span>
            <span className="text-right">{t("receiving.total_m")}</span>
            <span className="text-right">{t("receiving.total_amount")}</span>
            <span>{t("receiving.created_by")}</span>
          </div>
        </div>

        {receipts.isLoading && <Loading className="px-4 py-6 sm:px-5" />}
        {receipts.isError && (
          <div className="p-5">
            <Alert>{errorText(receipts.error)}</Alert>
          </div>
        )}
        {receipts.isSuccess && rows.length === 0 && (
          <Empty icon={PackagePlus} tone="sky">
            {t(filtered ? "receiving.empty_filtered" : "receiving.empty")}
          </Empty>
        )}

        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <ReceiptLine key={row.id} row={row} />
          ))}
        </ul>
      </section>

      {receipts.hasNextPage && (
        <LoadMore loading={receipts.isFetchingNextPage} onClick={() => void receipts.fetchNextPage()} />
      )}
    </div>
  );
}

function ReceiptLine({ row }: { row: ReceiptRow }) {
  const { t } = useTranslation();
  const cancelled = row.status === "cancelled";
  const meters = `${formatDecimal(row.total_m)} m`;
  const amount = `${formatNumber(row.total_amount)} ${t("settings.units.sum")}`;
  return (
    <li className={cancelled ? "bg-page/60" : ""}>
      <Link
        to={`/receiving/${row.id}`}
        className={`pressable group flex items-start gap-3 transition-colors hover:bg-page/60 active:bg-page md:items-center ${rowClass}`}
      >
        <IconChip icon={PackagePlus} tone={cancelled ? "madder" : "sky"} />
        <span className={`grid min-w-0 flex-1 items-center gap-x-4 gap-y-1 ${columns}`}>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={`font-medium group-hover:text-indigo ${cancelled ? "text-muted" : ""}`}>
                {row.number}
              </span>
              {cancelled && <Chip tone="madder" dot>{t("receiving.cancelled")}</Chip>}
            </span>
            <span className="block text-sm text-muted">{formatDate(`${row.receipt_date}T12:00:00+05:00`)}</span>
          </span>
          <span className="min-w-0 truncate">{row.warehouse.name}</span>
          {/* Telefon: raqamlar bitta qatorda */}
          <span className="text-sm tabular-nums text-muted md:hidden">
            {t("receiving.batches_count", { count: row.batches_count })} · {meters} · {amount}
          </span>
          <span className="hidden text-right tabular-nums md:block">{row.batches_count}</span>
          <span className="hidden text-right tabular-nums md:block">{meters}</span>
          <span className="hidden text-right font-medium tabular-nums md:block">{amount}</span>
          <span className="min-w-0 truncate text-sm text-muted">{row.created_by.name}</span>
          <ChevronRight
            className="hidden size-4 text-muted transition-transform group-hover:translate-x-0.5 md:block"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}
