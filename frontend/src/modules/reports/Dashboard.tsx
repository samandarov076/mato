import { useId, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  ChartColumn,
  ChevronRight,
  HandCoins,
  House,
  Info,
  PackageMinus,
  Ruler,
  ShoppingBag,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  describe,
  eventStyle,
  notificationKeys,
  type Notification,
  type NotificationPage,
} from "@/modules/notifications/messages";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDateTime, formatDayMonth, formatDecimal, formatLongDate, formatNumber } from "@/shared/format";
import { Card, cardTitle, tileClass } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Skeleton } from "@/shared/ui/feedback";
import { FabricStack } from "@/shared/ui/brand";
import { IconChip } from "@/shared/ui/list";
import { CountUp, Tilt } from "@/shared/ui/motion";
import { PageTitle } from "@/shared/ui/PageTitle";
import { Stat } from "@/shared/ui/Stat";
import { focusRing, TONES, type Tone } from "@/shared/ui/tones";
import { AgingRow } from "@/modules/credit/AgingRow";
import { Bars, Change } from "./parts";
import { reportsKeys, revenue, type Dashboard as Board, type DashboardPeriod } from "./types";

type Store = { id: number; name: string };

/**
 * Biznes egasining bosh sahifasi (docs/04-eskizlar.md, 3-eskiz): savdo, tushum, foyda; nasiya, kam qoldiq,
 * metr farqi; 30 kunlik grafik va e'tibor talab qiladigan xabarlar. Hamma raqam davr va do'konga bo'ysunadi.
 */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const sum = t("settings.units.sum");
  const [period, setPeriod] = useState<DashboardPeriod>("day");
  const [store, setStore] = useState("");

  const stores = useQuery({
    queryKey: ["locations", "stores"],
    queryFn: () => api<Store[]>("/locations?type=store"),
  });
  const board = useQuery({
    queryKey: reportsKeys.dashboard(period, store),
    queryFn: () =>
      api<Board>(`/reports/dashboard?${new URLSearchParams({ period, ...(store ? { store_id: store } : {}) })}`),
    refetchInterval: 60_000, // do'konlarda sotuv davom etadi — raqamlar o'zi yangilanadi
    placeholderData: keepPreviousData, // davr almashganda kartochkalar yo'qolib-paydo bo'lmaydi, sonlar joyida o'zgaradi
  });
  const data = board.data;
  const shops = stores.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-52">
          <PageTitle
            icon={House}
            tone="indigo"
            sub={
              data && data.date_from !== data.date_to
                ? `${formatDate(data.date_from)} – ${formatDate(data.date_to)}`
                : formatLongDate(new Date(), i18n.language)
            }
          >
            {t(`dashboard.period.${period}`)}
          </PageTitle>
        </div>
        <Segmented<DashboardPeriod>
          label={t("reports.period")}
          value={period}
          onChange={setPeriod}
          options={[
            { value: "day", label: t("dashboard.period.day") },
            { value: "week", label: t("dashboard.period.week") },
            { value: "month", label: t("dashboard.period.month") },
          ]}
        />
        {shops.length > 1 && (
          <select
            aria-label={t("sales.store")}
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className={`h-11 rounded-control border border-edge bg-panel px-3 text-[16px] focus:border-indigo ${focusRing}`}
          >
            <option value="">{t("dashboard.all_stores")}</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Birinchi yuklanish: kartochkalar o'rnida skelet — sahifa sakramaydi (davr almashganda eski raqamlar turadi) */}
      {board.isLoading && !data && (
        <div role="status" aria-label={t("loading")} className="mt-5">
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-[132px] rounded-card" />
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-[132px] rounded-card" />
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Skeleton className="h-[260px] rounded-card" />
            <Skeleton className="h-[260px] rounded-card" />
          </div>
        </div>
      )}
      {board.isError && (
        <div className="mt-5">
          <Alert>{errorText(board.error)}</Alert>
        </div>
      )}

      {data && (
        <>
          {/* Asosiy raqamlar: savdo (eng muhimi — rangli kartochkada), tushum, foyda */}
          <section aria-label={t("dashboard.money")} className="stagger mt-5 grid gap-4 md:grid-cols-3">
            <Tilt
              glare
              max={7}
              className="rounded-card bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-card"
            >
              <FabricStack size={58} layers={3} still className="tilt-pop absolute -top-1 right-1 hidden min-[420px]:block" />
              <p className="flex items-center gap-2 text-sm text-white">
                <span className="grid size-8 place-items-center rounded-lg bg-white/15" aria-hidden="true">
                  <ShoppingBag className="size-[18px]" />
                </span>
                {t("reports.sales")}
              </p>
              <p className="mt-3 whitespace-nowrap text-[30px] font-semibold leading-9 tabular-nums">
                <CountUp value={data.current.sales} /> <span className="text-base font-normal text-white">{sum}</span>
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white">
                <Change current={data.current.sales} previous={data.previous.sales} onColor />
                {t("dashboard.sales_count", { count: data.current.count })}
              </p>
            </Tilt>
            <Revenue cash={data.current.cash ?? 0} card={data.current.card ?? 0} total={revenue(data.current) ?? 0} />
            <Profit current={data.current.profit} previous={data.previous.profit} />
          </section>

          {/* Nazorat: nasiya, kam qoldiq, metr farqi — bosilsa tegishli (filtrlangan) sahifa ochiladi */}
          <section aria-label={t("dashboard.watch")} className="stagger mt-4 grid gap-4 md:grid-cols-3">
            {/* Nasiya — to'g'ri mijozlar ro'yxatiga: muddati o'tgan bo'lsa eng eskisidan, bo'lmasa qarzi kattasidan */}
            <Watch
              to={data.debt_overdue > 0 ? "/customers?only=overdue&sort=oldest" : "/customers?only=debtors&sort=debt"}
              icon={HandCoins}
              tone="saffron"
              label={t("nav.credit")}
              value={`${formatNumber(data.debt_total)} ${sum}`}
            >
              <span className={data.debt_overdue > 0 ? "font-medium text-madder" : ""}>
                {t("dashboard.overdue", { amount: formatNumber(data.debt_overdue) })}
              </span>
              {/* Qancha kechikkani: 1–30 · 31–60 · 60+ kun (60+ — qizil) */}
              {data.debt_aging && data.debt_overdue > 0 && <AgingRow aging={data.debt_aging} compact />}
            </Watch>
            <Watch
              to={`/stock?only=low${store ? `&location_id=${store}` : ""}`}
              icon={PackageMinus}
              tone="coral"
              label={t("inventory.stock.only_low")}
              value={t("dashboard.low_items", { count: data.low_stock })}
              valueClass={data.low_stock > 0 ? "text-coral" : ""}
            >
              {t("dashboard.low_note")}
            </Watch>
            <Watch
              to="/differences"
              icon={Ruler}
              tone="madder"
              label={t("dashboard.diff", { period: t(`dashboard.period.${period}`).toLowerCase() })}
              value={`${formatNumber(data.diff_amount)} ${sum}`}
            >
              <span className={Number(data.diff_m) > 0 ? "font-medium text-madder" : ""}>
                {Number(data.diff_m) > 0
                  ? t("inventory.diff.short", { meters: formatDecimal(data.diff_m) })
                  : t("inventory.diff.none")}
              </span>
            </Watch>
          </section>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card title={t("dashboard.chart")} icon={ChartColumn} tone="indigo">
              <Bars
                summary={t("dashboard.chart_hint")}
                height={190}
                axis={[
                  formatDayMonth(data.chart[0].day, i18n.language),
                  formatDayMonth(data.chart[Math.floor(data.chart.length / 2)].day, i18n.language),
                  t("dashboard.period.day"),
                ]}
                bars={data.chart.map((day) => ({
                  key: day.day,
                  value: day.sales,
                  label: `${formatDayMonth(day.day, i18n.language)} — ${formatNumber(day.sales)} ${sum}`,
                  strong: day.day >= data.date_from && day.day <= data.date_to,
                }))}
              />
            </Card>
            <Attention />
          </div>
        </>
      )}
    </div>
  );
}

