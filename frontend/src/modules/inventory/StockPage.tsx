import { memo, useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Layers, Store, Truck, TriangleAlert, Warehouse } from "lucide-react";
import { SearchInput, Thumb } from "@/modules/catalog/parts";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDecimal } from "@/shared/format";
import { useWide } from "@/shared/useWide";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField } from "@/shared/ui/fields";
import { Hint } from "@/shared/ui/Hint";
import { Chip, Empty, LoadMore, rowClass } from "@/shared/ui/list";
import { num, Table, td, Th } from "@/shared/ui/table";
import { focusRing, type Tone } from "@/shared/ui/tones";
import { InventoryHeader } from "./InventoryHeader";
import { inventoryKeys, skuNames, type Place, type StockPage as Page, type StockSku } from "./types";

const PAGE_SIZE = 50;
type Only = "" | "low" | "negative" | "in_transit";
const ONLY: Only[] = ["low", "negative", "in_transit"];
const NO_LOCATIONS: Page["locations"] = [];

/** Qoldiq: SKU bo'yicha → har joydagi jami metr → ichida partiyalar (metr va taxminiy rulon). */
export function StockPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const wide = useWide();
  // Boshlang'ich filtr manzildan: "kam qoldiq" xabari bosilganda shu joy va shu filtr bilan ochiladi
  const [params] = useSearchParams();
  const [locationId, setLocationId] = useState(params.get("location_id") ?? "");
  const [only, setOnly] = useState<Only>(
    ONLY.includes(params.get("only") as Only) ? (params.get("only") as Only) : "",
  );
  // Qidiruv matni SearchInput ichida tinganda keladi (300 ms) — har harfda ro'yxat qayta chizilmaydi
  const [searchText, setSearchText] = useState("");
  const search = searchText.trim();

  const filters = JSON.stringify({ locationId, only, search });
  const stock = useInfiniteQuery({
    queryKey: inventoryKeys.stock(filters),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (locationId) query.set("location_id", locationId);
      if (only) query.set("only", only);
      if (search) query.set("search", search);
      return api<Page>(`/stock?${query}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = stock.data?.pages.flatMap((page) => page.items) ?? [];
  const locations = useMemo(() => stock.data?.pages[0]?.locations ?? NO_LOCATIONS, [stock.data]);
  // Barqaror funksiya — qatorlar (memo) faqat o'z ma'lumoti o'zgarganda qayta chiziladi
  const placeOf = useCallback((id: number) => locations.find((place) => place.id === id), [locations]);
  const filtered = Boolean(locationId || only || search);
  // Matritsa ustunlari: joy tanlangan bo'lsa — faqat o'sha (server shu joy qoldig'ini qaytaradi)
  const columns = locationId ? locations.filter((place) => String(place.id) === locationId) : locations;

  return (
    <div>
      <InventoryHeader title={t("inventory.tab_stock")} />
      <Hint id="stock" className="mt-6">
        {t("inventory.stock.intro")}
      </Hint>

      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <SelectField label={t("inventory.location")} value={locationId} onChange={setLocationId}>
          <option value="">{t("inventory.all_locations")}</option>
          {locations.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </SelectField>
        <SearchInput value={searchText} onChange={setSearchText} label={t("inventory.stock.search")} visibleLabel />
      </div>
      <div className="mt-4 overflow-x-auto">
        <Segmented<Only>
          label={t("inventory.stock.show")}
          value={only}
          onChange={setOnly}
          options={[
            { value: "", label: t("common.all") },
            { value: "low", label: t("inventory.stock.only_low") },
            { value: "negative", label: t("inventory.stock.only_negative") },
            { value: "in_transit", label: t("inventory.stock.only_in_transit") },
          ]}
        />
      </div>

      {/* Belgilar izohi — bir marta, har qatorda takrorlanmaydi */}
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Warehouse className="size-4 text-sky" aria-hidden="true" />
          {t("inventory.stock.legend_warehouse")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Store className="size-4 text-leaf" aria-hidden="true" />
          {t("inventory.stock.legend_store")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TriangleAlert className="size-4 text-saffron" aria-hidden="true" />
          {t("inventory.stock.legend_low")}
        </span>
      </p>

      <section className="mt-3 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {stock.isLoading && <Loading className="px-4 py-6 sm:px-5" />}
        {stock.isError && (
          <div className="p-5">
            <Alert>{errorText(stock.error)}</Alert>
          </div>
        )}
        {stock.isSuccess && rows.length === 0 && (
          <Empty icon={Layers} tone="sky">
            {t(filtered ? "inventory.stock.empty_filtered" : "inventory.stock.empty")}
          </Empty>
        )}
        {/* Planshet va kompyuterda — matritsa (tovar × joy); telefonda — kartochkalar */}
        {wide && rows.length > 0 && (
          <Table
            flush
            label={t("inventory.tab_stock")}
            head={
              <tr>
                <Th>{t("inventory.stock.col_item")}</Th>
                {columns.map((place) => (
                  <Th key={place.id} className="text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {place.type === "store" ? (
                        <Store className="size-4 shrink-0 text-leaf" aria-hidden="true" />
                      ) : (
                        <Warehouse className="size-4 shrink-0 text-sky" aria-hidden="true" />
                      )}
                      {place.name}
                    </span>
                  </Th>
                ))}
                <Th className="text-right">{t("common.total")}</Th>
              </tr>
            }
          >
            {rows.map((row) => (
              <MatrixRow key={row.sku.id} row={row} columns={columns} placeOf={placeOf} />
            ))}
          </Table>
        )}
        {!wide && (
          <ul aria-label={t("inventory.tab_stock")} className="divide-y divide-line">
            {rows.map((row) => (
              <StockRow key={row.sku.id} row={row} placeOf={placeOf} />
            ))}
          </ul>
        )}
      </section>

      {stock.hasNextPage && (
        <LoadMore loading={stock.isFetchingNextPage} onClick={() => void stock.fetchNextPage()} />
      )}
    </div>
  );
}

type PlaceOf = (id: number) => Place | undefined;

/** Partiyalar — kerak bo'lganda ochiladi (har qatorda ochiq tursa, ro'yxat juda zich bo'ladi) */
function Batches({ row, placeOf }: { row: StockSku; placeOf: PlaceOf }) {
  const { t } = useTranslation();
  return (
    <details className="group mt-2 text-sm">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1 rounded text-indigo hover:underline [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        {t("inventory.stock.batches_count", { count: row.batches.length })}
      </summary>
      <ul className="mt-2 space-y-1.5 border-t border-line pt-2">
        {row.batches.map((batch) => (
          <li key={batch.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <Link to={`/batches/${batch.id}`} className="font-medium text-indigo hover:underline">
              {batch.number}
            </Link>
            <span className="text-[13px] text-muted">
              {formatDate(`${batch.receipt_date}T12:00:00+05:00`)}
            </span>
            <span className="min-w-0 text-muted">
              {batch.stocks
                .map(
                  (cell) =>
                    `${placeOf(cell.location_id)?.name ?? "—"} ${formatDecimal(cell.qty_m)} m (${t("inventory.rolls_about", { count: cell.rolls })})`,
                )
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Matritsa qatori (≥768px): tovar · har joydagi metr · jami. Joyda yo'q — chiziqcha. */
const MatrixRow = memo(function MatrixRow({
  row,
  columns,
  placeOf,
}: {
  row: StockSku;
  columns: Place[];
  placeOf: PlaceOf;
}) {
  const { t } = useTranslation();
  const hint = row.threshold ? t("inventory.stock.low_hint", { threshold: formatDecimal(row.threshold) }) : undefined;
  return (
    <tr className="align-top">
      <td className={td}>
        <div className="flex gap-3">
          <Thumb imageUrl={row.sku.image_url} hex={row.sku.hex} code={row.sku.code} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{row.sku.code}</p>
            <p className="text-sm text-muted">{skuNames(row.sku)}</p>
            {Number(row.in_transit_m) > 0 && (
              <Chip tone="indigo" icon={Truck} className="mt-1">
                {t("inventory.in_transit")}
                <span className="font-semibold tabular-nums">{formatDecimal(row.in_transit_m)} m</span>
              </Chip>
            )}
            <Batches row={row} placeOf={placeOf} />
          </div>
        </div>
      </td>
      {columns.map((place) => {
        const total = row.totals.find((item) => item.location_id === place.id);
        if (!total) {
          return (
            <td key={place.id} className={`${td} ${num} text-muted`}>
              —
            </td>
          );
        }
        const negative = Number(total.qty_m) < 0;
        const low = total.low && !negative;
        return (
          <td key={place.id} className={`${td} ${num}`}>
            <span className="inline-flex items-center justify-end gap-1.5">
              <span className={negative ? "font-medium text-madder" : ""}>{formatDecimal(total.qty_m)}</span>
              {low && (
                <span title={hint} className="inline-flex">
                  <TriangleAlert className="size-4 text-saffron" aria-hidden="true" />
                  {hint && <span className="sr-only">{hint}</span>}
                </span>
              )}
            </span>
          </td>
        );
      })}
      <td className={`${td} ${num} font-semibold`}>
        <span className={Number(row.total_m) < 0 ? "text-madder" : ""}>{formatDecimal(row.total_m)}</span>
      </td>
    </tr>
  );
});

/** Bitta SKU qatori. memo: filtr yoki qidiruv o'zgarganda faqat yangi/o'zgargan qatorlar qayta chiziladi. */
const StockRow = memo(function StockRow({
  row,
  placeOf,
}: {
  row: StockSku;
  placeOf: PlaceOf;
}) {
  const { t } = useTranslation();
  // Avval skladlar, keyin do'konlar — tovar qayerda saqlanayotgani va qayerda sotilayotgani ajralib turadi
  const totals = [...row.totals].sort(
    (a, b) => Number(placeOf(a.location_id)?.type === "store") - Number(placeOf(b.location_id)?.type === "store"),
  );
  return (
    <li className={`flex gap-3 sm:gap-4 ${rowClass}`}>
      <Thumb imageUrl={row.sku.image_url} hex={row.sku.hex} code={row.sku.code} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <p className="min-w-0">
            <span className="font-medium">{row.sku.code}</span>
            <span className="ml-2 text-sm text-muted">{skuNames(row.sku)}</span>
          </p>
          <p className="whitespace-nowrap font-semibold tabular-nums">{formatDecimal(row.total_m)} m</p>
        </div>

        {/* Har joydagi qoldiq: sklad — moviy, do'kon — yashil; chegaradan kam — ogohlantirish belgisi */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {totals.map((total) => {
            const place = placeOf(total.location_id);
            const negative = Number(total.qty_m) < 0;
            const low = total.low && !negative;
            const store = place?.type === "store";
            // Rang va belgi — joy turi (sklad / do'kon) doim ajralib tursin; kam qolgani — raqam yonidagi ⚠
            const tone: Tone = negative ? "madder" : store ? "leaf" : "sky";
            const hint = low && row.threshold ? t("inventory.stock.low_hint", { threshold: formatDecimal(row.threshold) }) : undefined;
            return (
              <Chip key={total.location_id} tone={tone} icon={store ? Store : Warehouse}>
                {/* Uzun joy nomi tor ekranda qisqaradi — yorliq qatordan chiqib ketmaydi */}
                <span className="max-w-[6rem] truncate sm:max-w-[16rem]">{place?.name ?? "—"}</span>
                <span className="font-semibold tabular-nums">{formatDecimal(total.qty_m)} m</span>
                {(low || negative) && (
                  <span title={hint} className="inline-flex">
                    <TriangleAlert className={`size-3.5 ${negative ? "" : "text-saffron"}`} aria-hidden="true" />
                    {hint && <span className="sr-only">{hint}</span>}
                  </span>
                )}
              </Chip>
            );
          })}
          {Number(row.in_transit_m) > 0 && (
            <Chip tone="indigo" icon={Truck}>
              {t("inventory.in_transit")}
              <span className="font-semibold tabular-nums">{formatDecimal(row.in_transit_m)} m</span>
            </Chip>
          )}
        </div>

        <Batches row={row} placeOf={placeOf} />
      </div>
    </li>
  );
});
