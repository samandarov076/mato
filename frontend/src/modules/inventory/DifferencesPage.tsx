import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Ruler, TrendingDown, TrendingUp, X } from "lucide-react";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDateTime, formatDecimal, formatNumber } from "@/shared/format";
import { Card } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField, TextField } from "@/shared/ui/fields";
import { Empty, IconChip, LoadMore, RowAction, rowClass, SectionHeader } from "@/shared/ui/list";
import { Stat, statGrid } from "@/shared/ui/Stat";
import type { Tone } from "@/shared/ui/tones";
import { InventoryHeader } from "./InventoryHeader";
import { inventoryKeys, skuNames, type Differences, type StockPage } from "./types";
import { Hint } from "@/shared/ui/Hint";

type Kind = "" | "shortage" | "surplus";
type Filters = { date_from: string; date_to: string; location_id: string; kind: Kind };

const NO_FILTERS: Filters = { date_from: "", date_to: "", location_id: "", kind: "" };
/** Ro'yxatlar shunchadan yuklanadi; jami sonlar serverda barcha qatorlar bo'yicha hisoblanadi */
const PAGE = 100;

/**
 * Musbat farq — kam (qizil), manfiy — ortiq (sariq). Yopilgan partiyada "kam / ortiq chiqdi",
 * ko'chirishda — jo'natilgandan "kam / ortiq" keldi.
 */
function DiffText({ meters, transfer = false }: { meters: string; transfer?: boolean }) {
  const { t } = useTranslation();
  const diff = Number(meters);
  const value = formatDecimal(String(Math.abs(diff)));
  const kind = transfer ? "inventory.receive" : "inventory.diff";
  return diff > 0 ? (
    <span className="whitespace-nowrap font-medium tabular-nums text-madder">
      {t(`${kind}.short`, { meters: value })}
    </span>
  ) : (
    <span className="whitespace-nowrap font-medium tabular-nums text-saffron">
      {t(`${kind}.over`, { meters: value })}
    </span>
  );
}

/** Qator boshidagi belgi rangi: kam chiqqan — qizil, ortiq chiqqan — yashil. */
const diffTone = (meters: string): Tone => (Number(meters) > 0 ? "madder" : "saffron");

