import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, Info, LoaderCircle } from "lucide-react";
import { feedback } from "@/shared/feedback";
import { Button } from "./Button";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />;
}

/** Butun sahifa yuklanayotganda (masalan, sessiya tekshirilayotganda) */
export function PageLoader() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center text-muted" role="status">
      <span className="inline-flex items-center gap-2.5">
        <Spinner className="size-5" />
        {t("loading")}
      </span>
    </div>
  );
}

/** Sahifa ichidagi yuklanish qatori — ekran o'quvchi uchun ham holat (role=status) */
export function Loading({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p role="status" className={`flex items-center gap-2 text-muted ${className}`}>
      <Spinner /> {t("loading")}
    </p>
  );
}

/** Skelet: ma'lumot kelguncha kartochka/qator o'rnida turadi — sahifa sakramaydi */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block rounded-lg bg-line/60 ${className}`} />;
}

const tones = {
  error: { box: "border-madder/25 bg-madder-soft text-madder", Icon: CircleAlert, sound: "error" as const },
  success: { box: "border-leaf/25 bg-leaf-soft text-leaf", Icon: CircleCheck, sound: "success" as const },
  info: { box: "border-line bg-indigo-soft/60 text-ink", Icon: Info, sound: null },
};

/**
 * Bildirish. Xato — tovush va tebranish bilan, muvaffaqiyat — qo'ng'iroq bilan (bir marta, paydo bo'lganda).
 * `focus` — paydo bo'lganda ko'rinadigan joyga suriladi va fokus oladi: tugma ekranning pastida,
 * xabar tepasida bo'lsa ham foydalanuvchi uni ko'radi.
 */
export function Alert({
  tone = "error",
  focus = false,
  children,
}: {
  tone?: keyof typeof tones;
  focus?: boolean;
  children: ReactNode;
}) {
  const { box, Icon, sound } = tones[tone];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sound) feedback(sound);
    if (focus) {
      requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        ref.current?.focus({ preventScroll: true });
      });
    }
    // faqat paydo bo'lganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={focus ? -1 : undefined}
      role={tone === "error" ? "alert" : "status"}
      className={`flex animate-rise items-start gap-2.5 rounded-control border px-3.5 py-2.5 text-sm outline-none ${box}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Bir qatorli tasdiq ("Rostdan ham ...?" + Ha / Yo'q). Paydo bo'lganda fokus "Yo'q" tugmasiga tushadi,
 * yopilganda — ochgan tugmaga qaytadi (klaviatura va ekran o'quvchi uchun fokus yo'qolmaydi).
 */
export function ConfirmBar({
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = true,
  returnFocusTo,
}: {
  text: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
  /** Tasdiq yopilganda fokus qaytadigan element (odatda ochgan tugma) */
  returnFocusTo?: RefObject<HTMLElement>;
}) {
  const { t } = useTranslation();
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const trigger = returnFocusTo?.current;
    return () => trigger?.focus({ preventScroll: true });
  }, [returnFocusTo]);

  return (
    <div
      role="group"
      aria-labelledby={id}
      className={`flex animate-rise flex-wrap items-center gap-2 rounded-control px-3.5 py-2.5 ${
        danger ? "bg-madder-soft" : "bg-page"
      }`}
    >
      <p id={id} className={`min-w-0 flex-1 basis-56 text-sm ${danger ? "text-madder" : ""}`}>
        {text}
      </p>
      <Button variant={danger ? "danger" : "primary"} size="sm" loading={busy} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <button
        ref={cancelRef}
        type="button"
        onClick={(event) => {
          feedback("tap", event);
          onCancel();
        }}
        className="inline-flex h-9 items-center justify-center rounded-control border border-line bg-panel px-3 text-sm font-medium text-ink transition-colors hover:bg-indigo-soft active:scale-[0.98]"
      >
        {cancelLabel ?? t("common.keep")}
      </button>
    </div>
  );
}
