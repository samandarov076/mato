import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { feedback } from "@/shared/feedback";
import { actionClass } from "./list";

/**
 * Ro'yxat filtrlari: `main` (qidiruv va 1–2 asosiy filtr) doim ko'rinadi, qolganlari "Filtr" tugmasi ortida.
 * Tugmada faol (yashirin) filtrlar soni turadi — panel yopiq bo'lsa ham filtr qo'yilgani ko'rinadi.
 */
export function FilterPanel({
  main,
  count,
  children,
  after,
}: {
  main: ReactNode;
  /** Yashirin paneldagi faol filtrlar soni */
  count: number;
  children: ReactNode;
  /** Tugma yonidagi qo'shimcha amal (masalan, "Tozalash") */
  after?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        {main}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={(event) => {
            feedback("tap", event);
            setOpen(!open);
          }}
          className={`${actionClass()} h-11 px-3.5 text-sm ${open || count > 0 ? "border-indigo text-indigo" : ""}`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t("common.filters")}
          {count > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-indigo px-1.5 text-[12px] font-semibold leading-5 text-panel">
              <span className="sr-only">{t("common.filters_active")}: </span>
              {count}
            </span>
          )}
        </button>
        {after}
      </div>
      <div id={id} hidden={!open} className="mt-4 animate-rise">
        {children}
      </div>
    </div>
  );
}