/** Tushum: jami, naqd (yashil) va karta (ko'k) ulushi — hisobot sahifasidagi bilan bir xil Stat kartochkasi */
function Revenue({ cash, card, total }: { cash: number; card: number; total: number }) {
  const { t } = useTranslation();
  const sum = t("settings.units.sum");
  const share = total > 0 ? Math.round((Math.max(cash, 0) / (Math.max(cash, 0) + Math.max(card, 0) || 1)) * 100) : 0;
  return (
    <Stat label={t("reports.revenue")} value={total} unit={sum} icon={Wallet} accent="sky">
      {/* Ikki bo'lak orasida panel rangli chiziq — yashil va ko'k yonma-yon qo'yilsa ajralmas edi */}
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
        {total > 0 && (
          <>
            <span className="bg-leaf" style={{ width: `${share}%` }} />
            <span className="border-l-2 border-panel bg-sky" style={{ width: `${100 - share}%` }} />
          </>
        )}
      </div>
      <p className="mt-2">
        <span className="mr-1.5 inline-block size-2 rounded-full bg-leaf" aria-hidden="true" />
        {t("dashboard.cash", { amount: formatNumber(cash) })}
        <span className="ml-3 mr-1.5 inline-block size-2 rounded-full bg-sky" aria-hidden="true" />
        {t("dashboard.card", { amount: formatNumber(card) })}
      </p>
    </Stat>
  );
}

