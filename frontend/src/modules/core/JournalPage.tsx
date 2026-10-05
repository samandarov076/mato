import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDateTime, formatDecimal, formatNumber, formatPrice } from "@/shared/format";
import { Card } from "@/shared/ui/Card";
import { ALL_TIME, type Period } from "@/shared/period";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField } from "@/shared/ui/fields";
import { FilterPanel } from "@/shared/ui/FilterPanel";
import { ExportButton } from "@/shared/ui/ExportButton";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { HandCoins, History, Layers, LogIn, type LucideIcon, ShoppingCart, Tag, Users, X } from "lucide-react";
import { Chip, Empty, IconChip, LoadMore, RowAction, rowClassCompact, sectionStrip } from "@/shared/ui/list";
import { focusRing, type Tone } from "@/shared/ui/tones";

const CATEGORIES = ["login", "sale", "stock", "price", "credit", "staff"] as const;

// Toifaning belgisi va rangi — menyudagi bo'lim ranglari bilan bir xil
const CATEGORY_STYLE: Record<(typeof CATEGORIES)[number], [LucideIcon, Tone]> = {
  login: [LogIn, "indigo"],
  sale: [ShoppingCart, "leaf"],
  stock: [Layers, "sky"],
  price: [Tag, "plum"],
  credit: [HandCoins, "saffron"],
  staff: [Users, "rose"],
};

// Keng ekranda (1024px+) ustunlar: vaqt · kim · qayerda · hodisa · tafsilot; torroqda ustma-ust
const COLUMNS = "grid-cols-1 lg:grid-cols-[150px_1fr_1fr_1.5fr_1.6fr]";

type Entry = {
  id: number;
  created_at: string;
  category: (typeof CATEGORIES)[number];
  event_code: string;
  data: Record<string, unknown>;
  user: { id: number; full_name: string } | null;
  location: { id: number; name: string; type: "store" | "warehouse" } | null;
};

type Page = { items: Entry[]; next_cursor: string | null };

type Filters = {
  user_id: string;
  location_id: string;
  /** Kategoriya; "" — barchasi; NO_LOGIN — kirish-chiqishdan tashqari hammasi (standart) */
  category: string;
};

// Kirish-chiqish yozuvlari ko'p va muhim hodisalarni ko'mib yuboradi — jurnal standart holatda ularsiz ochiladi
const NO_LOGIN = "no_login";
const NO_FILTERS: Filters = { user_id: "", location_id: "", category: NO_LOGIN };

