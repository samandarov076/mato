import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell as BellIcon } from "lucide-react";
import { api, openStream } from "@/shared/api/client";
import { notificationKeys } from "./messages";

/**
 * Real vaqt: server "yangi xabar bor" signalini yuborganda xabarlar va ombor ma'lumotlari sahifani
 * yangilamasdan qayta olinadi (masalan, ko'chirish keldi — ro'yxatda darhol ko'rinadi).
 * Ulanish uzilsa — o'zi qayta ulanadi; shu paytda ham son har daqiqada yangilanib turadi.
 */
function useLiveNotifications() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;

    let delay = 1000;
    let current: AbortController | null = null;
    // Internet qaytganda yoki planshet uyg'onganda — kutmasdan darhol qayta ulanadi
    const wake = () => {
      delay = 1000;
      current?.abort();
    };
    const onVisible = () => document.visibilityState === "visible" && wake();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisible);

    async function listen() {
      while (!stopped) {
        const connection = new AbortController();
        current = connection;
        const stopOuter = () => connection.abort();
        controller.signal.addEventListener("abort", stopOuter);
        // Server har 20 s "ping" yuboradi; 45 s jim qolsa — ulanish o'lgan, qayta ochiladi
        let watchdog = window.setTimeout(() => connection.abort(), 45_000);
        try {
          const response = await openStream("/notifications/stream", connection.signal);
          delay = 1000;
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            window.clearTimeout(watchdog);
            watchdog = window.setTimeout(() => connection.abort(), 45_000);
            if (done) break;
            if (decoder.decode(value, { stream: true }).includes("data:")) {
              void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
              void queryClient.invalidateQueries({ queryKey: ["inventory"] });
              void queryClient.invalidateQueries({ queryKey: ["sales", "context"] });
            }
          }
        } catch {
          if (stopped) return;
          delay = Math.min(delay * 2, 30_000); // server yo'q — tobora kamroq urinadi
        } finally {
          window.clearTimeout(watchdog);
          controller.signal.removeEventListener("abort", stopOuter);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    void listen();

    return () => {
      stopped = true;
      controller.abort();
      current?.abort();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient]);
}

/** Yuqori paneldagi qo'ng'iroqcha: o'qilmagan xabarlar soni; bosilsa — Xabarlar sahifasi. */
export function Bell() {
  const { t } = useTranslation();
  useLiveNotifications();
  const unread = useQuery({
    queryKey: notificationKeys.count,
    queryFn: () => api<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });
  const count = unread.data?.count ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label={count > 0 ? t("notifications.bell_unread", { count }) : t("notifications.title")}
      className="relative grid size-10 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-indigo-soft hover:text-ink"
    >
      <BellIcon className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-madder px-1 text-[11px] font-medium leading-none text-panel"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
