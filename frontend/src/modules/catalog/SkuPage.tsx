import { useId, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, PackageMinus, Power, RotateCcw, Tag } from "lucide-react";
import { api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDateTime, formatPrice, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card, cardTitle } from "@/shared/ui/Card";
import { MoneyInput, Segmented, UnitInput } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { PageTitle } from "@/shared/ui/PageTitle";
import { InactiveChip, Thumb } from "./parts";
import { catalogKeys, parseDecimal, type PriceUnit, type SkuCard } from "./types";
import { BackLink, IconChip } from "@/shared/ui/list";

type Form = { price: string; unit: PriceUnit; threshold: string };

const toForm = (sku: SkuCard): Form => ({
  price: sku.price === null ? "" : String(sku.price),
  unit: sku.price_unit,
  threshold: sku.low_stock_threshold === null ? "" : trimDecimal(sku.low_stock_threshold),
});

/** SKU kartochkasi: tavsiya narx va birligi, kam qoldiq chegarasi, narx tarixi. */
export function SkuPage() {
  const id = Number(useParams().id);
  // key: boshqa SKU'ga o'tilganda forma holati eskisidan qolib ketmaydi
  return <SkuCardView key={id} id={id} />;
}

function SkuCardView({ id }: { id: number }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const thresholdErrorId = useId();

  const card = useQuery({
    queryKey: catalogKeys.sku(id),
    queryFn: () => api<SkuCard>(`/catalog/skus/${id}`),
  });
  const sku = card.data;

  // Forma: foydalanuvchi tegmaguncha serverdagi qiymatlarni ko'rsatadi
  const [draft, setDraft] = useState<Form | null>(null);
  const form = draft ?? (sku ? toForm(sku) : null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);

  const edit = (changes: Partial<Form>) => {
    if (form) setDraft({ ...form, ...changes });
    setSaved(false);
  };
  const reload = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const threshold = form.threshold.trim() === "" ? null : parseDecimal(form.threshold, 2);
    if (form.threshold.trim() !== "" && threshold === null) {
      feedback("error");
      return setThresholdError(t("catalog.sku.threshold_invalid"));
    }
    setThresholdError(null);
    setFormError(null);
    setSaving(true);
    try {
      await patch(`/catalog/skus/${id}`, {
        price: form.price ? Number(form.price) : null,
        price_unit: form.unit,
        low_stock_threshold: threshold,
      });
      await reload();
      setDraft(null);
      setSaved(true);
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(active: boolean) {
    setToggling(true);
    setFormError(null);
    try {
      await post(`/catalog/skus/${id}/${active ? "activate" : "deactivate"}`);
      await reload();
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setToggling(false);
    }
  }

  const back = <BackLink to="/catalog/skus">{t("catalog.sku.back")}</BackLink>;

  // Yuklanish, xato va ma'lumot — bir xil tepa oraliq: sahifa sakramaydi
  if (card.isLoading) {
    return (
      <div>
        {back}
        <Loading className="mt-5" />
      </div>
    );
  }
  if (!sku || !form) {
    return (
      <div>
        {back}
        <div className="mt-5">
          <Alert>{errorText(card.error)}</Alert>
        </div>
      </div>
    );
  }

  // Kg ↔ metr ekvivalenti: matoning standart koeffitsienti bo'yicha (sotuvda — partiyaniki)
  const coefficient = sku.fabric.default_m_per_kg === null ? null : Number(sku.fabric.default_m_per_kg);
  const price = form.price ? Number(form.price) : null;
  const equivalent =
    price === null || coefficient === null
      ? null
      : form.unit === "m"
        ? formatPrice(Math.round(price * coefficient), "kg", t)
        : formatPrice(Math.round(price / coefficient), "m", t);
  const parts = [sku.fabric.name, sku.color.name, sku.pattern.name];
  const priceText = (value: number | null, unit: PriceUnit | null) =>
    value === null ? t("catalog.no_price") : formatPrice(value, unit ?? "m", t);

  return (
    <div>
      {back}

      <div className="mt-3">
        <PageTitle
          title={sku.code}
          leading={
            <Thumb
              imageUrl={sku.pattern.image_url ?? sku.color.image_url}
              hex={sku.color.hex}
              code={sku.color.code}
              size="lg"
            />
          }
          sub={parts.join(" · ")}
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={toggling}
              onClick={() => void setActive(!sku.is_active)}
            >
              {sku.is_active ? (
                <Power className="size-4" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-4" aria-hidden="true" />
              )}
              {t(sku.is_active ? "common.deactivate" : "common.activate")}
            </Button>
          }
        >
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {sku.code}
            {!sku.is_active && <InactiveChip />}
          </span>
        </PageTitle>
      </div>
      {!sku.is_active && <p className="mt-3 text-sm text-muted">{t("catalog.sku.inactive_note")}</p>}

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Card>
          <form onSubmit={save} noValidate className="space-y-6">
            {formError && <Alert focus>{formError}</Alert>}
            {saved && (
              <Alert tone="success" focus>
                {t("catalog.sku.saved")}
              </Alert>
            )}

            <div>
              <h3 className={cardTitle}>
                <IconChip icon={Tag} tone="leaf" size="sm" />
                {t("catalog.sku.col_price")}
              </h3>
              <p className="mt-1 text-sm text-muted">{t("catalog.sku.price_hint")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <MoneyInput
                  value={form.price}
                  onChange={(price) => edit({ price })}
                  label={t("catalog.sku.col_price")}
                  placeholder="—"
                  className="w-40"
                />
                <span className="text-sm text-muted">{t("settings.units.sum")} /</span>
                <Segmented<PriceUnit>
                  label={t("catalog.sku.price_unit")}
                  value={form.unit}
                  onChange={(unit) => edit({ unit })}
                  options={[
                    { value: "m", label: t("catalog.unit_m") },
                    { value: "kg", label: t("catalog.unit_kg") },
                  ]}
                />
              </div>
              {price !== null && (
                <p className="mt-2 text-sm text-muted">
                  {equivalent === null
                    ? t("catalog.sku.no_coefficient")
                    : t("catalog.sku.equivalent", {
                        price: equivalent,
                        coefficient: trimDecimal(sku.fabric.default_m_per_kg ?? ""),
                      })}
                </p>
              )}
            </div>

            <div className="border-t border-line pt-5">
              <h3 className={cardTitle}>
                <IconChip icon={PackageMinus} tone="coral" size="sm" />
                {t("catalog.sku.col_threshold")}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {sku.low_stock_default === null
                  ? t("catalog.sku.threshold_hint_none")
                  : t("catalog.sku.threshold_hint_default", { value: trimDecimal(sku.low_stock_default) })}
              </p>
              <div className="mt-3">
                <UnitInput
                  value={form.threshold}
                  onChange={(threshold) => edit({ threshold })}
                  unit={t("settings.units.meters")}
                  label={t("catalog.sku.col_threshold")}
                  invalid={Boolean(thresholdError)}
                  describedBy={thresholdError ? thresholdErrorId : undefined}
                  placeholder={sku.low_stock_default === null ? "—" : trimDecimal(sku.low_stock_default)}
                  decimal
                />
              </div>
              {thresholdError && (
                <p id={thresholdErrorId} role="alert" className="mt-1.5 text-sm text-madder">
                  {thresholdError}
                </p>
              )}
            </div>

            <Button type="submit" loading={saving}>
              {t("common.save")}
            </Button>
          </form>
        </Card>

        <Card title={t("catalog.sku.history")} icon={History} tone="plum">
          {sku.history.length === 0 ? (
            <p className="text-muted">{t("catalog.sku.history_empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {sku.history.map((change, index) => (
                <li key={`${change.created_at}-${index}`} className="py-3 first:pt-0 last:pb-0">
                  <p className="tabular-nums">
                    <span className="text-muted">{priceText(change.old_price, change.old_price_unit)}</span>
                    {" → "}
                    <span className="font-medium">{priceText(change.new_price, change.price_unit)}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {formatDateTime(change.created_at)} · {change.user_name ?? t("audit.system")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
