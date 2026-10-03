import { useTranslation } from "react-i18next";
import { feedback } from "@/shared/feedback";
import { LIST_PRESETS, periodOf, type ListPreset, type Period } from "@/shared/period";
import { TextField } from "./fields";
import { focusRing } from "./tones";

const pill =
  "pressable inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-sm transition-colors [@media(pointer:coarse)]:h-11";

/**
 * Ro'yxat filtridagi davr: Hammasi · Bugun · Kecha · Shu hafta · Shu oy · Ixtiyoriy oraliq. Ikkita sana maydoni
 * faqat oxirgisida ochiladi. Atamalar hisobotlardagi davr tanlagich bilan bir xil (`reports.presets.*`).
 * Tugmalar o'raladi — telefonda ham hech biri ekrandan chiqib ketmaydi.
 */
export function PeriodFilter({
  value,
  onChange,
  presets = LIST_PRESETS,
}: {
  value: Period;
  onChange: (next: Period) => void;
  presets?: ListPreset[];
}) {
  const { t } = useTranslation();
  const name = (preset: ListPreset) => (preset === "" ? t("common.all") : t(`reports.presets.${preset}`));
  return (
    <div className="min-w-0">
      <div role="radiogroup" aria-label={t("reports.period")} className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const active = preset === value.preset;
          return (
            <button
              key={preset || "all"}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={(event) => {
                feedback("tick", event);
                onChange(periodOf(preset, value));
              }}
              className={`${pill} ${focusRing} ${
                active
                  ? "border-transparent bg-indigo font-medium text-panel"
                  : "border-line bg-panel text-muted hover:text-ink"
              }`}
            >
              {name(preset)}
            </button>
          );
        })}
      </div>
      {value.preset === "custom" && (
        <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
          <TextField
            type="date"
            label={t("audit.filters.from")}
            value={value.date_from}
            max={value.date_to || undefined}
            onChange={(date_from) => onChange({ ...value, date_from })}
          />
          <TextField
            type="date"
            label={t("audit.filters.to")}
            value={value.date_to}
            min={value.date_from || undefined}
            onChange={(date_to) => onChange({ ...value, date_to })}
          />
        </div>
      )}
    </div>
  );
}
