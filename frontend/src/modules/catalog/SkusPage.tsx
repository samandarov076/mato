import { memo, useCallback, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, ChevronRight, Plus, X } from "lucide-react";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatPrice, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { MoneyInput, Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField } from "@/shared/ui/fields";
import { InactiveChip, SearchInput, ShowInactive, Thumb, linkButton } from "./parts";
import { Chip, Empty, LoadMore, RowAction, rowClass, sectionStrip } from "@/shared/ui/list";
import { focusRing } from "@/shared/ui/tones";
import {
  catalogKeys,
  type Attribute,
  type Fabric,
  type PriceUnit,
  type Sku,
  type SkuPage as Page,
} from "./types";

const PAGE_SIZE = 100;
const NONE: ReadonlySet<number> = new Set();
const checkbox = "size-4 shrink-0 cursor-pointer accent-[rgb(var(--indigo))]";
// Keng ekranda ustunlar: SKU · tavsiya narx · kam qoldiq chegarasi · o'tish belgisi
const columns = "md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.9fr)_16px]";

type Created = { created: number; existing: number };

/** SKU ro'yxati: filtrlar, ommaviy narx qo'yish va qo'lda SKU qo'shish. */
export function SkusPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const bulkErrorId = useId();

  // Filtrlar manzilda turadi — SKU kartochkasidan qaytganda ro'yxat o'z holida qoladi
  const filters = {
    fabricId: params.get("fabric_id") ?? "",
    colorId: params.get("color_id") ?? "",
    patternId: params.get("pattern_id") ?? "",
    q: params.get("q") ?? "",
    noPrice: params.get("no_price") === "1",
    inactive: params.get("inactive") === "1",
  };
  const filterKey = params.toString();

  function setFilter(name: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        return next;
      },
      { replace: true },
    );
  }

  const fabrics = useQuery({
    queryKey: catalogKeys.fabrics,
    queryFn: () => api<Fabric[]>("/catalog/fabrics?include_inactive=true"),
  });
  const colors = useQuery({
    queryKey: catalogKeys.attributes("colors"),
    queryFn: () => api<Attribute[]>("/catalog/colors?include_inactive=true"),
  });
  const patterns = useQuery({
    queryKey: catalogKeys.attributes("patterns"),
    queryFn: () => api<Attribute[]>("/catalog/patterns?include_inactive=true"),
  });

  const skus = useInfiniteQuery({
    queryKey: [...catalogKeys.skus, filterKey],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (filters.fabricId) query.set("fabric_id", filters.fabricId);
      if (filters.colorId) query.set("color_id", filters.colorId);
      if (filters.patternId) query.set("pattern_id", filters.patternId);
      if (filters.q) query.set("search", filters.q);
      if (filters.noPrice) query.set("no_price", "true");
      if (filters.inactive) query.set("include_inactive", "true");
      return api<Page>(`/catalog/skus?${query}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = skus.data?.pages.flatMap((page) => page.items) ?? [];
  const total = skus.data?.pages[0]?.total ?? 0;
  const filtered = filterKey !== "";

  // Tanlov shu filtrga tegishli: filtr o'zgarsa, tanlov o'z-o'zidan bo'shaydi
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<number> }>({
    key: filterKey,
    ids: NONE,
  });
  const selected = selection.key === filterKey ? selection.ids : NONE;
  const select = (ids: ReadonlySet<number>) => setSelection({ key: filterKey, ids });
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  // Barqaror funksiya: qatorlar memo'langan — bitta belgi o'zgarsa, qolgan 100 qator qayta chizilmaydi
  const toggle = useCallback(
    (id: number) => {
      // Oldingi holatdan hisoblanadi — ketma-ket tez bosishlar bir-birini yo'qotmaydi
      setSelection((current) => {
        const next = new Set(current.key === filterKey ? current.ids : NONE);
        if (!next.delete(id)) next.add(id);
        return { key: filterKey, ids: next };
      });
    },
    [filterKey],
  );

  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkUnit, setBulkUnit] = useState<PriceUnit>("m");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });

  async function applyPrice(event: FormEvent) {
    event.preventDefault();
    if (!bulkPrice) {
      feedback("error");
      return setBulkError(t("catalog.sku.price_required"));
    }
    setBulkBusy(true);
    setBulkError(null);
    try {
      const { changed } = await post<{ changed: number }>("/catalog/skus/price", {
        sku_ids: [...selected],
        price: Number(bulkPrice),
        price_unit: bulkUnit,
      });
      setNotice(
        changed > 0 ? t("catalog.sku.bulk_done", { count: changed }) : t("catalog.sku.bulk_unchanged"),
      );
      select(NONE);
      setBulkPrice("");
      await reload();
    } catch (error) {
      setBulkError(errorText(error));
    } finally {
      setBulkBusy(false);
    }
  }

  async function created(fabricId: number, result: Created) {
    setAdding(false);
    setNotice(
      result.created === 0
        ? t("catalog.sku.all_existing")
        : result.existing === 0
          ? t("catalog.sku.created", { count: result.created })
          : t("catalog.sku.created_some_existing", result),
    );
    // Yangi SKU'lar darhol ko'rinsin: ro'yxat shu mato bo'yicha ochiladi (narxni shu yerda qo'yish qulay)
    setParams({ fabric_id: String(fabricId) }, { replace: true });
    await reload();
  }

  const option = (row: { id: number; code: string; name: string; is_active: boolean }) => (
    <option key={row.id} value={row.id}>
      {row.code} — {row.name}
      {row.is_active ? "" : ` (${t("common.inactive")})`}
    </option>
  );
  const unitOptions = [
    { value: "m" as PriceUnit, label: t("catalog.unit_m") },
    { value: "kg" as PriceUnit, label: t("catalog.unit_kg") },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-muted">{t("catalog.sku.intro")}</p>
        {!adding && (
          <Button onClick={() => (setNotice(null), setAdding(true))}>
            <Plus className="size-[18px]" aria-hidden="true" />
            {t("catalog.sku.add")}
          </Button>
        )}
      </div>

      {adding && (
        <AddSkus
          fabrics={(fabrics.data ?? []).filter((row) => row.is_active)}
          colors={(colors.data ?? []).filter((row) => row.is_active)}
          patterns={(patterns.data ?? []).filter((row) => row.is_active)}
          initialFabricId={filters.fabricId}
          onCancel={() => setAdding(false)}
          onCreated={created}
        />
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t("catalog.sku.fabric")}
          value={filters.fabricId}
          onChange={(v) => setFilter("fabric_id", v)}
        >
          <option value="">{t("common.all")}</option>
          {fabrics.data?.map(option)}
        </SelectField>
        <SelectField
          label={t("catalog.sku.color")}
          value={filters.colorId}
          onChange={(v) => setFilter("color_id", v)}
        >
          <option value="">{t("common.all")}</option>
          {colors.data?.map(option)}
        </SelectField>
        <SelectField
          label={t("catalog.sku.pattern")}
          value={filters.patternId}
          onChange={(v) => setFilter("pattern_id", v)}
        >
          <option value="">{t("common.all")}</option>
          {patterns.data?.map(option)}
        </SelectField>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Qidiruv maydoni o'zi 300 ms kutadi — bu yerga faqat tingan matn keladi */}
        <SearchInput value={filters.q} onChange={(q) => setFilter("q", q.trim())} label={t("catalog.search")} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className={checkbox}
            checked={filters.noPrice}
            onChange={(e) => setFilter("no_price", e.target.checked ? "1" : "")}
          />
          {t("catalog.sku.only_no_price")}
        </label>
        <ShowInactive checked={filters.inactive} onChange={(on) => setFilter("inactive", on ? "1" : "")} />
      </div>

      {notice && (
        <div className="mt-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {rows.length > 0 && (
          <div className={`${sectionStrip} flex items-center gap-3`}>
            <input
              type="checkbox"
              className={checkbox}
              aria-label={t("catalog.sku.select_all_rows")}
              checked={allSelected}
              onChange={() => select(allSelected ? NONE : new Set(rows.map((row) => row.id)))}
            />
            <span className="md:hidden">{t("catalog.sku.select_all_rows")}</span>
            <div className={`hidden flex-1 items-center gap-x-4 md:grid ${columns}`}>
              <span>{t("catalog.tab_skus")}</span>
              <span>{t("catalog.sku.col_price")}</span>
              <span>{t("catalog.sku.col_threshold")}</span>
            </div>
          </div>
        )}

        {skus.isLoading && <Loading className="px-5 py-6" />}
        {skus.isError && (
          <div className="p-5">
            <Alert>{errorText(skus.error)}</Alert>
          </div>
        )}
        {skus.isSuccess && rows.length === 0 && (
          <Empty
            icon={Barcode}
            tone="plum"
            action={
              filtered && (
                <RowAction icon={X} onClick={() => setParams({}, { replace: true })}>
                  {t("common.clear")}
                </RowAction>
              )
            }
          >
            {t(filtered ? "catalog.sku.empty_filtered" : "catalog.sku.empty")}
          </Empty>
        )}

        <ul className="divide-y divide-line">
          {rows.map((sku) => (
            <SkuRow key={sku.id} sku={sku} checked={selected.has(sku.id)} onToggle={toggle} />
          ))}
        </ul>
      </section>

      {rows.length > 0 && (
        <p className="mt-3 text-sm text-muted">{t("catalog.sku.shown", { shown: rows.length, total })}</p>
      )}
      {skus.hasNextPage && <LoadMore loading={skus.isFetchingNextPage} onClick={() => void skus.fetchNextPage()} />}

      {/* Ommaviy narx: tanlov bo'lganda ekran pastida turadi */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 z-10 mt-4 rounded-card border border-indigo/30 bg-panel p-4 shadow-pop">
          <form onSubmit={applyPrice} noValidate className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="font-medium">{t("catalog.sku.selected", { count: selected.size })}</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <MoneyInput
                value={bulkPrice}
                onChange={setBulkPrice}
                label={t("catalog.sku.bulk_price")}
                placeholder={t("catalog.sku.bulk_price")}
                invalid={Boolean(bulkError)}
                describedBy={bulkError ? bulkErrorId : undefined}
              />
              <span className="text-sm text-muted">{t("settings.units.sum")} /</span>
              <Segmented<PriceUnit>
                label={t("catalog.sku.price_unit")}
                value={bulkUnit}
                onChange={setBulkUnit}
                options={unitOptions}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={bulkBusy}>
                {t("catalog.sku.apply_price")}
              </Button>
              <Button variant="ghost" onClick={() => (select(NONE), setBulkError(null))}>
                {t("catalog.sku.clear_selection")}
              </Button>
            </div>
            {bulkError && (
              <p id={bulkErrorId} role="alert" className="basis-full text-sm text-madder">
                {bulkError}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

/** Ro'yxat qatori. memo: tanlov yoki qidiruv o'zgarganda faqat tegishli qator qayta chiziladi. */
const SkuRow = memo(function SkuRow({
  sku,
  checked,
  onToggle,
}: {
  sku: Sku;
  checked: boolean;
  onToggle: (id: number) => void;
}) {
  const { t } = useTranslation();
  const parts = [sku.fabric.name, sku.color.name, !sku.pattern.is_plain && sku.pattern.name].filter(Boolean);
  return (
    <li className={`${rowClass} flex items-center gap-3 ${sku.is_active ? "" : "bg-page/60"}`}>
      <input
        type="checkbox"
        className={checkbox}
        aria-label={t("catalog.sku.select_row", { code: sku.code })}
        checked={checked}
        onChange={() => onToggle(sku.id)}
      />
      <Link
        to={`/catalog/skus/${sku.id}`}
        className={`group grid min-w-0 flex-1 items-center gap-x-4 gap-y-1 rounded-lg ${columns} ${focusRing}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Thumb
            imageUrl={sku.pattern.image_url ?? sku.color.image_url}
            hex={sku.color.hex}
            code={sku.color.code}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={`font-medium group-hover:text-indigo ${sku.is_active ? "" : "text-muted"}`}>
                {sku.code}
              </span>
              {!sku.is_active && <InactiveChip />}
            </span>
            <span className="block truncate text-sm text-muted">{parts.join(" · ")}</span>
          </span>
        </span>
        <span className="pl-[52px] md:pl-0">
          {sku.price === null ? (
            <Chip tone="saffron">{t("catalog.no_price")}</Chip>
          ) : (
            <span className="tabular-nums">{formatPrice(sku.price, sku.price_unit, t)}</span>
          )}
        </span>
        <span className="hidden text-sm text-muted md:block">
          {sku.low_stock_threshold === null
            ? t("catalog.sku.threshold_standard")
            : t("catalog.sku.threshold_value", { value: trimDecimal(sku.low_stock_threshold) })}
        </span>
        <ChevronRight className="hidden size-4 text-muted md:block" aria-hidden="true" />
      </Link>
    </li>
  );
});

