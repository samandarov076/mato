import { useId, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { catalogKeys, type PriceUnit, type SkuPage } from "@/modules/catalog/types";
import { api } from "@/shared/api/client";
import { formatNumber, formatPrice, trimDecimal } from "@/shared/format";
import { iconButtonSmall } from "@/shared/ui/Button";
import { MoneyInput, Segmented } from "@/shared/ui/controls";
import { fieldLabel, SelectField, TextField } from "@/shared/ui/fields";
import { focusRing } from "@/shared/ui/tones";
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

/** Qatorning hisoblangan holati — kartochka (`LineEditor`) va jadval qatori (`LineRow`) bir xil ishlatadi */
function useLine(line: LineDraft, catalog: Catalog, errors: LineErrors) {
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
  return {
    patternId,
    sku,
    coefficient,
    computed,
    standard,
    amount,
    price,
    priceUnit,
    // Metr va kg dan chiqqan koeffitsient matoning standartidan 20% dan ko'p farq qiladi
    oddCoefficient:
      computed && standard !== null && coefficient !== null && Math.abs(coefficient - standard) / standard > 0.2,
    // Tannarx tavsiya narxdan yuqori
    costAbovePrice: pricePerMeter !== null && line.cost !== "" && Number(line.cost) > pricePerMeter,
  };
}

/** Faol variantlar + (tuzatishda) hozir tanlangani faolsiz bo'lsa ham */
const optionsOf = <T extends { id: number; code: string; name: string; is_active: boolean }>(rows: T[], selected: string) =>
  rows
    .filter((row) => row.is_active || String(row.id) === selected)
    .map((row) => (
      <option key={row.id} value={row.id}>
        {row.code} — {row.name}
      </option>
    ));

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

  const { patternId, sku, coefficient, computed, standard, amount, price, priceUnit, oddCoefficient, costAbovePrice } =
    useLine(line, catalog, errors);
  const options = optionsOf;

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

      {oddCoefficient && coefficient !== null && standard !== null && (
        <Warning>
          {t("receiving.warn_coefficient", {
            value: trimDecimal(String(coefficient)),
            standard: trimDecimal(String(standard)),
          })}
        </Warning>
      )}
      {withPrice && costAbovePrice && <Warning>{t("receiving.warn_cost")}</Warning>}
      {children}
    </div>
  );
}

// Jadval qatoridagi ixcham maydon (kompyuter): kartochkadagi maydonlar bilan bir xil rang va fokus halqasi
const cell = `h-10 w-full min-w-0 rounded-control border bg-panel px-2 text-[15px] text-ink transition-colors placeholder:text-muted disabled:bg-page disabled:text-muted ${focusRing}`;
const cellOk = "border-edge focus:border-indigo";
const cellBad = "border-madder focus-visible:ring-madder";
const tdCell = "px-1 py-2 align-top first:pl-4 last:pr-3";

/**
 * Kirimning bitta qatori — jadval qatori sifatida (kompyuter, ≥1024px): mato · rang · gul · rulon · metr · kg ·
 * 1 kg = m · tannarx · tavsiya narx · o'chirish. Tab bilan chapdan o'ngga yuriladi. Xato, izoh va
 * ogohlantirishlar — qator ostidagi ikkinchi qatorda (bo'lsa).
 */
