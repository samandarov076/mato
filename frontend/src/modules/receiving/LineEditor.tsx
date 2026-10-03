import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { catalogKeys, type PriceUnit, type SkuPage } from "@/modules/catalog/types";
import { api } from "@/shared/api/client";
import { formatNumber, formatPrice, trimDecimal } from "@/shared/format";
import { MoneyInput, Segmented } from "@/shared/ui/controls";
import { fieldLabel, SelectField, TextField } from "@/shared/ui/fields";
import { lineAmount, lineCoefficient, type Catalog, type LineDraft, type LineErrors } from "./types";

/** Nom + maydon + ostida xato yoki izoh. `noteId` — izoh matnining id'si (maydon `aria-describedby` bilan bog'lanadi). */
function Labeled({
  label,
  error,
  hint,
  noteId,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  noteId: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className={fieldLabel}>{label}</p>
      {children}
      {error ? (
        <p id={noteId} role="alert" className="mt-1.5 text-sm text-madder">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control bg-saffron-soft px-3.5 py-2.5 text-sm text-saffron">{children}</p>
  );
}

/**
 * Kirimning bitta qatori (partiya): tovar, rulon, metr, kg, koeffitsient, tannarx va tavsiya narx.
 * Kirim yaratishda ham, partiyani tuzatishda ham shu ishlatiladi.
 */
export function LineEditor({
  line,
  onChange,
  catalog,
  errors,
  skuLocked = false,
  withPrice = false,
  children,
}: {
  line: LineDraft;
  onChange: (line: LineDraft) => void;
  catalog: Catalog;
  errors: LineErrors;
  /** Sotilgan yoki ko'chirilgan partiya — tovarni almashtirib bo'lmaydi */
  skuLocked?: boolean;
  /** Tavsiya narxni shu yerda ko'rsatish va o'zgartirish (kirim yaratishda) */
  withPrice?: boolean;
  /** Qo'shimcha ogohlantirishlar (masalan, "bu tovar boshqa qatorda ham bor") */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const costNoteId = useId();
  const priceNoteId = useId();
  const set = (changes: Partial<LineDraft>) => onChange({ ...line, ...changes });
  const error = (key: keyof LineErrors) => (errors[key] ? t(errors[key]) : undefined);

  const fabric = catalog.fabrics.find((row) => String(row.id) === line.fabricId);
  const plain = catalog.patterns.find((row) => row.is_plain);
  const patternId = line.patternId || (plain ? String(plain.id) : "");

  // Tanlangan mato + rang + gul katalogda bormi va tavsiya narxi qancha
  const lookup = useQuery({
    queryKey: [...catalogKeys.skus, "lookup", line.fabricId, line.colorId, patternId],
    enabled: Boolean(line.fabricId && line.colorId && patternId),
    queryFn: async () => {
      const query = new URLSearchParams({
        fabric_id: line.fabricId,
        color_id: line.colorId,
        pattern_id: patternId,
        include_inactive: "true",
        limit: "1",
      });
      return (await api<SkuPage>(`/catalog/skus?${query}`)).items[0] ?? null;
    },
  });
  const sku = lookup.data;

  const coefficient = lineCoefficient(line, fabric);
  const computed = line.meters.trim() !== "" && line.kg.trim() !== "" && !errors.meters && !errors.kg;
  const standard = fabric?.default_m_per_kg ? Number(fabric.default_m_per_kg) : null;
  const amount = lineAmount(line);

  const price = line.price ?? (sku?.price ? String(sku.price) : "");
  const priceUnit: PriceUnit = line.priceUnit ?? sku?.price_unit ?? "m";
  // Tannarx bilan solishtirish uchun tavsiya narx 1 metrga keltiriladi
  const pricePerMeter =
    price === "" ? null : priceUnit === "m" ? Number(price) : coefficient ? Number(price) / coefficient : null;

  // Faol variantlar + (tuzatishda) hozir tanlangani faolsiz bo'lsa ham
  const options = <T extends { id: number; code: string; name: string; is_active: boolean }>(
    rows: T[],
    selected: string,
  ) =>
    rows
      .filter((row) => row.is_active || String(row.id) === selected)
      .map((row) => (
        <option key={row.id} value={row.id}>
          {row.code} — {row.name}
        </option>
      ));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t("catalog.sku.fabric")}
          value={line.fabricId}
          onChange={(fabricId) => set({ fabricId, price: null, priceUnit: null })}
          error={error("fabricId")}
          disabled={skuLocked}
        >
          <option value="">{t("receiving.choose")}</option>
          {options(catalog.fabrics, line.fabricId)}
        </SelectField>
        <SelectField
          label={t("catalog.sku.color")}
          value={line.colorId}
          onChange={(colorId) => set({ colorId, price: null, priceUnit: null })}
          error={error("colorId")}
          disabled={skuLocked}
        >
          <option value="">{t("receiving.choose")}</option>
          {options(catalog.colors, line.colorId)}
        </SelectField>
        <SelectField
          label={t("catalog.sku.pattern")}
          value={patternId}
          onChange={(value) => set({ patternId: value, price: null, priceUnit: null })}
          disabled={skuLocked}
        >
          {catalog.patterns
            .filter((row) => row.is_active || String(row.id) === patternId)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.is_plain ? row.name : `${row.code} — ${row.name}`}
              </option>
            ))}
        </SelectField>
      </div>
      {skuLocked && <p className="text-sm text-muted">{t("receiving.sku_locked")}</p>}
      {sku === null && <p className="text-sm text-muted">{t("receiving.new_sku")}</p>}
      {sku && !sku.is_active && <Warning>{t("errors.sku_inactive")}</Warning>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TextField
          label={t("receiving.rolls")}
          value={line.rolls}
          onChange={(v) => set({ rolls: v.replace(/\D/g, "").slice(0, 6) })}
          error={error("rolls")}
          inputMode="numeric"
        />
        <TextField
          label={t("receiving.meters")}
          value={line.meters}
          onChange={(meters) => set({ meters })}
          error={error("meters")}
          inputMode="decimal"
        />
        <TextField
          label={t("receiving.kg")}
          value={line.kg}
          onChange={(kg) => set({ kg })}
          error={error("kg")}
          hint={t("common.optional")}
          inputMode="decimal"
        />
        {computed ? (
          <TextField
            label={t("receiving.coefficient")}
            value={coefficient === null ? "" : String(coefficient)}
            onChange={() => {}}
            hint={t("receiving.coefficient_computed")}
            disabled
          />
        ) : (
          <TextField
            label={t("receiving.coefficient")}
            value={line.coefficient}
            onChange={(value) => set({ coefficient: value })}
            error={error("coefficient")}
            hint={
              standard === null
                ? t("common.optional")
                : t("receiving.coefficient_standard", { value: trimDecimal(String(standard)) })
            }
            placeholder={standard === null ? undefined : trimDecimal(String(standard))}
            inputMode="decimal"
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled
          label={t("receiving.cost")}
          error={error("cost")}
          hint={
            amount !== null &&
            t("receiving.line_amount", { amount: formatNumber(amount) })
          }
          noteId={costNoteId}
        >
          <div className="flex items-center gap-2.5">
            <MoneyInput
              value={line.cost}
              onChange={(cost) => set({ cost })}
              label={t("receiving.cost")}
              invalid={Boolean(errors.cost)}
              describedBy={errors.cost || amount !== null ? costNoteId : undefined}
              className="w-40"
            />
            <span className="text-sm text-muted">{t("settings.units.sum")}</span>
          </div>
        </Labeled>

        {withPrice && (
          <Labeled
            label={t("catalog.sku.col_price")}
            hint={
              sku?.price
                ? t("receiving.price_current", { price: formatPrice(sku.price, sku.price_unit, t) })
                : t("receiving.price_none")
            }
            noteId={priceNoteId}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <MoneyInput
                value={price}
                onChange={(value) => set({ price: value, priceUnit })}
                label={t("catalog.sku.col_price")}
                placeholder="—"
                describedBy={priceNoteId}
                className="w-40"
              />
              <span className="text-sm text-muted">{t("settings.units.sum")} /</span>
              <Segmented<PriceUnit>
                label={t("catalog.sku.price_unit")}
                value={priceUnit}
                onChange={(unit) => set({ price, priceUnit: unit })}
                options={[
                  { value: "m", label: t("catalog.unit_m") },
                  { value: "kg", label: t("catalog.unit_kg") },
                ]}
              />
            </div>
          </Labeled>
        )}
      </div>

      {computed && standard !== null && coefficient !== null && Math.abs(coefficient - standard) / standard > 0.2 && (
        <Warning>
          {t("receiving.warn_coefficient", {
            value: trimDecimal(String(coefficient)),
            standard: trimDecimal(String(standard)),
          })}
        </Warning>
      )}
      {withPrice && pricePerMeter !== null && line.cost !== "" && Number(line.cost) > pricePerMeter && (
        <Warning>{t("receiving.warn_cost")}</Warning>
      )}
      {children}
    </div>
  );
}
