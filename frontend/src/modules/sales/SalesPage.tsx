import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Banknote,
  ChevronRight,
  CreditCard,
  HandCoins,
  Plus,
  Receipt,
  ShoppingCart,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { SearchInput } from "@/modules/catalog/parts";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDateTime, formatNumber, todayISO } from "@/shared/format";
import { ButtonLink } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField, TextField } from "@/shared/ui/fields";
import { Chip, Empty, IconChip, LoadMore, RowAction, rowClass } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import type { Tone } from "@/shared/ui/tones";
import { salesKeys, type PaymentType, type Ref, type SalePage, type SaleRow, type SaleStatus } from "./types";

const PAGE_SIZE = 50;
const STATUSES: SaleStatus[] = ["completed", "partially_returned", "returned", "cancelled"];
const PAYMENTS: PaymentType[] = ["cash", "card", "credit"];

type Filters = {
  date_from: string;
  date_to: string;
  store_id: string;
  seller_id: string;
  payment_type: string;
  status: string;
};
type Scope = "mine" | "all";

const NO_FILTERS: Filters = { date_from: "", date_to: "", store_id: "", seller_id: "", payment_type: "", status: "" };

const PAYMENT_STYLE: Record<PaymentType, { icon: LucideIcon; tone: Tone }> = {
  cash: { icon: Banknote, tone: "leaf" },
  card: { icon: CreditCard, tone: "sky" },
  credit: { icon: HandCoins, tone: "saffron" },
};

/** To'lov turi belgisi — rangidan bir qarashda bilinadi: naqd (yashil), karta (ko'k), nasiya (sariq). */
export function PaymentChip({ type }: { type: PaymentType }) {
  const { t } = useTranslation();
  const { icon, tone } = PAYMENT_STYLE[type];
  return (
    <Chip tone={tone} icon={icon}>
      {t(`sales.payment.${type}`)}
    </Chip>
  );
}

// Holat rangi: yakunlangan — yashil, qaytarilgan — sariq, bekor qilingan — kulrang
const STATUS_TONE: Record<SaleStatus, Tone> = {
  completed: "leaf",
  partially_returned: "saffron",
  returned: "saffron",
  cancelled: "neutral",
};

/** Holat belgisi: qaytarilgan va bekor qilingan sotuvlar ro'yxatda ajralib turadi. */
export function SaleStatusChip({ status }: { status: SaleStatus }) {
  const { t } = useTranslation();
  return (
    <Chip tone={STATUS_TONE[status]} dot>
      {t(`sales.status.${status}`)}
    </Chip>
  );
}

/**
 * Sotuvlar ro'yxati. Biznes egasi — barcha do'konlar, filtr va qidiruv bilan. Sotuvchi — "Bugungi sotuvlarim";
 * qaytarish uchun asl sotuvni topishga do'konning barcha sotuvlarini ham ochadi.
 */