export function LineRow({
  n,
  line,
  onChange,
  catalog,
  errors,
  onRemove,
  removeRef,
  removing = false,
  children,
}: {
  /** Tartib raqami (1 dan) */
  n: number;
  line: LineDraft;
  onChange: (line: LineDraft) => void;
  catalog: Catalog;
  errors: LineErrors;
  /** Berilmasa — o'chirish tugmasi yo'q (yagona qator) */
  onRemove?: (event: MouseEvent<HTMLButtonElement>) => void;
  removeRef?: (element: HTMLTableRowElement | null) => void;
  removing?: boolean;
  /** Qator ostidagi qo'shimcha bloklar (tasdiq, "bu tovar boshqa qatorda ham bor") */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const noteId = useId();
  const set = (changes: Partial<LineDraft>) => onChange({ ...line, ...changes });
  const { patternId, sku, coefficient, computed, standard, amount, price, priceUnit, oddCoefficient, costAbovePrice } =
    useLine(line, catalog, errors);
  const messages = (Object.keys(errors) as (keyof LineErrors)[]).map((key) => t(errors[key]!));
  const box = (key: keyof LineErrors) => `${cell} ${errors[key] ? cellBad : cellOk}`;
  const invalid = (key: keyof LineErrors) => (errors[key] ? true : undefined);
  const describedBy = messages.length > 0 ? noteId : undefined;
  const notes =
    messages.length > 0 || sku === null || sku?.is_active === false || amount !== null || oddCoefficient || costAbovePrice || children;

  return (
    <>
      <tr ref={removeRef} aria-label={t("receiving.batch_n", { n })} className="scroll-mt-4">
        <td className={`${tdCell} pt-4 text-sm tabular-nums text-muted`}>{n}</td>
        <td className={tdCell}>
          <select
            aria-label={t("catalog.sku.fabric")}
            aria-invalid={invalid("fabricId")}
            aria-describedby={describedBy}
            value={line.fabricId}
            onChange={(e) => set({ fabricId: e.target.value, price: null, priceUnit: null })}
            className={box("fabricId")}
          >
            <option value="">{t("receiving.choose")}</option>
            {optionsOf(catalog.fabrics, line.fabricId)}
          </select>
        </td>
        <td className={tdCell}>
          <select
            aria-label={t("catalog.sku.color")}
            aria-invalid={invalid("colorId")}
            aria-describedby={describedBy}
            value={line.colorId}
            onChange={(e) => set({ colorId: e.target.value, price: null, priceUnit: null })}
            className={box("colorId")}
          >
            <option value="">{t("receiving.choose")}</option>
            {optionsOf(catalog.colors, line.colorId)}
          </select>
        </td>
        <td className={tdCell}>
          <select
            aria-label={t("catalog.sku.pattern")}
            value={patternId}
            onChange={(e) => set({ patternId: e.target.value, price: null, priceUnit: null })}
            className={`${cell} ${cellOk}`}
          >
            {catalog.patterns
              .filter((row) => row.is_active || String(row.id) === patternId)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.is_plain ? row.name : `${row.code} — ${row.name}`}
                </option>
              ))}
          </select>
        </td>
        <td className={tdCell}>
          <input
            aria-label={t("receiving.rolls")}
            aria-invalid={invalid("rolls")}
            aria-describedby={describedBy}
            inputMode="numeric"
            autoComplete="off"
            value={line.rolls}
            onChange={(e) => set({ rolls: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            className={`${box("rolls")} text-right tabular-nums`}
          />
        </td>
        <td className={tdCell}>
          <input
            aria-label={t("receiving.meters")}
            aria-invalid={invalid("meters")}
            aria-describedby={describedBy}
            inputMode="decimal"
            autoComplete="off"
            value={line.meters}
            onChange={(e) => set({ meters: e.target.value })}
            className={`${box("meters")} text-right tabular-nums`}
          />
        </td>
        <td className={tdCell}>
          <input
            aria-label={t("receiving.kg")}
            aria-invalid={invalid("kg")}
            aria-describedby={describedBy}
            inputMode="decimal"
            autoComplete="off"
            value={line.kg}
            onChange={(e) => set({ kg: e.target.value })}
            className={`${box("kg")} text-right tabular-nums`}
          />
        </td>
        <td className={tdCell}>
          {/* Metr va kg kiritilgan bo'lsa — o'zi hisoblanadi (o'qish uchun); aks holda qo'lda yoki matoning standarti */}
          <input
            aria-label={t("receiving.coefficient")}
            aria-invalid={computed ? undefined : invalid("coefficient")}
            aria-describedby={describedBy}
            inputMode="decimal"
            autoComplete="off"
            readOnly={computed}
            title={computed ? t("receiving.coefficient_computed") : undefined}
            value={computed ? (coefficient === null ? "" : String(coefficient)) : line.coefficient}
            placeholder={standard === null ? undefined : trimDecimal(String(standard))}
            onChange={(e) => set({ coefficient: e.target.value })}
            className={`${computed ? `${cell} ${cellOk} bg-page text-muted` : box("coefficient")} text-right tabular-nums`}
          />
        </td>
        <td className={tdCell}>
          <MoneyInput
            value={line.cost}
            onChange={(cost) => set({ cost })}
            label={t("receiving.cost")}
            invalid={Boolean(errors.cost)}
            describedBy={describedBy}
            className="!h-10 w-full min-w-0 !px-2 !text-[15px]"
          />
        </td>
        <td className={tdCell}>
          <div className="flex gap-1">
            <MoneyInput
              value={price}
              onChange={(value) => set({ price: value, priceUnit })}
              label={t("catalog.sku.col_price")}
              placeholder="—"
              className="!h-10 w-full min-w-0 !px-2 !text-[15px]"
            />
            <select
              aria-label={t("catalog.sku.price_unit")}
              value={priceUnit}
              onChange={(e) => set({ price, priceUnit: e.target.value as PriceUnit })}
              className={`${cell} ${cellOk} !w-auto shrink-0 !px-1`}
            >
              <option value="m">/ {t("catalog.unit_m")}</option>
              <option value="kg">/ {t("catalog.unit_kg")}</option>
            </select>
          </div>
        </td>
        <td className={`${tdCell} text-right`}>
          {onRemove && (
            <button
              type="button"
              disabled={removing}
              aria-expanded={removing}
              aria-label={t("receiving.remove_line", { n })}
              title={t("receiving.remove")}
              onClick={onRemove}
              className={`${iconButtonSmall} !size-10 hover:bg-madder-soft hover:text-madder active:bg-madder-soft ${focusRing}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </td>
      </tr>
      {notes && (
        <tr className="!border-t-0">
          <td />
          <td colSpan={10} className="space-y-2 px-1 pb-3 pr-3 text-sm">
            {messages.length > 0 && (
              <p id={noteId} role="alert" className="flex flex-wrap gap-x-4 gap-y-0.5 text-madder">
                {messages.map((message) => (
                  <span key={message}>{message}</span>
                ))}
              </p>
            )}
            <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted">
              {amount !== null && <span>{t("receiving.line_amount", { amount: formatNumber(amount) })}</span>}
              {sku === null && <span>{t("receiving.new_sku")}</span>}
              {sku && (
                <span>
                  {sku.price
                    ? t("receiving.price_current", { price: formatPrice(sku.price, sku.price_unit, t) })
                    : t("receiving.price_none")}
                </span>
              )}
            </p>
            {sku && !sku.is_active && <Warning>{t("errors.sku_inactive")}</Warning>}
            {oddCoefficient && coefficient !== null && standard !== null && (
              <Warning>
                {t("receiving.warn_coefficient", {
                  value: trimDecimal(String(coefficient)),
                  standard: trimDecimal(String(standard)),
                })}
              </Warning>
            )}
            {costAbovePrice && <Warning>{t("receiving.warn_cost")}</Warning>}
            {children}
          </td>
        </tr>
      )}
    </>
  );
}
