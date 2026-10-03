import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { focusRing } from "./tones";

const key = (id: string) => `mato.hint.${id}`;

function wasClosed(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
}

/**
 * Sahifa tushuntirish matni — yopsa bo'ladi. Bir marta yopilsa shu qurilmada eslab qolinadi
 * (`mato.hint.<id>`): har kuni ishlatadigan odamga bir xil matn joy egallab turmaydi.
 */
export function Hint({ id, className = "", children }: { id: string; className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [closed, setClosed] = useState(() => wasClosed(id));
  if (closed) return null;
  return (
    <div className={`flex max-w-2xl items-start gap-2 text-muted ${className}`}>
      <p className="min-w-0 flex-1">{children}</p>
      <button
        type="button"
        aria-label={t("common.hide_hint")}
        title={t("common.hide_hint")}
        onClick={() => {
          setClosed(true);
          try {
            localStorage.setItem(key(id), "1");
          } catch {
            /* xotira yopiq — faqat shu sahifada yopiladi */
          }
        }}
        className={`pressable -mt-1 grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-indigo-soft hover:text-ink [@media(pointer:coarse)]:size-11 ${focusRing}`}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