export function SalesPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { user } = useCurrentUser();
  const owner = user.role === "owner";
  const sum = t("settings.units.sum");

  const [scope, setScope] = useState<Scope>("mine");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // Qidiruv matni SearchInput ichida kechiktiriladi (300 ms) — bu yerga tayyor qiymat keladi
  const [search, setSearch] = useState("");
  const set = (key: keyof Filters) => (value: string) => setFilters({ ...filters, [key]: value });
  const mineToday = !owner && scope === "mine";
  const wanted = search.trim();
  const filtered = Object.values(filters).some(Boolean) || wanted !== "";

  const params: Record<string, string> = mineToday
    ? { mine: "true", date_from: todayISO(), date_to: todayISO() }
    : { ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), ...(wanted ? { search: wanted } : {}) };

  const sales = useInfiniteQuery({
    queryKey: salesKeys.list(JSON.stringify(params)),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ ...params, limit: String(PAGE_SIZE), offset: String(pageParam) });
      return api<SalePage>(`/sales?${query}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = sales.data?.pages.flatMap((page) => page.items) ?? [];
  const summary = sales.data?.pages[0];

  // Filtr ro'yxatlari — faqat biznes egasiga
  const stores = useQuery({
    queryKey: ["locations", "stores", "all"],
    enabled: owner,
    queryFn: () => api<Ref[]>("/locations?type=store&include_inactive=true"),
  });
  const staff = useQuery({
    queryKey: ["users"],
    enabled: owner,
    queryFn: () => api<{ id: number; full_name: string; role: string }[]>("/users"),
  });

  const dates = (
    <>
      <TextField
        type="date"
        label={t("audit.filters.from")}
        value={filters.date_from}
        onChange={set("date_from")}
        max={filters.date_to || undefined}
      />
      <TextField
        type="date"
        label={t("audit.filters.to")}
        value={filters.date_to}
        onChange={set("date_to")}
        min={filters.date_from || undefined}
      />
    </>
  );

  return (
    <div>
      <PageTitle
        icon={owner ? ShoppingCart : Receipt}
        tone={owner ? "leaf" : "indigo"}
        action={
          owner && (
            <ButtonLink to="/sales/new">
              <Plus className="size-[18px]" aria-hidden="true" />
              {t("sales.new")}
            </ButtonLink>
          )
        }
      >
        {owner ? t("nav.sales") : t("store.nav.my_sales")}
      </PageTitle>

      {!owner && (
        <div className="mt-5 overflow-x-auto">
          <Segmented<Scope>
            label={t("sales.list.scope")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "mine", label: t("sales.list.scope_mine") },
              { value: "all", label: t("sales.list.scope_all") },
            ]}
          />
        </div>
      )}

      {!mineToday && (
        <Card className={owner ? "mt-5" : "mt-4"}>
          <div className={`grid gap-4 sm:grid-cols-2 ${owner ? "lg:grid-cols-3" : ""}`}>
            {dates}
            {owner && (
              <>
                <SelectField label={t("sales.store")} value={filters.store_id} onChange={set("store_id")}>
                  <option value="">{t("common.all")}</option>
                  {stores.data?.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label={t("sales.list.seller")} value={filters.seller_id} onChange={set("seller_id")}>
                  <option value="">{t("common.all")}</option>
                  {staff.data
                    ?.filter((person) => person.role !== "warehouse")
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                </SelectField>
                <SelectField
                  label={t("sales.payment.label")}
                  value={filters.payment_type}
                  onChange={set("payment_type")}
                >
                  <option value="">{t("common.all")}</option>
                  {PAYMENTS.map((type) => (
                    <option key={type} value={type}>
                      {t(`sales.payment.${type}`)}
                    </option>
                  ))}
                </SelectField>
                <SelectField label={t("sales.list.status_filter")} value={filters.status} onChange={set("status")}>
                  <option value="">{t("common.all")}</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t(`sales.status.${status}`)}
                    </option>
                  ))}
                </SelectField>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <SearchInput value={search} onChange={setSearch} label={t("sales.list.search")} />
            {filtered && (
              <RowAction icon={X} onClick={() => (setFilters(NO_FILTERS), setSearch(""))}>
                {t("common.clear")}
              </RowAction>
            )}
          </div>
        </Card>
      )}

      {summary && summary.total > 0 && (
        <p className="mt-4 text-muted">
          {t("sales.list.summary", { count: summary.total, amount: formatNumber(summary.amount) })}
        </p>
      )}

      <section className="mt-3 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {sales.isLoading && <Loading className="px-5 py-6" />}
        {sales.isError && (
          <div className="p-5">
            <Alert>{errorText(sales.error)}</Alert>
          </div>
        )}
        {sales.isSuccess && rows.length === 0 && (
          <Empty icon={Receipt} tone="leaf">
            {t(mineToday ? "sales.list.empty_today" : filtered ? "sales.list.empty_filtered" : "sales.list.empty")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <SaleLine key={row.id} row={row} sum={sum} showStore={owner} />
          ))}
        </ul>
      </section>

      {sales.hasNextPage && <LoadMore loading={sales.isFetchingNextPage} onClick={() => void sales.fetchNextPage()} />}
    </div>
  );
}

/**
 * Ro'yxat qatori. `showStore` — biznes egasiga; sotuvchi faqat o'z do'konini ko'radi, do'kon nomi ortiqcha.
 * memo: "yana ko'rsatish"da avvalgi qatorlar qayta chizilmaydi.
 */
const SaleLine = memo(function SaleLine({ row, sum, showStore }: { row: SaleRow; sum: string; showStore: boolean }) {
  const { t } = useTranslation();
  const cancelled = row.status === "cancelled";
  return (
    <li className={cancelled ? "bg-page/60" : ""}>
      <Link
        to={`/sales/${row.id}`}
        className={`${rowClass} pressable group flex items-center gap-3 transition-colors hover:bg-page/60 active:bg-page/60 sm:gap-4`}
      >
        <IconChip icon={Receipt} tone={cancelled ? "neutral" : "leaf"} />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="min-w-0 flex-1 basis-44">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className={`font-medium group-hover:text-indigo ${cancelled ? "text-muted" : ""}`}>
                {row.number}
              </span>
              {row.status !== "completed" && <SaleStatusChip status={row.status} />}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {formatDateTime(row.created_at)}
              {showStore && ` · ${row.store.name}`} · {row.seller.name}
            </span>
            {row.customer && <span className="block break-words text-sm">{row.customer.name}</span>}
          </span>
          {/* Telefonda — pastda bitta qatorda (summa o'ng chetda); keng ekranda — o'ngda ustun bo'lib */}
          <span className="flex w-full flex-row-reverse flex-wrap items-center gap-x-2.5 gap-y-1 text-right tabular-nums sm:block sm:w-auto">
            <span className={`whitespace-nowrap font-medium sm:block ${cancelled ? "text-muted line-through" : ""}`}>
              {formatNumber(row.total)} {sum}
            </span>
            <span className="sm:mt-0.5 sm:block">
              <PaymentChip type={row.payment_type} />
            </span>
            {row.returned_total > 0 && (
              <span className="text-[13px] text-saffron sm:block">
                {t("sales.list.returned", { amount: formatNumber(row.returned_total) })}
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
});
