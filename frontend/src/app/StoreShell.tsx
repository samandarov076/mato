import { Suspense, useEffect, useRef } from "react";
import { useAutoLock } from "@/shared/useAutoLock";
import { feedback } from "@/shared/feedback";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  Layers,
  Lock,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth, useCurrentUser } from "@/modules/auth/AuthProvider";
import { Bell } from "@/modules/notifications/Bell";
import { Loading } from "@/shared/ui/feedback";
import { Selvedge } from "@/shared/ui/brand";
import { HeaderControls } from "@/shared/ui/HeaderControls";
import { TONES, type Tone } from "@/shared/ui/tones";

/** Pastki menyu (docs/04-eskizlar.md, 1-eskiz). Har bo'limning o'z rangi — ko'z bilan tez topiladi. */
const STORE_NAV: { key: string; icon: LucideIcon; tone: Tone; to: string }[] = [
  { key: "sale", icon: ShoppingCart, tone: "leaf", to: "/" },
  { key: "my_sales", icon: Receipt, tone: "indigo", to: "/sales" },
  { key: "customers", icon: Users, tone: "saffron", to: "/customers" },
  { key: "stock", icon: Layers, tone: "sky", to: "/stock" },
  { key: "transfers", icon: ArrowLeftRight, tone: "coral", to: "/transfers" },
  { key: "close_batch", icon: PackageCheck, tone: "plum", to: "/close" },
];

/** Do'kon qurilmasidagi qobiq: tepada do'kon va sotuvchi, qulf tugmasi; pastda menyu. */
export function StoreShell() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { user, business, store } = useCurrentUser();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const section = pathname.split("/")[1];
  const activeIndex = STORE_NAV.findIndex((item) => (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)));

  useAutoLock(business?.autolock_minutes ?? 30, logout);

  // Sahifa almashganda: yengil "shuv" tovushi; fokus asosiy qismga (skaner maydoni o'zi fokus olsa — tegilmaydi)
  useEffect(() => {
    feedback("swish");
    if (document.activeElement === document.body) main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col pt-1">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-panel focus:px-3 focus:py-2 focus:shadow-pop"
      >
        {t("nav.skip")}
      </a>
      <div className="fixed inset-x-0 top-0 z-30">
        <Selvedge />
      </div>

      {/* Fon shaffof emas: planshetda har kadrda xiralashtirish qimmat */}
      <header className="sticky top-1 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-panel px-3 sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-5">{store?.name ?? business?.name}</p>
          {/* Sotuvchi ismi doim ko'rinadi — har amal kimning nomidan yozilayotgani aniq bo'lsin.
              Telefonda joy tor: ism do'kon nomi ostida turadi */}
          <p className="truncate text-[13px] leading-4 text-muted sm:hidden">{user.full_name}</p>
          {store && <p className="hidden truncate text-[13px] leading-4 text-muted sm:block">{business?.name}</p>}
        </div>
        <p className="hidden min-w-0 truncate text-right text-sm sm:block">
          <span className="text-muted">{t("store.seller")}: </span>
          <span className="font-medium">{user.full_name}</span>
        </p>
        <Bell />
        <HeaderControls />
        <button
          type="button"
          onClick={(event) => {
            feedback("tap", event);
            void logout();
          }}
          aria-label={t("store.lock")}
          className="pressable inline-flex h-10 shrink-0 items-center gap-2 rounded-control border border-line bg-panel px-3 text-sm font-medium hover:bg-indigo-soft"
        >
          <Lock className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("store.lock")}</span>
        </button>
      </header>

      <main
        id="main"
        ref={main}
        tabIndex={-1}
        className="mx-auto w-full max-w-[1760px] flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 sm:pt-8 lg:px-8"
      >
        <div key={section} className="animate-fade">
          <Suspense fallback={<Loading className="mt-6" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <nav
        aria-label={t("nav.menu")}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel pb-[env(safe-area-inset-bottom,0px)]"
      >
        <ul className="relative mx-auto grid max-w-3xl grid-cols-6">
          {/* Joriy bo'limning rangli "tabletkasi" — bitta element, bo'limlar orasida prujina bilan siljiydi */}
          {activeIndex >= 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-[10px] w-1/6 transition-transform duration-slow ease-spring-soft"
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            >
              <span className={`mx-auto block h-7 w-12 rounded-full transition-colors duration-base ${TONES[STORE_NAV[activeIndex].tone].solid}`} />
            </span>
          )}
          {STORE_NAV.map(({ key, icon: Icon, tone, to }) => (
            <li key={key}>
              <NavLink
                to={to}
                end={to === "/"}
                onClick={(event) => feedback("tap", event)}
                className="flex h-16 flex-col items-center justify-start gap-0.5 px-0.5 pt-[10px] transition-transform duration-fast active:scale-90"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`relative z-10 grid h-7 w-12 place-items-center rounded-full transition-colors duration-base ${
                        isActive ? "text-panel" : TONES[tone].text
                      }`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span
                      className={`line-clamp-2 text-center text-[11px] leading-[13px] ${
                        isActive ? `font-semibold ${TONES[tone].text}` : "text-muted"
                      }`}
                    >
                      {/* Telefonda (390px) uzun nomlar sig'maydi — qisqa nomi; planshetdan boshlab to'liq */}
                      <span className="sm:hidden">{t(`store.nav_short.${key}`, { defaultValue: t(`store.nav.${key}`) })}</span>
                      <span className="hidden sm:inline">{t(`store.nav.${key}`)}</span>
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
