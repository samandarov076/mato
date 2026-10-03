import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Delete, KeyRound } from "lucide-react";
import { ApiError, type DeviceStatus } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Logo, Selvedge } from "@/shared/ui/brand";
import { HeaderControls } from "@/shared/ui/HeaderControls";
import { useAuth } from "./AuthProvider";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const keyBase =
  "grid size-[72px] place-items-center rounded-full border text-[26px] font-medium transition-[transform,box-shadow,background-color,color] duration-100 active:translate-y-1 disabled:pointer-events-none disabled:opacity-40";
// Raqam klavishi: bo'rtib turadi (pastki qirra + soya), bosilganda cho'kadi
const keyClass = `${keyBase} border-edge bg-panel text-ink shadow-[0_4px_0_rgb(var(--edge)),0_10px_18px_-10px_rgb(26_29_41/0.35)] hover:bg-indigo-soft active:bg-indigo active:text-panel active:shadow-none`;

/** Blok tugashiga qolgan soniyalar (0 — bloklanmagan). */
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** Do'kon qurilmasidagi kirish: sotuvchi faqat 4 xonali PIN teradi. */
export function PinPage({
  device,
  onUsePassword,
}: {
  device: DeviceStatus;
  /** Biznes egasi shu qurilmada o'z paroli bilan kirmoqchi bo'lsa */
  onUsePassword: () => void;
}) {
  const { t } = useTranslation();
  const { pinLogin, reloadDevice } = useAuth();
  const errorText = useErrorText();
  const [digits, setDigits] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // har xatoda chayqalish qayta ishga tushishi uchun
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const secondsLeft = useSecondsLeft(lockedUntil);
  const locked = secondsLeft > 0;
  const disabled = checking || locked;

  const press = useCallback(
    (digit: string) => {
      if (disabled) return;
      feedback("tick");
      setError(null);
      setDigits((current) => (current.length < PIN_LENGTH ? current + digit : current));
    },
    [disabled],
  );

  const erase = useCallback(() => {
    if (disabled) return;
    feedback("tick");
    setDigits((current) => current.slice(0, -1));
  }, [disabled]);

  // To'rtinchi raqam terilishi bilan o'zi tekshiriladi — "Kirish" tugmasi kerak emas
  useEffect(() => {
    if (digits.length !== PIN_LENGTH || checking) return;
    setChecking(true);
    pinLogin(digits)
      .then(() => feedback("success"))
      .catch(async (failure: unknown) => {
      setDigits("");
      feedback("error");
      const code = failure instanceof ApiError ? failure.code : "";
      if (code === "device_not_bound") {
        await reloadDevice(); // qurilma uzilgan — oddiy kirish sahifasi ochiladi
        return;
      }
      if (code === "pin_locked" && failure instanceof ApiError) {
        setLockedUntil(Date.now() + (failure.retryAfter ?? 300) * 1000);
      } else {
        setError(errorText(failure));
        setAttempt((n) => n + 1);
      }
      setChecking(false);
    });
  }, [digits, checking, pinLogin, reloadDevice, errorText]);

  // Klaviaturasi bor qurilmalar uchun
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement) return;
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") erase();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, erase]);

  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <Selvedge />
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <Logo compact />
        <HeaderControls />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <p className="text-sm text-muted">{device.business?.name}</p>
        <h1 className="mt-1 text-center text-[28px] font-semibold leading-tight tracking-tight">
          {device.store?.name}
        </h1>

        <p className="mt-7 text-muted">{t(locked ? "pin.locked_title" : "pin.prompt")}</p>

        <div
          key={attempt}
          role="img"
          aria-label={t("pin.entered", { count: digits.length, total: PIN_LENGTH })}
          className={`mt-4 flex gap-4 ${error ? "animate-shake" : ""}`}
        >
          {Array.from({ length: PIN_LENGTH }, (_, index) => (
            <span
              key={index}
              // To'lganda prujina bilan kattalashadi; tekshirilayotganda to'lqin bo'lib ko'tariladi
              className={`size-4 rounded-full border-2 transition-[background-color,border-color,transform] duration-base ease-spring ${
                checking ? "animate-wave" : ""
              } ${
                index < digits.length
                  ? "scale-125 border-leaf bg-leaf"
                  : error
                    ? "border-madder"
                    : "border-muted"
              }`}
              style={checking ? { animationDelay: `${index * 80}ms` } : undefined}
            />
          ))}
        </div>

        <p
          aria-live="polite"
          className={`mt-4 min-h-[48px] max-w-xs text-center text-sm ${locked ? "text-ink" : "text-madder"}`}
        >
          {locked ? t("pin.locked_text", { time: clock }) : error}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-4">
          {KEYS.map((key) => (
            <button key={key} type="button" disabled={disabled} onClick={() => press(key)} className={keyClass}>
              {key}
            </button>
          ))}
          <span />
          <button type="button" disabled={disabled} onClick={() => press("0")} className={keyClass}>
            0
          </button>
          <button
            type="button"
            disabled={disabled || digits.length === 0}
            onClick={erase}
            aria-label={t("pin.delete")}
            className={`${keyBase} border-transparent text-muted hover:text-ink`}
          >
            <Delete className="size-7" aria-hidden="true" />
          </button>
        </div>

        {/* Biznes egasi uchun: parol bilan kirib, boshqaruvga qaytish yoki qurilmani uzish */}
        <Button variant="secondary" onClick={onUsePassword} className="mt-9 text-indigo shadow-card">
          <KeyRound className="size-4" aria-hidden="true" />
          {t("pin.use_password")}
        </Button>
      </main>
    </div>
  );
}
