import { useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconChip } from "./list";
import type { Tone } from "./tones";

/** Brauzer oynasining sarlavhasi: "Sotuv · mato-savdo" — tarix va ekran o'quvchi sahifani nomi bilan biladi */
export function useDocumentTitle(text?: string) {
  useEffect(() => {
    if (!text) return;
    const previous = document.title;
    document.title = `${text} · mato-savdo`;
    return () => {
      document.title = previous;
    };
  }, [text]);
}

/**
 * Sahifa sarlavhasi: bo'limning rangli belgisi + nom (+ izoh), o'ngda — asosiy amal.
 * Rang va belgi menyudagi bilan bir xil — foydalanuvchi qaysi bo'limda ekanini bir qarashda biladi.
 * `leading` — belgi o'rniga boshqa narsa (tovar rasmi, ism bosh harflari).
 */
export function PageTitle({
  icon: Icon,
  tone = "indigo",
  leading,
  children,
  sub,
  action,
  title,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  leading?: ReactNode;
  children: ReactNode;
  /** Sarlavha ostidagi qisqa izoh (masalan, sana) */
  sub?: ReactNode;
  action?: ReactNode;
  /** Brauzer sarlavhasi uchun matn; berilmasa — `children` matn bo'lsa o'sha */
  title?: string;
}) {
  useDocumentTitle(title ?? (typeof children === "string" ? children : undefined));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading ?? (Icon && <IconChip icon={Icon} tone={tone} size="title" />)}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
          {sub && <p className="text-muted">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