/** Sozlama qiymati: yoqilgan/o'chirilgan, bo'sh — chiziqcha, qolgani — o'zi. */
function settingValue(value: unknown, t: TFunction): string {
  if (typeof value === "boolean") return t(value ? "common.on" : "common.off");
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** "Tafsilot" ustuni: nima o'zgargani (eski → yangi) yoki hodisaga tegishli nom. */
function details(entry: Entry, t: TFunction): string[] {
  if (entry.event_code === "settings.changed") {
    const changes = (entry.data.changes ?? {}) as Record<string, { old: unknown; new: unknown }>;
    return Object.entries(changes).map(
      ([field, change]) =>
        `${t(`settings.fields.${field}.title`, { defaultValue: field })}: ${settingValue(change.old, t)} → ${settingValue(change.new, t)}`,
    );
  }
  const { name, count } = entry.data;
  if (entry.event_code === "sku.price_changed" || entry.event_code === "sku.price_bulk") {
    // Tavsiya narx: "M101-05: 45 000 so'm / m → 50 000 so'm / m" yoki "M101 · 12 ta SKU → 50 000 so'm / m"
    const price = (value: unknown, unit: unknown) =>
      typeof value === "number" ? formatPrice(value, unit === "kg" ? "kg" : "m", t) : "—";
    const next = price(entry.data.new_price, entry.data.new_unit);
    if (entry.event_code === "sku.price_bulk") {
      const scope = [name, t("catalog.sku_count", { count: Number(count) })].filter(Boolean);
      return [`${scope.join(" · ")} → ${next}`];
    }
    return [`${String(name)}: ${price(entry.data.old_price, entry.data.old_unit)} → ${next}`];
  }
  if (entry.event_code === "receipt.created") {
    // Kirim: "KR-00012 · 3 ta partiya · 1 200 m"
    return [
      [
        String(name),
        t("receiving.batches_count", { count: Number(entry.data.batches) }),
        `${formatDecimal(String(entry.data.meters))} m`,
      ].join(" · "),
    ];
  }
  if (entry.event_code === "batch.updated") {
    // Partiya tuzatildi: raqami va har o'zgargan maydon "eski → yangi"
    const changes = (entry.data.changes ?? {}) as Record<string, { old: unknown; new: unknown }>;
    return [
      String(name),
      ...Object.entries(changes).map(
        ([field, change]) =>
          `${t(`receiving.fields.${field}`, { defaultValue: field })}: ${amount(change.old)} → ${amount(change.new)}`,
      ),
    ];
  }
  if (entry.event_code === "transfer.sent") {
    // Ko'chirish: "K-00007 → Chorsu do'koni · 2 ta partiya · 250 m"
    return [
      [
        `${String(name)} → ${String(entry.data.to)}`,
        t("receiving.batches_count", { count: Number(entry.data.batches) }),
        `${formatDecimal(String(entry.data.meters))} m`,
      ].join(" · "),
    ];
  }
  if (entry.event_code === "transfer.received" || entry.event_code === "batch.closed") {
    // Farq: ko'chirishda — jo'natilgandan kam/ortiq keldi; yopishda — kam/ortiq chiqdi
    const diff = Number(entry.data.diff ?? 0);
    if (diff === 0) return [String(name)];
    const meters = formatDecimal(String(Math.abs(diff)));
    const kind = entry.event_code === "batch.closed" ? "inventory.diff" : "inventory.receive";
    return [`${String(name)}: ${t(diff > 0 ? `${kind}.short` : `${kind}.over`, { meters })}`];
  }
  if (entry.event_code.startsWith("sale.")) {
    // Sotuv: "S-000012 · 450 000 so'm · Naqd"; bekor qilishda — sababi; qaytarishda — qaytarilgan summa
    const money = `${formatNumber(Number(entry.data.total ?? entry.data.amount ?? 0))} ${t("settings.units.sum")}`;
    if (entry.event_code === "sale.created") {
      return [[String(name), money, t(`sales.payment.${String(entry.data.payment)}`)].join(" · ")];
    }
    const lines = [`${String(name)} · ${money}`];
    if (entry.data.reason) lines.push(t("sales.card.reason", { reason: String(entry.data.reason) }));
    return lines;
  }
  if (entry.event_code === "debt.paid" || entry.event_code === "debt.written_off") {
    // Nasiya: "Sardor Usta · 150 000 so'm · Karta"; hisobdan chiqarishda — sotuv raqami va sababi
    const money = `${formatNumber(Number(entry.data.amount ?? 0))} ${t("settings.units.sum")}`;
    if (entry.event_code === "debt.paid") {
      return [[String(name), money, t(`sales.payment.${String(entry.data.method)}`)].join(" · ")];
    }
    return [
      [String(name), money, String(entry.data.sale)].join(" · "),
      t("sales.card.reason", { reason: String(entry.data.reason) }),
    ];
  }
  if (typeof name === "string") {
    return [typeof count === "number" ? `${name} · ${t("catalog.sku_count", { count })}` : name];
  }
  return [];
}

/** Jurnaldagi son: so'm — butun son, metr va kg — aniq son (matn ko'rinishida saqlanadi). */
function amount(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return formatNumber(value);
  return typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? formatDecimal(value) : String(value);
}

/** Harakatlar jurnali: kim, qachon, qayerda, nima qildi. Yozuvlarni hech kim o'zgartira olmaydi. */
export function JournalPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [period, setPeriod] = useState<Period>(ALL_TIME);

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ id: number; full_name: string }[]>("/users"),
  });
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => api<{ id: number; name: string }[]>("/locations?include_inactive=true"),
  });

  /** Joriy filtrlar — ro'yxat so'rovi va Excel eksporti bir xil ishlatadi */
  function filterParams(): URLSearchParams {
    const params = new URLSearchParams();
    const { category, ...rest } = filters;
    Object.entries({ ...rest, date_from: period.date_from, date_to: period.date_to }).forEach(
      ([key, value]) => value && params.set(key, value),
    );
    if (category === NO_LOGIN) params.set("exclude_category", "login");
    else if (category) params.set("category", category);
    return params;
  }

  const journal = useInfiniteQuery({
    queryKey: ["audit", filters, period.date_from, period.date_to],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = filterParams();
      if (pageParam) params.set("cursor", pageParam);
      return api<Page>(`/audit-logs?${params}`);
    },
    getNextPageParam: (last) => last.next_cursor,
  });

  const set = (key: keyof Filters) => (value: string) => setFilters({ ...filters, [key]: value });
  const hidden = [filters.user_id, filters.location_id].filter(Boolean).length; // "Filtr" tugmasi ortidagilar
  const filtered = hidden > 0 || filters.category !== NO_LOGIN || period.preset !== "";
  const entries = journal.data?.pages.flatMap((page) => page.items) ?? [];
  const eventText = (entry: Entry) =>
    t(`audit.events.${entry.event_code}`, { defaultValue: entry.event_code });

  return (
    <div>
      <Card>
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="mt-4">
          <FilterPanel
            count={hidden}
            main={
              <div className="min-w-0 flex-1 basis-56 sm:max-w-xs">
                <SelectField
                  label={t("audit.filters.category")}
                  value={filters.category}
                  onChange={set("category")}
                >
                  <option value={NO_LOGIN}>{t("audit.without_login")}</option>
                  <option value="">{t("common.all")}</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`audit.categories.${category}`)}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
              <SelectField label={t("audit.filters.user")} value={filters.user_id} onChange={set("user_id")}>
                <option value="">{t("common.all")}</option>
                {users.data?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t("audit.filters.location")}
                value={filters.location_id}
                onChange={set("location_id")}
              >
                <option value="">{t("common.all")}</option>
                {locations.data?.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </FilterPanel>
        </div>
      </Card>

      {entries.length > 0 && (
        <div className="mt-4 flex justify-end">
          <ExportButton path={`/audit-logs/export?${filterParams()}`} />
        </div>
      )}

      <section className="mt-3 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {/* Jadval sarlavhasi faqat keng ekranda; qatorlar bilan bir xil ustun to'ri */}
        <div className={`${sectionStrip} hidden gap-4 lg:grid ${COLUMNS}`}>
          <span>{t("audit.columns.time")}</span>
          <span>{t("audit.columns.user")}</span>
          <span>{t("audit.columns.location")}</span>
          <span>{t("audit.columns.event")}</span>
          <span>{t("audit.columns.details")}</span>
        </div>

        {journal.isLoading && <Loading className="px-5 py-6" />}
        {journal.isError && (
          <div className="p-5">
            <Alert>{errorText(journal.error)}</Alert>
          </div>
        )}
        {journal.isSuccess && entries.length === 0 && (
          <Empty icon={History}>{t("audit.empty")}</Empty>
        )}

        <ul className="divide-y divide-line">
          {entries.map((entry) => {
            const lines = details(entry, t);
            const who = entry.user?.full_name ?? t("audit.system");
            const [icon, tone] = CATEGORY_STYLE[entry.category];
            return (
              <li key={entry.id} className={rowClassCompact}>
                {/*
                  Bitta DOM daraxti: telefonda yacheykalar ustma-ust (hodisa → tafsilot → vaqt · kim · qayerda),
                  keng ekranda `order` tiklanib, jadval ustunlariga tushadi. Belgi (32px + 12px) ostidagi
                  yacheykalar telefonda chapdan 44px suriladi.
                */}
                <div className={`grid gap-x-4 gap-y-0.5 lg:items-center ${COLUMNS}`}>
                  <span className="order-3 pl-11 text-[13px] text-muted lg:order-none lg:pl-0 lg:text-sm lg:tabular-nums">
                    {formatDateTime(entry.created_at)}
                    <span className="lg:hidden">
                      {" · "}
                      {who}
                      {entry.location && ` · ${entry.location.name}`}
                    </span>
                  </span>
                  <span className="hidden min-w-0 truncate lg:block">{who}</span>
                  <span className="hidden min-w-0 truncate text-muted lg:block">{entry.location?.name ?? "—"}</span>
                  <span className="order-1 flex min-w-0 items-center gap-3 lg:order-none lg:gap-2.5">
                    <IconChip icon={icon} tone={tone} size="sm" />
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium lg:font-normal">
                      {eventText(entry)}
                      <Chip tone={tone} className="hidden lg:inline-flex">
                        {t(`audit.categories.${entry.category}`)}
                      </Chip>
                    </span>
                  </span>
                  <span className="order-2 min-w-0 pl-11 text-sm lg:order-none lg:pl-0">
                    {lines.length === 0 ? (
                      <span className="hidden text-muted lg:inline">—</span>
                    ) : (
                      <Details lines={lines} />
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {journal.hasNextPage && (
        <LoadMore loading={journal.isFetchingNextPage} onClick={() => void journal.fetchNextPage()} />
      )}
    </div>
  );
}

// Shundan uzun tafsilot bitta qatorga qisqartiriladi (bosilsa to'liq ochiladi)
const LONG_DETAILS = 70;

/** "Tafsilot" katagi: qisqa matn — to'liq; uzun yoki ko'p qatorli — bitta qator, bosilsa hammasi ko'rinadi. */
function Details({ lines }: { lines: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const text = lines.join(" · ");
  if (lines.length === 1 && text.length <= LONG_DETAILS) return <span className="block break-words">{text}</span>;
  return (
    <button
      type="button"
      aria-expanded={open}
      title={open ? undefined : t("audit.details_show")}
      onClick={() => setOpen(!open)}
      className={`block w-full rounded text-left hover:text-indigo ${focusRing}`}
    >
      {open ? (
        lines.map((line) => (
          <span key={line} className="block break-words">
            {line}
          </span>
        ))
      ) : (
        <span className="block truncate">{text}</span>
      )}
    </button>
  );
}