/** Tanlanadigan chip (rang yoki gul): bosilganda belgilanadi */
function PickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        feedback("select", event);
        onClick();
      }}
      className={`pressable inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-sm transition-colors ${focusRing} ${
        active
          ? "border-indigo bg-indigo-soft font-medium text-indigo active:bg-indigo-soft"
          : "border-edge bg-panel hover:border-indigo/50 active:bg-indigo-soft"
      }`}
    >
      {children}
    </button>
  );
}

/** Qo'lda SKU qo'shish: bitta mato uchun tanlangan ranglar × gullar. Odatda SKU kirimda o'zi yaratiladi. */
function AddSkus({
  fabrics,
  colors,
  patterns,
  initialFabricId,
  onCancel,
  onCreated,
}: {
  fabrics: Fabric[];
  colors: Attribute[];
  patterns: Attribute[];
  initialFabricId: string;
  onCancel: () => void;
  onCreated: (fabricId: number, result: Created) => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const plain = patterns.find((row) => row.is_plain);

  const [fabricId, setFabricId] = useState(
    fabrics.some((row) => String(row.id) === initialFabricId) ? initialFabricId : "",
  );
  const [colorIds, setColorIds] = useState<number[]>([]);
  // null — foydalanuvchi hali tegmagan: "gulsiz" tanlangan hisoblanadi
  const [pickedPatterns, setPickedPatterns] = useState<number[] | null>(null);
  const defaultPatterns = plain ? [plain.id] : [];
  const patternIds = pickedPatterns ?? defaultPatterns;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const flip = (ids: number[], id: number) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const count = colorIds.length * Math.max(patternIds.length, 1);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!fabricId) return setError(t("catalog.sku.fabric_required"));
    if (colorIds.length === 0) return setError(t("catalog.sku.colors_required"));
    setSaving(true);
    setError(null);
    try {
      const result = await post<Created>("/catalog/skus", {
        fabric_id: Number(fabricId),
        color_ids: colorIds,
        pattern_ids: patternIds,
      });
      onCreated(Number(fabricId), result);
    } catch (failure) {
      setError(errorText(failure));
      setSaving(false);
    }
  }

  if (fabrics.length === 0 || colors.length === 0) {
    return (
      <Card title={t("catalog.sku.add")} icon={Barcode} tone="plum" className="mt-4 max-w-2xl">
        <Alert tone="info">{t("catalog.sku.need_setup")}</Alert>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/catalog" className={linkButton}>
            {t("catalog.tab_fabrics")}
          </Link>
          <Link to="/catalog/colors" className={linkButton}>
            {t("catalog.tab_colors")}
          </Link>
          <button type="button" className={`${linkButton} ml-auto text-muted`} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title={t("catalog.sku.add")} icon={Barcode} tone="plum" className="mt-4 max-w-2xl">
      <form onSubmit={save} noValidate className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <SelectField label={t("catalog.sku.fabric")} value={fabricId} onChange={setFabricId}>
          <option value="">{t("catalog.sku.fabric_placeholder")}</option>
          {fabrics.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} — {row.name}
            </option>
          ))}
        </SelectField>

        <fieldset>
          <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
            {t("catalog.sku.colors")}
            <button
              type="button"
              className={`${linkButton} font-normal`}
              onClick={() => setColorIds(colorIds.length === colors.length ? [] : colors.map((row) => row.id))}
            >
              {t(colorIds.length === colors.length ? "catalog.sku.select_none" : "catalog.sku.select_all")}
            </button>
          </legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((row) => (
              <PickChip
                key={row.id}
                active={colorIds.includes(row.id)}
                onClick={() => setColorIds((ids) => flip(ids, row.id))}
              >
                <Thumb imageUrl={row.image_url} hex={row.hex} code={row.code} size="sm" />
                {row.code} · {row.name}
              </PickChip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("catalog.sku.patterns")}</legend>
          <div className="flex flex-wrap gap-2">
            {patterns.map((row) => (
              <PickChip
                key={row.id}
                active={patternIds.includes(row.id)}
                onClick={() => setPickedPatterns((picked) => flip(picked ?? defaultPatterns, row.id))}
              >
                <Thumb imageUrl={row.image_url} code={row.code} size="sm" />
                {row.is_plain ? row.name : `${row.code} · ${row.name}`}
              </PickChip>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{t("catalog.sku.patterns_hint")}</p>
        </fieldset>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" loading={saving}>
            {t("catalog.sku.add")}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          {count > 0 && <span className="text-sm text-muted">{t("catalog.sku.will_create", { count })}</span>}
        </div>
      </form>
    </Card>
  );
}
