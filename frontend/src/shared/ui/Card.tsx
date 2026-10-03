import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconChip } from "./list";
import type { Tone } from "./tones";

/** Kichik "plitka" (ko'rsatkich, joy, rang kartochkalari) — Card'dan torroq chetlar */
export const tileClass = "rounded-card border border-line bg-panel p-4 shadow-card sm:p-5";
/** Kartochka ichidagi bo'lim sarlavhasi (17px) */
export const cardTitle = "flex items-center gap-2.5 text-[17px] font-semibold";

export function Card({
  title,
  icon,
  tone = "indigo",
  children,
  className = "",
}: {
  title?: string;
  /** Sarlavha yonidagi rangli belgi — kartochka nima haqida ekani bir qarashda ko'rinadi */
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-panel p-5 shadow-card sm:p-6 ${className}`}>
      {title && (
        <h2 className={`mb-4 ${cardTitle}`}>
          {icon && <IconChip icon={icon} tone={tone} size="sm" />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
