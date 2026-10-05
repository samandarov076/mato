import { Suspense, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth, useCurrentUser } from "@/modules/auth/AuthProvider";
import { roleKey } from "@/modules/auth/ProfilePage";
import { Logo, Selvedge } from "@/shared/ui/brand";
import { feedback } from "@/shared/feedback";
import { HeaderControls } from "@/shared/ui/HeaderControls";
import { iconButton } from "@/shared/ui/Button";
import { focusRing, TONES } from "@/shared/ui/tones";
import { Bell } from "@/modules/notifications/Bell";
import { Loading } from "@/shared/ui/feedback";
import { useAutoLock } from "@/shared/useAutoLock";
import { navFor } from "./nav";

const itemBase = "group flex h-11 items-center gap-3 rounded-control px-2 text-[15px] transition-colors";
const chipBase =
  "chip-3d grid size-8 shrink-0 place-items-center rounded-lg transition-[transform,background-color,color] duration-200 group-hover:-rotate-6 group-hover:scale-110 group-active:scale-95";

/** React 18 `inert`ni bilmaydi — atribut matn sifatida beriladi (ochiq menyu ortidagi sahifa fokus olmaydi) */
const inert = (on: boolean) => (on ? ({ inert: "" } as unknown as Record<string, string>) : {});

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Menyu tarkibi — kompyuterda yon panelda, telefonda chapdan ochiladigan oynada. */
function Sidebar({ onClose, closeRef }: { onClose?: () => void; closeRef?: RefObject<HTMLButtonElement> }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { user } = useCurrentUser();
  const { pathname } = useLocation();
  /** Bo'limning ichki sahifasidamizmi (masalan "Ombor" → /transfers/5) */
  const within = (prefix?: string | string[]) =>
    [prefix ?? []].flat().some((item) => pathname.startsWith(item));
  // Platforma egasida profil sahifasi yo'q — uning hisobi server tomonda boshqariladi
  const hasProfile = user.role !== "platform_owner";
  const identity = (
    <>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo text-[13px] font-semibold text-panel"
      >
        {initials(user.full_name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium leading-5">{user.full_name}</span>
        <span className="block truncate text-[13px] leading-5 text-muted">{t(roleKey(user))}</span>
      </span>
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        {/* Logotip — bosh sahifaga (telefonda menyu ham yopiladi) */}
        <Link
          to="/"
          onClick={(event) => {
            feedback("tap", event);
            onClose?.();
          }}
          aria-label={t("nav.home_link")}
          className={`-m-1 rounded-control p-1 ${focusRing}`}
        >
          <Logo />
        </Link>
        {onClose && (
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("nav.close")} className={iconButton}>
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label={t("nav.menu")} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {navFor(user.role).map(({ key, icon: Icon, tone, to, activePrefix }) =>
          to ? (
            <NavLink
              key={key}
              to={to}
              end={to === "/"} // ichki sahifalarda ham bo'lim belgilanib tursin (/settings/journal)
              onClick={(event) => feedback("tap", event)}
              className={({ isActive }) =>
                `${itemBase} ${
                  isActive || within(activePrefix)
                    ? `${TONES[tone].soft} font-medium`
                    : "text-ink hover:bg-page"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Har bo'limning o'z rangi; joriy bo'lim belgisi to'q rangda */}
                  <span
                    aria-hidden="true"
                    className={`${chipBase} ${
                      isActive || within(activePrefix) ? `${TONES[tone].solid} text-panel` : TONES[tone].chip
                    }`}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  {t(`nav.${key}`)}
                </>
              )}
            </NavLink>
          ) : (
            <div key={key} aria-disabled="true" className={`${itemBase} cursor-default text-muted/70`}>
              <span aria-hidden="true" className={`${chipBase} bg-line/50`}>
                <Icon className="size-[18px]" />
              </span>
              <span className="flex-1">{t(`nav.${key}`)}</span>
              <span className="rounded-full border border-line px-2 py-px text-[11px] leading-4 text-muted">
                {t("nav.soon")}
              </span>
            </div>
          ),
        )}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        {hasProfile ? (
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-control p-2 transition-colors ${
                isActive ? "bg-indigo-soft" : "hover:bg-page"
              }`
            }
          >
            {identity}
          </NavLink>
        ) : (
          <div className="flex items-center gap-3 p-2">{identity}</div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className={`${itemBase} mt-1 w-full text-muted hover:bg-page hover:text-ink`}
        >
          <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { device, logout } = useAuth();
  const { user, business } = useCurrentUser();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Yopilish animatsiyasi tugaguncha menyu DOM'da turadi
  const [menuMounted, setMenuMounted] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const section = pathname.split("/")[1];
  // Ega O'Z biznesining do'kon planshetida parol bilan kirgan (begona biznes qurilmasi — oddiy brauzer):
  // sessiya sotuvchinikidek avto-qulflanadi. Eslatma (banner) ko'rsatilmaydi — PIN ekraniga "Chiqish" qaytaradi
  // (docs/03-details/02-tuzilma.md, chekka holatlar)
  const onOwnDevice =
    user.role === "owner" && !!device?.bound && !!business && device.business?.id === business.id;
  useAutoLock(business?.autolock_minutes ?? 30, logout, onOwnDevice);

  // Boshqa sahifaga o'tilganda telefon menyusi yopiladi
  useEffect(() => setMenuOpen(false), [pathname]);

  // Sahifa almashganda fokus asosiy qismga tushadi (klaviatura/ekran o'quvchi menyuni qayta kezib chiqmaydi).
  // Maydonga o'zi fokus tushgan bo'lsa (sotuv ekranidagi skaner) — tegilmaydi.
  useEffect(() => {
    if (document.activeElement === document.body) main.current?.focus({ preventScroll: true });
    feedback("swish");
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) {
      setMenuMounted(true);
      requestAnimationFrame(() => closeButton.current?.focus());
      return;
    }
    if (menuMounted) menuButton.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  /** Tab fokusni menyu ichida aylantiradi (ochiq oynadan tashqariga chiqmaydi) */
  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !drawer.current) return;
    const focusable = drawer.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="min-h-dvh pt-1">
      {/* Klaviatura foydalanuvchisi uchun: birinchi Tab — to'g'ri asosiy qismga */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-panel focus:px-3 focus:py-2 focus:shadow-pop"
      >
        {t("nav.skip")}
      </a>
      <div className="fixed inset-x-0 top-0 z-30" {...inert(menuOpen)}>
        <Selvedge />
      </div>

      <div className="flex" {...inert(menuOpen)}>
        {/* Yon menyu faqat keng ekranda (1280px+): torroqda joy kontentga qoladi, menyu — tugma ortida */}
        <aside className="sticky top-1 hidden h-[calc(100dvh-0.25rem)] w-64 shrink-0 border-r border-line bg-panel xl:block">
          <Sidebar />
        </aside>

        <div className="flex min-h-[calc(100dvh-0.25rem)] min-w-0 flex-1 flex-col">
          {/* Shaffof + xira fon faqat kuchli kompyuterlarda (xl); planshetda — oddiy, chizish arzon */}
          <header className="sticky top-1 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:px-6 lg:px-8 xl:bg-panel/90 xl:backdrop-blur">
            <button
              ref={menuButton}
              type="button"
              onClick={(event) => {
                feedback("tap", event);
                setMenuOpen(true);
              }}
              aria-label={t("nav.menu")}
              className={`${iconButton} xl:hidden`}
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1 truncate font-medium">
              {business?.name ?? t("platform.title")}
            </span>
            {business && <Bell />}
            <HeaderControls />
          </header>

          <main
            id="main"
            ref={main}
            tabIndex={-1}
            className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 2xl:px-10"
          >
            {/* Bo'lim almashganda sahifa yumshoq paydo bo'ladi (kartochkalar o'zi ko'tariladi — ikki marta siljimaydi) */}
            <div key={section} className="animate-fade">
              <Suspense fallback={<Loading className="mt-6" />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      {menuMounted && (
        <div
          className="fixed inset-0 z-40 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("nav.menu")}
          onKeyDown={trapTab}
        >
          <button
            type="button"
            aria-label={t("nav.close")}
            onClick={() => setMenuOpen(false)}
            className={`absolute inset-0 cursor-default bg-black/45 transition-opacity duration-base ${
              menuOpen ? "animate-fade" : "opacity-0"
            }`}
          />
          {/* Kirish — keyframe (DOM'ga qo'shilganda), chiqish — transition (tugagach DOM'dan olinadi) */}
          <div
            ref={drawer}
            className={`relative h-full w-72 max-w-[85vw] bg-panel shadow-pop transition-transform duration-base ease-exit ${
              menuOpen ? "animate-drawer-in" : "-translate-x-full"
            }`}
            onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && !menuOpen) setMenuMounted(false);
            }}
          >
            <Sidebar onClose={() => setMenuOpen(false)} closeRef={closeButton} />
          </div>
        </div>
      )}
    </div>
  );
}