/** Foyda: o'tgan davr bilan taqqoslash va "qanday hisoblanadi" izohi (tugma bilan ochiladi) */
function Profit({ current, previous }: { current: number; previous: number }) {
  const { t } = useTranslation();
  const sum = t("settings.units.sum");
  const [info, setInfo] = useState(false);
  const noteId = useId();
  return (
    <Stat
      label={t("reports.profit")}
      value={current}
      unit={sum}
      icon={TrendingUp}
      accent="leaf"
      tone={current < 0 ? "text-madder" : "text-leaf"}
      action={
        <button
          type="button"
          aria-label={t("dashboard.profit_info")}
          aria-expanded={info}
          aria-controls={noteId}
          onClick={() => setInfo(!info)}
          className={`-m-1 grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors duration-fast hover:bg-indigo-soft hover:text-indigo active:bg-indigo-soft ${focusRing}`}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <Change current={current} previous={previous} />
      {info && (
        <p id={noteId} role="note" className="mt-2 rounded-control bg-indigo-soft/60 px-3 py-2 text-ink">
          {t("reports.profit_note")}
        </p>
      )}
    </Stat>
  );
}

function Watch({
  to,
  icon,
  tone,
  label,
  value,
  valueClass = "",
  children,
}: {
  to: string;
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  valueClass?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`group lift pressable flex items-center gap-3 transition-[transform,border-color] duration-base hover:-translate-y-1 ${tileClass} ${TONES[tone].hoverBorder} ${focusRing}`}
    >
      <IconChip
        icon={icon}
        tone={tone}
        size="title"
        className="transition-transform duration-base group-hover:-rotate-6 group-hover:scale-110"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">{label}</span>
        <span className={`mt-0.5 block whitespace-nowrap text-xl font-semibold tabular-nums ${valueClass}`}>
          {value}
        </span>
        <span className="mt-0.5 block text-sm text-muted">{children}</span>
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 md:max-lg:hidden"
        aria-hidden="true"
      />
    </Link>
  );
}

/** "E'tibor talab qiladi": o'qilmagan muhim xabarlar. Bosilsa — o'qilgan bo'ladi va tegishli sahifa ochiladi. */
function Attention() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inbox = useQuery({
    queryKey: [...notificationKeys.all, "dashboard"],
    queryFn: () => api<NotificationPage>("/notifications?unread_only=true&limit=6"),
  });
  const items = inbox.data?.items ?? [];
  const reload = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  async function open(item: Notification, link: string | null) {
    await post(`/notifications/${item.id}/read`).catch(() => undefined);
    void reload();
    if (link) navigate(link);
  }

  return (
    <Card>
      {/* Sarlavha yonida amal bor — Card'ning o'z sarlavhasi o'rniga shu klass bilan qo'lda, ko'rinishi bir xil */}
      <div className="flex items-center justify-between gap-3">
        <h2 className={cardTitle}>
          <IconChip icon={BellRing} tone="saffron" size="sm" />
          {t("dashboard.attention")}
        </h2>
        {items.length > 0 && (
          <button
            type="button"
            className={`inline-flex min-h-9 items-center rounded text-sm text-indigo hover:underline ${focusRing}`}
            onClick={() => void post("/notifications/read-all").then(reload)}
          >
            {t("notifications.read_all")}
          </button>
        )}
      </div>
      {inbox.isSuccess && items.length === 0 && <p className="mt-4 text-muted">{t("dashboard.attention_empty")}</p>}
      {items.length > 0 && (
        // Qatorlar kartochka chetigacha cho'ziladi (ro'yxat panelidagi kabi)
        <ul className="-mx-5 mt-4 divide-y divide-line border-t border-line sm:-mx-6">
          {items.map((item) => {
            const { text, link } = describe(item, t);
            const { icon: EventIcon, tone } = eventStyle(item.event_code);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void open(item, link)}
                  className={`pressable flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-page active:bg-page sm:px-6 ${focusRing}`}
                >
                  <IconChip icon={EventIcon} tone={tone} size="sm" className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[15px]">{text}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">{formatDateTime(item.created_at)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {(inbox.data?.unread ?? 0) > items.length && (
        <Link
          to="/notifications"
          className={`-mx-5 -mb-5 block border-t border-line px-5 py-3 text-sm text-indigo hover:underline sm:-mx-6 sm:-mb-6 sm:px-6 ${focusRing}`}
        >
          {t("dashboard.all_notifications", { count: inbox.data?.unread })}
        </Link>
      )}
    </Card>
  );
}
