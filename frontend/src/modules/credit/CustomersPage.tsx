import { memo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, HandCoins, UserPlus, Users } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { SearchInput, ShowInactive } from "@/modules/catalog/parts";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatNumber } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Avatar } from "@/shared/ui/Avatar";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { Chip, Empty, LoadMore, rowClass } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { Stat, statGrid } from "@/shared/ui/Stat";
import { focusRing } from "@/shared/ui/tones";
import { NewCustomer } from "./CustomerPicker";
import { creditKeys, phoneText, type CustomerPage, type CustomerRow } from "./types";

const PAGE_SIZE = 50;

type Only = "" | "debtors" | "overdue";
type Sort = "name" | "debt" | "oldest";
const ONLY: Only[] = ["debtors", "overdue"];
const SORTS: Sort[] = ["name", "debt", "oldest"];

/**
 * Mijozlar: kimning qancha qarzi bor, qaysi biri muddatidan o'tgan. Mijoz biznes bo'yicha umumiy —
 * istalgan do'konda nasiya oladi va to'laydi.
 */
export function CustomersPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const sum = t("settings.units.sum");

  // Boshlang'ich filtr manzildan: "muddati o'tgan qarz" xabari bosilganda shu filtr bilan ochiladi
  const [params] = useSearchParams();
  // Qidiruv matni SearchInput ichida kechiktiriladi (300 ms) — bu yerga tayyor qiymat keladi
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<Only>(
    ONLY.includes(params.get("only") as Only) ? (params.get("only") as Only) : "",
  );
  const [sort, setSort] = useState<Sort>(
    SORTS.includes(params.get("sort") as Sort) ? (params.get("sort") as Sort) : "name",
  );
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);

  const wanted = search.trim();
  const query: Record<string, string> = { sort };
  if (wanted) query.search = wanted;
  if (only) query.only = only;
  if (showInactive) query.include_inactive = "true";

  const customers = useInfiniteQuery({
    queryKey: creditKeys.list(JSON.stringify(query)),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams({ ...query, limit: String(PAGE_SIZE), offset: String(pageParam) });
      return api<CustomerPage>(`/customers?${search}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = customers.data?.pages.flatMap((page) => page.items) ?? [];
  const totals = customers.data?.pages[0];
  const filtered = wanted !== "" || only !== "";

  return (
    <div>
      <PageTitle
        icon={HandCoins}
        tone="saffron"
        action={
          <Button onClick={() => setAdding(true)} disabled={adding} aria-expanded={adding}>
            <UserPlus className="size-[18px]" aria-hidden="true" />
            {t("credit.customer.add")}
          </Button>
        }
      >
        {t(user.role === "owner" ? "nav.credit" : "store.nav.customers")}
      </PageTitle>
      <p className="mt-3 max-w-2xl text-muted">{t("credit.intro")}</p>

      {adding && (
        <Card title={t("credit.customer.add")} icon={UserPlus} tone="saffron" className="mt-5 max-w-2xl">
          <NewCustomer
            withNote
            onCancel={() => setAdding(false)}
            onSaved={(customer) => {
              void queryClient.invalidateQueries({ queryKey: creditKeys.all });
              navigate(`/customers/${customer.id}`);
            }}
          />
        </Card>
      )}

      {totals && (
        <div className={`${statGrid} mt-5 max-w-2xl`}>
          <Stat label={t("credit.total_debt")} value={totals.debt_total} unit={sum} icon={HandCoins} accent="saffron" />
          <Stat
            label={t("credit.overdue")}
            value={totals.overdue_total}
            unit={sum}
            icon={CalendarClock}
            accent="madder"
            tone={totals.overdue_total > 0 ? "text-madder" : ""}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchInput value={search} onChange={setSearch} label={t("credit.customer.search")} />
        <div className="overflow-x-auto">
          <Segmented<Only>
            label={t("credit.filter")}
            value={only}
            onChange={setOnly}
            options={[
              { value: "", label: t("common.all") },
              { value: "debtors", label: t("credit.only_debtors") },
              { value: "overdue", label: t("credit.only_overdue") },
            ]}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t("credit.sort")}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={`h-11 rounded-control border border-edge bg-panel px-2 text-[16px] transition-colors focus:border-indigo ${focusRing}`}
          >
            <option value="name">{t("credit.sort_name")}</option>
            <option value="debt">{t("credit.sort_debt")}</option>
            <option value="oldest">{t("credit.sort_oldest")}</option>
          </select>
        </label>
        <ShowInactive checked={showInactive} onChange={setShowInactive} />
      </div>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {customers.isLoading && <Loading className="px-5 py-6" />}
        {customers.isError && (
          <div className="p-5">
            <Alert>{errorText(customers.error)}</Alert>
          </div>
        )}
        {customers.isSuccess && rows.length === 0 && (
          <Empty icon={Users} tone="saffron">
            {t(filtered ? "credit.empty_filtered" : "credit.empty")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <CustomerLine key={row.id} row={row} sum={sum} />
          ))}
        </ul>
      </section>

      {customers.hasNextPage && (
        <LoadMore loading={customers.isFetchingNextPage} onClick={() => void customers.fetchNextPage()} />
      )}
    </div>
  );
}

/** Ro'yxat qatori. memo: "yana ko'rsatish"da avvalgi qatorlar qayta chizilmaydi. */
const CustomerLine = memo(function CustomerLine({ row, sum }: { row: CustomerRow; sum: string }) {
  const { t } = useTranslation();
  return (
    <li className={row.is_active ? "" : "bg-page/60"}>
      <Link
        to={`/customers/${row.id}`}
        className={`${rowClass} pressable group flex items-center gap-3 transition-colors hover:bg-page/60 active:bg-page/60 sm:gap-4`}
      >
        <Avatar name={row.name} />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="min-w-0 flex-1 basis-44">
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className={`break-words font-medium group-hover:text-indigo ${row.is_active ? "" : "text-muted"}`}>
                {row.name}
              </span>
              {!row.is_active && <Chip>{t("common.inactive")}</Chip>}
            </span>
            <span className="block break-words text-sm text-muted">
              <span className="whitespace-nowrap">{phoneText(row.phone)}</span>
              {row.note && ` · ${row.note}`}
            </span>
            {row.debt > 0 && (
              <span className="block text-[13px] text-muted">
                {row.oldest_days !== null &&
                  (row.oldest_days === 0
                    ? t("credit.oldest_today")
                    : t("credit.oldest_days", { count: row.oldest_days }))}
                {row.last_payment_at &&
                  ` · ${t("credit.last_payment_at", { date: formatDate(row.last_payment_at) })}`}
              </span>
            )}
          </span>
          {/* Telefonda qarz — pastda bitta qatorda (summa o'ng chetda); keng ekranda — o'ngda ustun bo'lib */}
          <span
            className={`ml-auto flex flex-row-reverse flex-wrap items-center gap-x-2.5 gap-y-1 text-right tabular-nums sm:block sm:w-auto ${
              row.debt > 0 ? "w-full" : ""
            }`}
          >
            {row.debt > 0 ? (
              <>
                <span className="whitespace-nowrap font-medium sm:block">
                  {formatNumber(row.debt)} {sum}
                </span>
                {row.overdue > 0 && (
                  <span className="sm:mt-0.5 sm:block">
                    <Chip tone="madder">{t("credit.overdue_amount", { amount: formatNumber(row.overdue) })}</Chip>
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted">{t("credit.customer.no_debt")}</span>
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
});
