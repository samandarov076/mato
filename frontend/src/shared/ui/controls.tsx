/** Sozlama boshqaruvlari: yoqish/o'chirish, bir nechtadan birini tanlash, birlikli son va pul maydoni. */
import { useRef, type KeyboardEvent } from "react";
import { feedback } from "@/shared/feedback";
import { formatNumber } from "@/shared/format";
import { focusRing } from "./tones";

const numberInput =
  "h-11 rounded-control border bg-panel px-3 text-right text-[16px] tabular-nums text-ink transition-colors placeholder:text-muted disabled:bg-page disabled:text-muted";
const numberOk = `border-edge focus:border-indigo ${focusRing}`;
const numberError = `border-madder ${focusRing} focus-visible:ring-madder`;

/** Pul maydoni: yozganda minglar ajratiladi ("45 000"). Qiymat — faqat raqamlar ("45000") yoki bo'sh. */
export function MoneyInput({
  value,
  onChange,
  label,
  invalid,
  disabled,
  placeholder,
  describedBy,
  inputMode = "numeric",
  className = "w-36",
}: {
  value: string;
  onChange: (digits: string) => void;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Xato yoki izoh matnining id'si — ekran o'quvchi sababini ham o'qiydi */
  describedBy?: string;
  /** "none" — tizim klaviaturasi ochilmaydi (sotuv ekranidagi ekran raqam klaviaturasi bilan) */
  inputMode?: "numeric" | "none";
  className?: string;
}) {
  return (
    <input
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      inputMode={inputMode}
      autoComplete="off"
      value={value ? formatNumber(Number(value)) : ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10))}
      className={`${numberInput} ${className} ${invalid ? numberError : numberOk}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Ekran o'quvchi uchun nom (ko'rinadigan sarlavha yonida turadi) */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        feedback("toggle", event, { on: !checked });
        onChange(!checked);
      }}
      // before: ko'rinmas 44px bosish maydoni — barmoq bilan oson topiladi
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-base before:absolute before:-inset-2 before:content-[''] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${
        checked ? "bg-indigo" : "bg-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-panel shadow transition-transform duration-slow ease-spring ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

/**
 * Bir nechtadan birini tanlash. Tashqi balandlik 44px (sm — 36px) — yonidagi maydon va tugmalar bilan bir qatorda.
 * Tanlov belgisi yangi variantga prujina bilan siljiydi; klaviaturada ← → (ARIA radio guruhi).
 */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  size = "md",
  disabled = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  size?: "md" | "sm";
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Qiymat variantlar ichida bo'lmasa (filtr boshqa joydan qo'yilgan) — hech biri tanlangan ko'rinmaydi
  const chosen = options.findIndex((option) => option.value === value);
  const index = Math.max(0, chosen);
  const height = size === "sm" ? "h-[30px]" : "h-[38px]";

  function choose(next: number, event?: { clientX?: number }) {
    const target = options[(next + options.length) % options.length];
    if (!target || disabled) return;
    feedback("tick", event);
    onChange(target.value);
    buttons.current[(next + options.length) % options.length]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const map: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 };
    if (event.key in map) {
      event.preventDefault();
      choose(map[event.key]);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={`relative inline-grid max-w-full auto-cols-fr grid-flow-col rounded-control border border-edge bg-panel p-[3px] ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      {/* Tanlov belgisi: bitta element, variantlar orasida siljiydi */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-[3px] left-[3px] rounded-[7px] bg-indigo transition-[transform,opacity] duration-slow ease-spring-soft ${
          chosen < 0 ? "opacity-0" : ""
        }`}
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option, i) => {
        const active = i === chosen;
        return (
          <button
            key={String(option.value)}
            ref={(el) => (buttons.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={i === index ? 0 : -1}
            disabled={disabled}
            onClick={(event) => choose(i, event)}
            className={`relative z-10 ${height} whitespace-nowrap rounded-[7px] px-3 text-sm transition-colors duration-base ${focusRing} ${
              active ? "font-medium text-panel" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Qisqa son maydoni, yonida birligi: [ 30 ] kun */
export function UnitInput({
  value,
  onChange,
  unit,
  label,
  invalid,
  disabled,
  decimal = false,
  placeholder,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  unit: string;
  label: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Kasr son (metr) — telefonda vergulli klaviatura chiqadi */
  decimal?: boolean;
  placeholder?: string;
  /** Xato yoki izoh matnining id'si */
  describedBy?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${numberInput} w-28 ${invalid ? numberError : numberOk}`}
      />
      <span className="w-14 text-sm text-muted">{unit}</span>
    </div>
  );
}
