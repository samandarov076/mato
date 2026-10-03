import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconChip } from "./list";
import { CountUp, useTilt } from "./motion";
import type { Tone } from "./tones";

/** Ko'rsatkich kartochkalari to'ri: telefonda ikkitadan, keyin sahifa o'zi ustun sonini qo'shadi */
export const statGrid = "stagger grid grid-cols-2 gap-3 sm:gap-4";

/**
 * Ko'rsatkich kartochkasi: rangli belgi, nom, katta son va ostidagi izoh.
 * `accent` — belgi rangi (ko'rsatkichning ma'nosi); `tone` — sonning o'z rangi (masalan, manfiy — qizil).
 */
export function Stat({
  label,
  value,
  unit,
  icon,
  accent = "indigo",
  tone = "",
  className = "",
  action,
  children,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon?: LucideIcon;
  accent?: Tone;
  tone?: string;
  className?: string;
  /** Nom yonidagi kichik tugma (masalan, "bu nima?") */
  action?: ReactNode;
  children?: ReactNode;
}) {
  const tilt = useTilt<HTMLElement>(5);
  return (
    <section
      {...tilt}
      className={`tilt rounded-card border border-line bg-panel p-4 shadow-card [container-type:inline-size] sm:p-5 ${className}`}
    >
      <p className="tilt-pop flex items-center gap-2.5 text-sm text-muted">
        {icon && <IconChip icon={icon} tone={accent} size="md" />}
        <span className="min-w-0 flex-1">{label}</span>
        {action}
      </p>
      {/* Son kartochka eniga qarab kichrayadi (tor telefonda ham sig'adi); birlik sig'masa pastga tushadi */}
      <p
        className={`mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-[length:clamp(1rem,10.5cqw,1.5rem)] font-semibold leading-tight tabular-nums ${tone}`}
      >
        <span className="whitespace-nowrap">{typeof value === "number" ? <CountUp value={value} /> : value}</span>
        {unit && <span className="text-sm font-normal text-muted"> {unit}</span>}
      </p>
      {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
    </section>
  );
}
