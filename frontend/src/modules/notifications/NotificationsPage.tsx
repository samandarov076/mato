import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, CheckCheck, ChevronRight } from "lucide-react";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField } from "@/shared/ui/fields";
import { Empty, IconChip, LoadMore, rowClass } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { focusRing } from "@/shared/ui/tones";
import {
  describe,
  eventStyle,
  EVENTS,
  notificationKeys,
  type Notification,
  type NotificationPage,
} from "./messages";

/** Xabarlar: eng yangisi tepada; bosilsa — o'qilgan bo'ladi va tegishli sahifa ochiladi. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [event, setEvent] = useState("");
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inbox = useInfiniteQuery({
    queryKey: notificationKeys.list(event),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      if (event) query.set("event", event);
      if (pageParam !== null) query.set("cursor", String(pageParam));
      return api<NotificationPage>(`/notifications?${query}`);
    },
    getNextPageParam: (last) => last.next_cursor,
  });
  const rows = inbox.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = inbox.data?.pages[0]?.unread ?? 0;
  const reload = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  async function open(item: Notification, link: string | null) {
    setError(null);
    try {
      if (!item.read) {
        await post(`/notifications/${item.id}/read`);
        void reload();
      }
      if (link) navigate(link);
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  async function readAll() {
    setMarking(true);
    setError(null);
    try {
      await post("/notifications/read-all");
      await reload();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setMarking(false);
    }
  }

  return (
    <div>
      <PageTitle
        icon={BellRing}
        tone="indigo"
        action={
          unread > 0 && (
            <Button variant="secondary" size="sm" loading={marking} onClick={() => void readAll()}>
              <CheckCheck className="size-4" aria-hidden="true" />
              {t("notifications.read_all")}
            </Button>
          )
        }
      >
        {t("notifications.title")}
      </PageTitle>

      <div className="mt-5 max-w-sm">
        <SelectField label={t("notifications.event")} value={event} onChange={setEvent}>
          <option value="">{t("common.all")}</option>
          {EVENTS.map((code) => (
            <option key={code} value={code}>
              {t(`notifications.events.${code}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {error && (
        <div className="mt-4">
          <Alert focus>{error}</Alert>
        </div>
      )}

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {inbox.isLoading && <Loading className="px-5 py-6" />}
        {inbox.isError && (
          <div className="p-5">
            <Alert>{errorText(inbox.error)}</Alert>
          </div>
        )}
        {inbox.isSuccess && rows.length === 0 && (
          <Empty icon={BellOff} tone="neutral">
            {t(event ? "notifications.empty_filtered" : "notifications.empty")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {rows.map((item) => {
            const { text, link } = describe(item, t);
            const { icon: EventIcon, tone } = eventStyle(item.event_code);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={(e) => {
                    feedback("tap", e);
                    void open(item, link);
                  }}
                  className={`${rowClass} pressable group flex w-full items-start gap-3 text-left transition-colors hover:bg-page/70 active:bg-indigo-soft ${focusRing} ${
                    item.read ? "" : "bg-indigo-soft/40"
                  }`}
                >
                  {/* Hodisa turi belgisi; o'qilmagan xabarda — yonida nuqta */}
                  <span aria-hidden="true" className="relative shrink-0">
                    <IconChip icon={EventIcon} tone={tone} />
                    {!item.read && (
                      <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-panel bg-indigo" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block break-words ${item.read ? "" : "font-medium"}`}>
                      {!item.read && <span className="sr-only">{t("notifications.unread")}: </span>}
                      {text}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      {t(`notifications.events.${item.event_code}`, { defaultValue: item.event_code })} ·{" "}
                      {formatDateTime(item.created_at)}
                    </span>
                  </span>
                  {link && (
                    <ChevronRight
                      className="mt-3 size-4 shrink-0 text-muted transition-colors group-hover:text-indigo"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {inbox.hasNextPage && (
        <LoadMore loading={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()} />
      )}
    </div>
  );
}
