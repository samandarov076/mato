import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, put } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Segmented, Toggle, UnitInput } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { CalendarClock, Coins, HandCoins, Lock, type LucideIcon, PackageMinus, Scale, Send } from "lucide-react";
import { IconChip } from "@/shared/ui/list";
import { focusRing, type Tone } from "@/shared/ui/tones";

type Rounding = 1 | 100 | 1000;

/** Serverdagi ko'rinish. Metr — matn ("50.00"): aniqlik yo'qolmasligi uchun. */
export type Settings = {
  sell_by_kg: boolean;
  credit_enabled: boolean;
  credit_days: number;
  low_stock_default: string | null;
  price_rounding: Rounding;
  autolock_minutes: number;
  /** Telegram kunlik xulosasi vaqti — to'liq soat: "21:00:00" */
  daily_summary_time: string;
};

/** Formadagi ko'rinish: sonlar matn sifatida — foydalanuvchi yozayotganda bo'sh ham bo'lishi mumkin. */
type Form = {
  sell_by_kg: boolean;
  credit_enabled: boolean;
  credit_days: string;
  low_stock_default: string;
  price_rounding: Rounding;
  autolock_minutes: string;
  /** Soat: "21" */
  daily_summary_time: string;
};

type FieldErrors = Partial<Record<"credit_days" | "low_stock_default" | "autolock_minutes", string>>;

const toForm = (s: Settings): Form => ({
  sell_by_kg: s.sell_by_kg,
  credit_enabled: s.credit_enabled,
  credit_days: String(s.credit_days),
  // "50.00" → "50", "50.50" → "50.5" — foydalanuvchiga ortiqcha nollarsiz
  low_stock_default: s.low_stock_default === null ? "" : String(Number(s.low_stock_default)),
  price_rounding: s.price_rounding,
  autolock_minutes: String(s.autolock_minutes),
  daily_summary_time: String(Number(s.daily_summary_time.slice(0, 2))),
});

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));

const isWhole = (text: string, min: number, max: number) =>
  /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max;

// Har sozlamaning belgisi va rangi — u qaysi bo'limga tegishli ekanini ko'rsatadi
const FIELD_ICONS: Record<keyof Form, [LucideIcon, Tone]> = {
  sell_by_kg: [Scale, "sky"],
  credit_enabled: [HandCoins, "saffron"],
  credit_days: [CalendarClock, "saffron"],
  low_stock_default: [PackageMinus, "coral"],
  price_rounding: [Coins, "leaf"],
  autolock_minutes: [Lock, "indigo"],
  daily_summary_time: [Send, "plum"],
};

/**
 * Sozlama qatori: belgi, nom, izoh va o'ngda boshqaruv. Xato matni `errorId` bilan chiqadi —
 * maydon `aria-describedby` orqali unga bog'lanadi, ekran o'quvchi sababini ham o'qiydi.
 */
