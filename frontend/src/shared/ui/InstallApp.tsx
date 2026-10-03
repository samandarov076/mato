import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, EllipsisVertical, Info, type LucideIcon, MonitorDown, Share, SquarePlus, X } from "lucide-react";
import { feedback } from "@/shared/feedback";
import { browserKind, type InstallMode, useInstall } from "@/shared/pwa";
import { Button, iconButton } from "./Button";
import { focusRing } from "./tones";


/** Brauzer o'z oynasini bermasa — shu brauzerda qo'lda o'rnatish yo'li (1–2 qadam) */
function steps(mode: InstallMode): { title: string; items: [LucideIcon, string][] } {
  if (mode === "ios") {
    return { title: "pwa.ios_title", items: [[Share, "pwa.ios_step_share"], [SquarePlus, "pwa.ios_step_add"]] };
  }
  switch (browserKind()) {
    case "chromium":
      return {
        title: "pwa.manual_title",
        items: [[MonitorDown, "pwa.chromium_step_icon"], [EllipsisVertical, "pwa.chromium_step_menu"]],
      };
    case "android":
      return { title: "pwa.manual_title", items: [[EllipsisVertical, "pwa.android_step_menu"]] };
    case "safari":
      return { title: "pwa.manual_title", items: [[SquarePlus, "pwa.safari_step_dock"]] };
    default:
      return { title: "pwa.firefox_title", items: [[Info, "pwa.firefox_step"]] };
  }
}

function Steps({ id, mode, onClose }: { id: string; mode: InstallMode; onClose: () => void }) {
  const { t } = useTranslation();
  const close = useRef<HTMLButtonElement>(null);
  const guide = steps(mode);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] animate-rise rounded-card border border-line bg-panel p-4 text-left text-ink shadow-pop"
    >
      <div className="flex items-start gap-2">
        <p id={`${id}-title`} className="min-w-0 flex-1 font-semibold">
          {t(guide.title)}
        </p>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label={t("pwa.close")}
          className={`-m-1 grid size-8 place-items-center rounded-control text-muted hover:bg-indigo-soft ${focusRing}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ol className="mt-3 space-y-2.5 text-[15px]">
        {guide.items.map(([Icon, key]) => (
          <li key={key} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-5 shrink-0 text-indigo" aria-hidden="true" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function useInstallAction() {
  const { mode, install } = useInstall();
  const [showSteps, setShowSteps] = useState(false);
  async function run(event: { clientX?: number }) {
    feedback("tap", event);
    if (mode !== "prompt") return setShowSteps((open) => !open); // brauzer oynasi yo'q — yo'riqnoma
    if (await install()) feedback("success");
  }
  return { mode, run, showSteps, closeSteps: () => setShowSteps(false) };
}

/** Yuqori paneldagi belgi — har ekranda; ilova o'rnatilgan bo'lsa yoki brauzer qo'llamasa ko'rinmaydi */
export function InstallIconButton() {
  const { t } = useTranslation();
  const { mode, run, showSteps, closeSteps } = useInstallAction();
  const id = useId();
  if (!mode) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => void run(event)}
        aria-label={t("pwa.install")}
        title={t("pwa.install")}
        aria-expanded={mode !== "prompt" ? showSteps : undefined}
        className={`${iconButton} ${focusRing}`}
      >
        <Download className="size-5" aria-hidden="true" />
      </button>
      {showSteps && <Steps id={id} mode={mode} onClose={closeSteps} />}
    </div>
  );
}

/** Kirish sahifasidagi ko'zga tashlanadigan tugma: nima uchun o'rnatish kerakligi bilan */
export function InstallBanner() {
  const { t } = useTranslation();
  const { mode, run, showSteps, closeSteps } = useInstallAction();
  const id = useId();
  if (!mode) return null;
  return (
    <div className="relative mt-8 rounded-card border border-line bg-page p-4">
      <p className="text-sm text-muted">{t("pwa.why")}</p>
      <Button
        type="button"
        variant="secondary"
        block
        className="mt-3"
        silent
        onClick={(event) => void run(event)}
        aria-expanded={mode !== "prompt" ? showSteps : undefined}
      >
        <Download className="size-[18px]" aria-hidden="true" />
        {t("pwa.install")}
      </Button>
      {showSteps && <Steps id={id} mode={mode} onClose={closeSteps} />}
    </div>
  );
}
