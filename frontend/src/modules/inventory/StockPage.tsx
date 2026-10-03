import { memo, useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Layers, Truck } from "lucide-react";
import { SearchInput, Thumb } from "@/modules/catalog/parts";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDecimal } from "@/shared/format";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField } from "@/shared/ui/fields";
import { Chip, Empty, LoadMore, rowClass } from "@/shared/ui/list";
import type { Tone } from "@/shared/ui/tones";
import { InventoryHeader } from "./InventoryHeader";
import { inventoryKeys, skuNames, type StockPage as Page, type StockSku } from "./types";

const PAGE_SIZE = 50;
type Only = "" | "low" | "negative" | "in_transit";
const ONLY: Only[] = ["low", "negative", "in_transit"];
const NO_LOCATIONS: Page["locations"] = [];

/** Qoldiq: SKU bo'yicha → har joydagi jami metr → ichida partiyalar (metr va taxminiy rulon). */
export function StockPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
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
  const placeName = useCallback(
    (id: number) => locations.find((place) => place.id === id)?.name ?? "—",
    [locations],
  );
  const filtered = Boolean(locationId || only || search);

  return (
    <div>
      <InventoryHeader title={t("inventory.tab_stock")} />
      <p className="mt-6 max-w-2xl text-muted">{t("inventory.stock.intro")}</p>

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

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
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
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <StockRow key={row.sku.id} row={row} placeName={placeName} />
          ))}
        </ul>
      </section>

      {stock.hasNextPage && (
        <LoadMore loading={stock.isFetchingNextPage} onClick={() => void stock.fetchNextPage()} />
      )}
    </div>
  );
}

/** Bitta SKU qatori. memo: filtr yoki qidiruv o'zgarganda faqat yangi/o'zgargan qatorlar qayta chiziladi. */
const StockRow = memo(function StockRow({
  row,
  placeName,
}: {
  row: StockSku;
  placeName: (id: number) => string;
}) {
  const { t } = useTranslation();
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

        {/* Har joydagi jami qoldiq; chegaradan past yoki manfiy bo'lsa — rangi bilan ajraladi */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.totals.map((total) => {
            const negative = Number(total.qty_m) < 0;
            const tone: Tone = negative ? "madder" : total.low ? "saffron" : "neutral";
            return (
              <Chip key={total.location_id} tone={tone}>
                {/* Uzun joy nomi tor ekranda qisqaradi — yorliq qatordan chiqib ketmaydi */}
                <span className="max-w-[6rem] truncate sm:max-w-[16rem]">{placeName(total.location_id)}</span>
                <span className={`font-semibold tabular-nums ${tone === "neutral" ? "text-ink" : ""}`}>
                  {formatDecimal(total.qty_m)} m
                </span>
                {total.low && !negative && <span>· {t("inventory.stock.low")}</span>}
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

        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
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
                      `${placeName(cell.location_id)} ${formatDecimal(cell.qty_m)} m (${t("inventory.rolls_about", { count: cell.rolls })})`,
                  )
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
});
