import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Send } from "lucide-react";
import { api, del, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Toggle } from "@/shared/ui/controls";
import { Alert, Loading, Spinner } from "@/shared/ui/feedback";
import { focusRing } from "@/shared/ui/tones";

type Status = {
  /** Platformada bot sozlanganmi */
  configured: boolean;
  linked: boolean;
  username: string | null;
  daily_summary: boolean;
  instant_alerts: boolean;
};

const KEY = ["telegram"];

/**
 * Profildagi Telegram bo'limi: akkauntni bir martalik havola orqali ulash, nimalar kelishini tanlash, uzish.
 * Havola ochilgach sahifa o'zi tekshirib turadi — botda "Start" bosilishi bilan "ulandi" ko'rinadi.
 */
export function TelegramCard() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: KEY,
    queryFn: () => api<Status>("/telegram"),
    // Ulash kutilayotganda har 3 soniyada tekshiriladi
    refetchInterval: (query) => (botUrl && !query.state.data?.linked ? 3000 : false),
  });
  const data = status.data;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: KEY });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    run(async () => setBotUrl((await post<{ url: string }>("/telegram/link")).url));
  const setPrefs = (changes: Partial<Pick<Status, "daily_summary" | "instant_alerts">>) =>
    data &&
    run(() =>
      patch("/telegram", {
        daily_summary: data.daily_summary,
        instant_alerts: data.instant_alerts,
        ...changes,
      }),
    );

  return (
    <Card title="Telegram" icon={Send} tone="sky">
      {status.isLoading && <Loading />}
      {status.isError && <Alert>{errorText(status.error)}</Alert>}
      {error && (
        <div className="mb-4">
          <Alert focus>{error}</Alert>
        </div>
      )}

      {data && !data.configured && <p className="text-muted">{t("telegram.not_configured")}</p>}

      {data?.configured && !data.linked && (
        <>
          <p className="text-muted">{t("telegram.intro")}</p>
          {botUrl ? (
            <div className="mt-4 rounded-control bg-indigo-soft/60 p-4">
              <p className="text-sm">{t("telegram.waiting")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {/* Tashqi havola (Telegram) — Button bilan bir xil ko'rinish va bosilish */}
                <a
                  href={botUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`press inline-flex h-11 items-center gap-2 rounded-control bg-indigo px-4 font-medium text-panel transition-colors hover:bg-indigo-2 ${focusRing}`}
                >
                  <ExternalLink className="size-[18px]" aria-hidden="true" />
                  {t("telegram.open_bot")}
                </a>
                <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
                  <Spinner /> {t("telegram.checking")}
                </span>
              </div>
            </div>
          ) : (
            <Button className="mt-4" loading={busy} onClick={() => void connect()}>
              {!busy && <Send className="size-[18px]" aria-hidden="true" />}
              {t("telegram.connect")}
            </Button>
          )}
        </>
      )}

      {data?.linked && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="mr-2 inline-block size-2 rounded-full bg-leaf" aria-hidden="true" />
              {data.username
                ? t("telegram.linked_as", { username: data.username })
                : t("telegram.linked")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => del("/telegram")).then(() => setBotUrl(null))}
            >
              {t("telegram.disconnect")}
            </Button>
          </div>
          <div className="mt-4 divide-y divide-line border-t border-line">
            {(["daily_summary", "instant_alerts"] as const).map((field) => (
              <div key={field} className="flex items-center justify-between gap-6 py-3.5 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium">{t(`telegram.${field}.title`)}</p>
                  <p className="mt-0.5 text-sm text-muted">{t(`telegram.${field}.hint`)}</p>
                </div>
                <Toggle
                  checked={data[field]}
                  onChange={(value) => void setPrefs({ [field]: value })}
                  label={t(`telegram.${field}.title`)}
                  disabled={busy}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