function Row({
  field,
  error,
  errorId,
  children,
}: {
  field: keyof Form;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex min-w-0 items-start gap-3.5">
          <IconChip icon={FIELD_ICONS[field][0]} tone={FIELD_ICONS[field][1]} />
          <div className="min-w-0">
            <p className="font-medium">{t(`settings.fields.${field}.title`)}</p>
            <p className="mt-0.5 text-sm text-muted">{t(`settings.fields.${field}.hint`)}</p>
          </div>
        </div>
        <div className="shrink-0 pl-[54px] sm:pl-0">{children}</div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 pl-[54px] text-sm text-madder sm:pl-0 sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const idBase = useId();

  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) setForm(toForm(query.data));
  }, [query.data]);

  if (query.isError) return <Alert>{errorText(query.error)}</Alert>;
  if (!form || !query.data) return <Loading />;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(query.data));
  const label = (field: keyof Form) => t(`settings.fields.${field}.title`);
  /** Xato matnining id'si — faqat xato bo'lganda beriladi */
  const errorId = (field: keyof FieldErrors) => (errors[field] ? `${idBase}-${field}` : undefined);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const lowStock = form.low_stock_default.trim().replace(",", ".");
    const found: FieldErrors = {};
    if (!isWhole(form.credit_days, 1, 365)) found.credit_days = t("settings.errors.credit_days");
    if (!isWhole(form.autolock_minutes, 1, 480)) {
      found.autolock_minutes = t("settings.errors.autolock_minutes");
    }
    if (lowStock !== "" && !(/^\d{1,10}(\.\d{1,2})?$/.test(lowStock) && Number(lowStock) > 0)) {
      found.low_stock_default = t("settings.errors.low_stock_default");
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      feedback("error");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await put<Settings>("/settings", {
        sell_by_kg: form.sell_by_kg,
        credit_enabled: form.credit_enabled,
        credit_days: Number(form.credit_days),
        low_stock_default: lowStock === "" ? null : lowStock,
        price_rounding: form.price_rounding,
        autolock_minutes: Number(form.autolock_minutes),
        daily_summary_time: `${form.daily_summary_time.padStart(2, "0")}:00:00`,
      });
      queryClient.setQueryData(["settings"], updated);
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      setSaved(true);
    } catch (error) {
      setSaveError(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="max-w-3xl">
      <Card>
        <div className="divide-y divide-line">
          <Row field="sell_by_kg">
            <Toggle
              checked={form.sell_by_kg}
              onChange={(v) => set("sell_by_kg", v)}
              label={label("sell_by_kg")}
            />
          </Row>
          <Row field="credit_enabled">
            <Toggle
              checked={form.credit_enabled}
              onChange={(v) => set("credit_enabled", v)}
              label={label("credit_enabled")}
            />
          </Row>
          <Row field="credit_days" error={errors.credit_days} errorId={errorId("credit_days")}>
            <UnitInput
              value={form.credit_days}
              onChange={(v) => set("credit_days", v)}
              unit={t("settings.units.days")}
              label={label("credit_days")}
              invalid={Boolean(errors.credit_days)}
              describedBy={errorId("credit_days")}
              disabled={!form.credit_enabled}
            />
          </Row>
          <Row field="low_stock_default" error={errors.low_stock_default} errorId={errorId("low_stock_default")}>
            <UnitInput
              value={form.low_stock_default}
              onChange={(v) => set("low_stock_default", v)}
              unit={t("settings.units.meters")}
              label={label("low_stock_default")}
              invalid={Boolean(errors.low_stock_default)}
              describedBy={errorId("low_stock_default")}
              placeholder="—"
              decimal
            />
          </Row>
          <Row field="price_rounding">
            <Segmented<Rounding>
              value={form.price_rounding}
              onChange={(v) => set("price_rounding", v)}
              label={label("price_rounding")}
              options={[
                { value: 1, label: `1 ${t("settings.units.sum")}` },
                { value: 100, label: `100 ${t("settings.units.sum")}` },
                { value: 1000, label: `1 000 ${t("settings.units.sum")}` },
              ]}
            />
          </Row>
          <Row field="autolock_minutes" error={errors.autolock_minutes} errorId={errorId("autolock_minutes")}>
            <UnitInput
              value={form.autolock_minutes}
              onChange={(v) => set("autolock_minutes", v)}
              unit={t("settings.units.minutes")}
              label={label("autolock_minutes")}
              invalid={Boolean(errors.autolock_minutes)}
              describedBy={errorId("autolock_minutes")}
            />
          </Row>
          <Row field="daily_summary_time">
            <select
              aria-label={label("daily_summary_time")}
              value={form.daily_summary_time}
              onChange={(e) => set("daily_summary_time", e.target.value)}
              className={`h-11 w-28 rounded-control border border-edge bg-panel px-3 text-[16px] tabular-nums transition-colors focus:border-indigo ${focusRing}`}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour.padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </Row>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} disabled={!dirty}>
          {t("common.save")}
        </Button>
        {saved && !dirty && <Alert tone="success">{t("settings.saved")}</Alert>}
        {saveError && <Alert>{saveError}</Alert>}
      </div>
    </form>
  );
}
