import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { feedback } from "@/shared/feedback";
import { Spinner } from "./feedback";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "md" | "sm" | "lg";

const variants: Record<Variant, string> = {
  // text-panel: kunduzi oq, tungi rejimda to'q — indigo fon ustida ikkalasida ham o'qiladi
  primary: "press bg-indigo text-panel hover:bg-indigo-2",
  secondary:
    "border border-line bg-panel text-ink hover:bg-indigo-soft active:scale-[0.98] active:bg-indigo-soft",
  ghost: "text-muted hover:bg-indigo-soft hover:text-ink active:scale-[0.98] active:bg-indigo-soft",
  // Qaytarib bo'lmaydigan amallar (masalan, qurilmani uzish)
  danger: "press bg-madder text-panel hover:opacity-90",
  // Pul kiradigan yakuniy amal (sotuvni yakunlash, to'lovni qabul qilish)
  success: "press bg-leaf text-panel hover:opacity-90",
};

// Nazorat to'ri: 36 / 44 / 48 px — kiritish maydonlari (h-11) bilan bir qatorda turadi
const sizes: Record<Size, string> = {
  md: "h-11 px-4",
  sm: "h-9 px-3 text-sm",
  lg: "h-12 px-6 text-[17px]",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-[color,background-color,border-color,transform,opacity] duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-60";

// Xavfli tugma — ogohlantiruvchi tebranish; qolganlari — oddiy "tap"
const SOUND: Record<Variant, "tap" | "warning"> = {
  primary: "tap",
  secondary: "tap",
  ghost: "tap",
  danger: "warning",
  success: "tap",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** So'rov ketayotganda: tugma bosilmaydi va aylanuvchi belgi ko'rinadi */
  loading?: boolean;
  block?: boolean;
  /** Tovush/tebranishsiz (masalan, o'zi sezgi javobini beradigan tugmalar) */
  silent?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  silent = false,
  className = "",
  children,
  disabled,
  type = "button",
  onClick,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${sizes[size]} ${variants[variant]} ${block ? "w-full" : ""} ${className}`}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (!silent) feedback(SOUND[variant], event);
        onClick?.(event);
      }}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Tugma ko'rinishidagi havola (masalan "Yangi sotuv") — Button bilan bir xil o'lchov va bosilish. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
  children,
  onClick,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <Link
      className={`${base} ${sizes[size]} ${variants[variant]} ${block ? "w-full" : ""} ${className}`}
      onClick={(event) => {
        feedback(SOUND[variant], event);
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