/** Metr farqi hisoboti (biznes egasi): yopilgan partiyalardagi farq va ko'chirish farqlari. */
export function DifferencesPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters({ ...filters, [key]: value });
  const filtered = Object.values(filters).some(Boolean);
  const sum = t("settings.units.sum");

  const report = useInfiniteQuery({
    queryKey: inventoryKeys.differences(JSON.stringify(filters)),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE), offset: String(pageParam) });
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      return api<Differences>(`/stock/differences?${query}`);
    },
    getNextPageParam: (last, pages) =>
      pages.length * PAGE < Math.max(last.closures_total, last.transfers_total) ? pages.length * PAGE : undefined,
  });
  // Joylar ro'yxati filtr uchun — qoldiq so'rovidan (bitta qator yetarli)
  const places = useQuery({
    queryKey: inventoryKeys.stock("places"),
    queryFn: () => api<StockPage>("/stock?limit=1"),
  });
  // Jami — birinchi sahifadan (hammasida bir xil); ro'yxatlar — yuklangan sahifalar ketma-ketligi
  const pages = report.data?.pages;
  const data = pages && {
    ...pages[0],
    closures: pages.flatMap((page) => page.closures),
    transfers: pages.flatMap((page) => page.transfers),
  };

  return (
    <div>
      <InventoryHeader title={t("inventory.tab_differences")} />
      <Hint id="differences" className="mt-6">{t("inventory.differences.intro")}</Hint>

      <Card className="mt-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label={t("audit.filters.from")}
            type="date"
            value={filters.date_from}
            onChange={(v) => set("date_from", v)}
          />
          <TextField
            label={t("audit.filters.to")}
            type="date"
            value={filters.date_to}
            onChange={(v) => set("date_to", v)}
          />
          <SelectField
            label={t("inventory.location")}
            value={filters.location_id}
            onChange={(v) => set("location_id", v)}
          >
            <option value="">{t("inventory.all_locations")}</option>
            {places.data?.locations.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Segmented<Kind>
            label={t("inventory.differences.kind")}
            value={filters.kind}
            onChange={(kind) => set("kind", kind)}
            options={[
              { value: "", label: t("common.all") },
              { value: "shortage", label: t("inventory.differences.shortage") },
              { value: "surplus", label: t("inventory.differences.surplus") },
            ]}
          />
          {filtered && (
            <RowAction icon={X} onClick={() => setFilters(NO_FILTERS)}>
              {t("common.clear")}
            </RowAction>
          )}
        </div>
      </Card>

      {/* Yuklanish, xato va ma'lumot bir xil masofada — sahifa sakramaydi */}
      {report.isLoading && <Loading className="mt-4" />}
      {report.isError && (
        <div className="mt-4">
          <Alert>{errorText(report.error)}</Alert>
        </div>
      )}

      {data && (
        <>
          <div className={`mt-4 ${statGrid} sm:grid-cols-3`}>
            {(
              [
                {
                  key: "shortage",
                  meters: data.shortage_m,
                  amount: data.shortage_amount,
                  tone: "text-madder",
                  icon: TrendingDown,
                  accent: "madder",
                },
                {
                  key: "surplus",
                  meters: data.surplus_m,
                  amount: data.surplus_amount,
                  tone: "text-saffron",
                  icon: TrendingUp,
                  accent: "saffron",
                },
                {
                  key: "transfer",
                  meters: data.transfer_m,
                  amount: data.transfer_amount,
                  tone: "text-ink",
                  icon: ArrowLeftRight,
                  accent: "coral",
                },
              ] as const
            ).map((total) => (
              <Stat
                key={total.key}
                label={t(`inventory.differences.${total.key}`)}
                value={formatDecimal(total.meters)}
                unit="m"
                icon={total.icon}
                accent={total.accent}
                tone={Number(total.meters) ? total.tone : ""}
              >
                <span className="tabular-nums">
                  {formatNumber(total.amount)} {sum}
                </span>
              </Stat>
            ))}
          </div>

          <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <SectionHeader>{t("inventory.differences.closures")}</SectionHeader>
            {data.closures.length === 0 && (
              <Empty icon={Ruler} tone="sky">
                {t("inventory.differences.empty")}
              </Empty>
            )}
            <ul className="divide-y divide-line">
              {data.closures.map((row) => (
                <li key={row.id} className={`flex gap-3 sm:gap-4 ${rowClass}`}>
                  <IconChip icon={Ruler} tone={diffTone(row.diff_m)} />
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="min-w-0 flex-1 basis-56">
                      <Link to={`/batches/${row.batch_id}`} className="font-medium text-indigo hover:underline">
                        {row.batch_number}
                      </Link>
                      <span className="ml-2 text-sm text-muted">
                        {row.sku.code} · {skuNames(row.sku)}
                      </span>
                      <span className="block text-sm">
                        {row.location.name} ·{" "}
                        {t("inventory.differences.in_out", {
                          received: formatDecimal(row.received_m),
                          out: formatDecimal(row.out_m),
                        })}
                      </span>
                      <span className="block break-words text-[13px] text-muted">
                        {row.closed_by.name}, {formatDateTime(row.closed_at)}
                        {row.note && ` · ${row.note}`}
                      </span>
                    </span>
                    {/* Farq va summa har doim o'ng chetda — ustun bo'lib o'qiladi */}
                    <span className="ml-auto text-right">
                      <DiffText meters={row.diff_m} />
                      <span className="block text-sm tabular-nums text-muted">
                        {row.diff_percent !== null && `${Math.abs(Number(row.diff_percent))}% · `}
                        {formatNumber(Math.abs(row.diff_amount))} {sum}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <SectionHeader>{t("inventory.differences.transfers")}</SectionHeader>
            {data.transfers.length === 0 && (
              <Empty icon={Ruler} tone="sky">
                {t("inventory.differences.empty")}
              </Empty>
            )}
            <ul className="divide-y divide-line">
              {data.transfers.map((row) => (
                <li key={`${row.transfer_id}-${row.batch_id}`} className={`flex gap-3 sm:gap-4 ${rowClass}`}>
                  <IconChip icon={Ruler} tone={diffTone(row.diff_m)} />
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="min-w-0 flex-1 basis-56">
                      <Link to={`/transfers/${row.transfer_id}`} className="font-medium text-indigo hover:underline">
                        {row.number}
                      </Link>
                      <span className="ml-2 text-sm text-muted">
                        {row.batch_number} · {row.sku.code}
                      </span>
                      <span className="block text-sm">
                        {row.source.name} → {row.target.name} ·{" "}
                        {t("inventory.differences.sent_got", {
                          sent: formatDecimal(row.sent_m),
                          got: formatDecimal(row.received_m),
                        })}
                      </span>
                      <span className="block break-words text-[13px] text-muted">
                        {row.received_by.name}, {formatDateTime(row.received_at)}
                        {row.note && ` · ${row.note}`}
                      </span>
                    </span>
                    <span className="ml-auto text-right">
                      <DiffText meters={row.diff_m} transfer />
                      <span className="block text-sm tabular-nums text-muted">
                        {formatNumber(Math.abs(row.diff_amount))} {sum}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {report.hasNextPage && (
            <LoadMore loading={report.isFetchingNextPage} onClick={() => void report.fetchNextPage()} />
          )}
        </>
      )}
    </div>
  );
}
