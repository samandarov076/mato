import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ScanLine, X } from "lucide-react";
import { Thumb } from "@/modules/catalog/parts";
import { parseDecimal } from "@/modules/catalog/types";
import { ApiError, api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDate, formatDecimal, formatNumber, formatPrice, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { MoneyInput } from "@/shared/ui/controls";
import { Spinner } from "@/shared/ui/feedback";
import { fieldLabel } from "@/shared/ui/fields";
import { Chip } from "@/shared/ui/list";
import { focusRing } from "@/shared/ui/tones";
import { kgFromMeters, lineAmount, metersFromKg, newId, type CartLine } from "./cart";
import { skuTitle, type SellableSku } from "./types";

const cell = `h-11 w-full rounded-control border border-edge bg-panel px-3 text-right text-[16px] tabular-nums transition-colors placeholder:text-muted focus:border-indigo disabled:bg-page disabled:text-muted ${focusRing}`;

/** Tanlov chipi (mato, rang, gul): bosilganda darhol bosilgani seziladi — sensorli ekranda hover yo'q */
function OptionChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-left text-[15px] hover:border-indigo hover:bg-indigo-soft active:bg-indigo-soft ${focusRing}`}
    >
      {children}
    </button>
  );
}

const includes = (text: string, wanted: string) => text.toLowerCase().includes(wanted);

/**
 * Tovar kiritish qatori: skaner (partiya darhol topiladi) yoki qo'lda mato → rang → gul; keyin metr yoki kg
 * (ikkinchisi partiya koeffitsienti bo'yicha o'zi hisoblanadi) va 1 metr narxi. "Qo'shish" — savatga.
 */
export function EntryForm({
  items,
  sellByKg,
  inCart,
  initial,
  onAdd,
  onCancel,
}: {
  items: SellableSku[];
  sellByKg: boolean;
  /** Partiya → savatdagi metr (tahrirlanayotgan qatorsiz) */
  inCart: Record<number, number>;
  /** Tahrirlanayotgan savat qatori */
  initial: CartLine | null;
  onAdd: (line: CartLine) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const overId = useId();
  const scanRef = useRef<HTMLInputElement>(null);
  const metersRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);

  const start = initial ? items.find((item) => item.batches.some((batch) => batch.id === initial.batch_id)) : null;
  const [query, setQuery] = useState("");
  const [fabricId, setFabricId] = useState<number | null>(start?.sku.fabric.id ?? null);
  const [colorId, setColorId] = useState<number | null>(start?.sku.color.id ?? null);
  const [skuId, setSkuId] = useState<number | null>(start?.sku.id ?? null);
  const [batchId, setBatchId] = useState<number | null>(start ? initial!.batch_id : null);
  const [meters, setMeters] = useState(start ? initial!.meters : "");
  const [kg, setKg] = useState(start ? (initial!.kg ?? "") : "");
  const [price, setPrice] = useState(start ? String(initial!.price) : "");
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const item = items.find((candidate) => candidate.sku.id === skuId) ?? null;
  const batch = item ? (item.batches.find((candidate) => candidate.id === batchId) ?? item.batches[0]) : null;
  const coefficient = batch?.m_per_kg ?? null;
  const available = batch ? Math.round((Number(batch.qty_m) - (inCart[batch.id] ?? 0)) * 100) / 100 : 0;
  const validMeters = parseDecimal(meters, 2);
  const overStock = validMeters !== null && Number(validMeters) > available;

  // Qo'lda tanlash: mato → rang → gul (do'konda bor tovarlar ichidan)
  const fabrics = [...new Map(items.map((candidate) => [candidate.sku.fabric.id, candidate.sku.fabric])).values()];
  const ofFabric = items.filter((candidate) => candidate.sku.fabric.id === fabricId);
  const colors = [...new Map(ofFabric.map((candidate) => [candidate.sku.color.id, candidate.sku.color])).values()];
  const ofColor = ofFabric.filter((candidate) => candidate.sku.color.id === colorId);
  const wanted = query.trim().toLowerCase();
  const matches = wanted
    ? items.filter(
        ({ sku, batches }) =>
          includes(sku.code, wanted) ||
          includes(skuTitle(sku), wanted) ||
          batches.some((candidate) => includes(candidate.number, wanted)),
      )
    : [];

  function pick(chosen: SellableSku, chosenBatch?: number) {
    setFabricId(chosen.sku.fabric.id);
    setColorId(chosen.sku.color.id);
    setSkuId(chosen.sku.id);
    setBatchId(chosenBatch ?? chosen.batches[0].id); // qo'lda tanlanganda — eng eski partiya
    setQuery("");
    setError(null);
    // Maydon keyingi chizishda paydo bo'ladi
    setTimeout(() => metersRef.current?.focus(), 0);
  }

  function clear() {
    setSkuId(null);
    setBatchId(null);
    setColorId(null);
    setMeters("");
    setKg("");
    setPrice("");
    setError(null);
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  function chooseColor(id: number) {
    const options = ofFabric.filter((candidate) => candidate.sku.color.id === id);
    if (options.length === 1) pick(options[0]);
    else setColorId(id);
  }

  /** Partiya almashtirilganda yozilgan metr qoladi; kg yangi partiya koeffitsienti bo'yicha qayta hisoblanadi */
  function chooseBatch(id: number) {
    const next = item?.batches.find((row) => row.id === id);
    setBatchId(id);
    setKg(next?.m_per_kg && validMeters ? kgFromMeters(validMeters, next.m_per_kg) : "");
  }

  /** Skaner Enter yuboradi: partiya raqami aniq topilsa — darhol tanlanadi */
  async function lookup(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim().toUpperCase();
    if (!code) return;
    for (const candidate of items) {
      const hit = candidate.batches.find((row) => row.number.toUpperCase() === code);
      if (hit) {
        feedback("scan"); // etiketka topildi — skaner "bip"i
        return pick(candidate, hit.id);
      }
    }
    if (matches.length === 1) return pick(matches[0]);
    if (matches.length > 1) return; // ro'yxatdan tanlanadi
    // Bu do'konda yo'q: umuman yo'qmi yoki boshqa joydami?
    setLooking(true);
    try {
      await api(`/batches/by-number/${encodeURIComponent(code)}`);
      setError(t("sales.entry.not_here"));
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 404 ? t("sales.entry.not_found") : errorText(failure),
      );
    } finally {
      setLooking(false);
    }
  }

  function changeMeters(value: string) {
    setMeters(value);
    setError(null);
    if (!coefficient) return;
    const exact = parseDecimal(value, 2);
    setKg(exact ? kgFromMeters(exact, coefficient) : "");
  }

  function changeKg(value: string) {
    setKg(value);
    setError(null);
    if (!coefficient) return;
    const exact = parseDecimal(value, 3);
    setMeters(exact ? metersFromKg(exact, coefficient) : "");
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const fail = (message: string) => {
      feedback("error");
      setError(message);
    };
    if (!item || !batch) return fail(t("sales.entry.errors.item"));
    if (!validMeters) {
      metersRef.current?.focus();
      return fail(t("sales.entry.errors.meters"));
    }
    if (!Number(price)) {
      priceRef.current?.querySelector("input")?.focus();
      return fail(t("sales.entry.errors.price"));
    }
    feedback("select"); // savatga tushdi
    const weight = sellByKg && coefficient ? (parseDecimal(kg, 3) ?? kgFromMeters(validMeters, coefficient)) : "";
    onAdd({
      id: initial?.id ?? newId(),
      batch_id: batch.id,
      batch_number: batch.number,
      sku_code: item.sku.code,
      sku_name: skuTitle(item.sku),
      hex: item.sku.color.hex,
      image_url: item.sku.pattern.image_url ?? item.sku.color.image_url,
      meters: trimDecimal(validMeters),
      kg: weight || null,
      price: Number(price),
      recommended: batch.recommended_price_per_m,
      note: initial?.note ?? "",
    });
    // Mato tanlovi qoladi — xaridor ko'pincha bir matoning bir necha rangini oladi
    clear();
  }

  return (
    <form onSubmit={add} noValidate className="rounded-card border border-line bg-panel shadow-card p-4 sm:p-5">
      {!item || !batch ? (
        <>
          <div className="relative">
            <ScanLine
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              ref={scanRef}
              type="search"
              aria-label={t("sales.entry.scan")}
              placeholder={t("sales.entry.scan_short")}
              autoComplete="off"
              autoFocus
              value={query}
              onChange={(e) => (setQuery(e.target.value), setError(null))}
              onKeyDown={(e) => void lookup(e)}
              className={`h-12 w-full rounded-control border border-edge bg-panel pl-10 pr-10 text-[16px] text-ink transition-colors placeholder:text-muted focus:border-indigo ${focusRing}`}
            />
            {looking && (
              <span role="status" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                <Spinner />
                <span className="sr-only">{t("loading")}</span>
              </span>
            )}
          </div>

          {wanted ? (
            <ul className="mt-2 divide-y divide-line">
              {matches.slice(0, 8).map((candidate) => (
                <li key={candidate.sku.id}>
                  <button
                    type="button"
                    onClick={() => pick(candidate)}
                    className={`pressable flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left hover:bg-indigo-soft active:bg-indigo-soft ${focusRing}`}
                  >
                    <Thumb
                      imageUrl={candidate.sku.pattern.image_url ?? candidate.sku.color.image_url}
                      hex={candidate.sku.color.hex}
                      code={candidate.sku.color.code}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{candidate.sku.code}</span>
                      <span className="block truncate text-sm text-muted">{skuTitle(candidate.sku)}</span>
                    </span>
                    <span className="text-sm tabular-nums text-muted">
                      {formatDecimal(
                        candidate.batches.reduce((total, row) => total + Number(row.qty_m), 0).toFixed(2),
                      )}{" "}
                      m
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && !error && (
                <li role="status" className="px-2 py-3 text-muted">
                  {t("catalog.nothing_found")}
                </li>
              )}
            </ul>
          ) : (
            <div className="mt-4 space-y-4">
              <fieldset>
                <legend className={fieldLabel}>{t("catalog.sku.fabric")}</legend>
                <div className="flex flex-wrap gap-2">
                  {fabrics.map((fabric) =>
                    fabric.id === fabricId ? (
                      <span
                        key={fabric.id}
                        className="inline-flex min-h-10 items-center gap-1 rounded-full border border-indigo bg-indigo-soft py-1.5 pl-3.5 pr-1.5 text-[15px] font-medium text-indigo"
                      >
                        {fabric.code} · {fabric.name}
                        {/* before: ko'rinmas kengaytirilgan bosish maydoni (44px) — chip balandligi o'zgarmaydi */}
                        <button
                          type="button"
                          aria-label={t("sales.entry.change_item")}
                          onClick={() => (setFabricId(null), setColorId(null))}
                          className={`pressable relative grid size-7 place-items-center rounded-full hover:bg-panel active:bg-panel before:absolute before:-inset-2 before:content-[''] ${focusRing}`}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </span>
                    ) : (
                      fabricId === null && (
                        <OptionChip key={fabric.id} onClick={() => (setFabricId(fabric.id), setColorId(null))}>
                          {fabric.code} · {fabric.name}
                        </OptionChip>
                      )
                    ),
                  )}
                </div>
              </fieldset>
              {fabricId !== null && (
                <fieldset>
                  <legend className={fieldLabel}>{t("catalog.sku.color")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {colors
                      .filter((color) => colorId === null || color.id === colorId)
                      .map((color) => (
                        <OptionChip key={color.id} onClick={() => chooseColor(color.id)}>
                          <Thumb imageUrl={color.image_url} hex={color.hex} code={color.code} size="sm" />
                          {color.code} · {color.name}
                        </OptionChip>
                      ))}
                  </div>
                </fieldset>
              )}
              {colorId !== null && ofColor.length > 1 && (
                <fieldset>
                  <legend className={fieldLabel}>{t("catalog.sku.pattern")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {ofColor.map((candidate) => (
                      <OptionChip key={candidate.sku.id} onClick={() => pick(candidate)}>
                        <Thumb imageUrl={candidate.sku.pattern.image_url} code={candidate.sku.pattern.code} size="sm" />
                        {candidate.sku.pattern.is_plain
                          ? candidate.sku.pattern.name
                          : `${candidate.sku.pattern.code} · ${candidate.sku.pattern.name}`}
                      </OptionChip>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <Thumb
              imageUrl={item.sku.pattern.image_url ?? item.sku.color.image_url}
              hex={item.sku.color.hex}
              code={item.sku.color.code}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.sku.code}</p>
              <p className="truncate text-muted">{skuTitle(item.sku)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                {item.batches.length > 1 ? (
                  <select
                    aria-label={t("sales.entry.batch")}
                    value={batch.id}
                    onChange={(e) => chooseBatch(Number(e.target.value))}
                    className={`h-11 max-w-full rounded-control border border-edge bg-panel px-2 text-[16px] focus:border-indigo ${focusRing}`}
                  >
                    {item.batches.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.number} · {formatDate(row.receipt_date)} · {formatDecimal(row.qty_m)} m
                      </option>
                    ))}
                  </select>
                ) : (
                  <Chip tone="indigo">{batch.number}</Chip>
                )}
                <span className="text-muted">
                  {coefficient &&
                    `${t("catalog.fabric.coefficient_value", { value: trimDecimal(coefficient) })} · `}
                  <span className={available <= 0 ? "text-madder" : ""}>
                    {t("sales.entry.left", { meters: formatDecimal(available.toFixed(2)) })}
                  </span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={initial ? onCancel : clear}
              aria-label={t(initial ? "common.cancel" : "sales.entry.change_item")}
              className={`pressable grid size-10 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-indigo-soft hover:text-ink active:bg-indigo-soft [@media(pointer:coarse)]:size-11 ${focusRing}`}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className={`mt-4 grid grid-cols-2 gap-3 ${sellByKg ? "sm:grid-cols-[1fr_1fr_1.5fr]" : "sm:grid-cols-[1fr_1.5fr]"}`}>
            <label className={sellByKg ? "" : "col-span-2 sm:col-span-1"}>
              <span className={fieldLabel}>{t("sales.entry.meters")}</span>
              <input
                ref={metersRef}
                inputMode="decimal"
                autoComplete="off"
                value={meters}
                aria-describedby={overStock ? overId : undefined}
                onChange={(e) => changeMeters(e.target.value)}
                className={cell}
              />
            </label>
            {sellByKg && (
              <label>
                <span className={fieldLabel}>{t("sales.entry.kg")}</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={kg}
                  disabled={!coefficient}
                  onChange={(e) => changeKg(e.target.value)}
                  className={cell}
                />
              </label>
            )}
            <div ref={priceRef} className="col-span-2 sm:col-span-1">
              <span className={fieldLabel}>{t("sales.entry.price")}</span>
              <MoneyInput
                label={t("sales.entry.price")}
                value={price}
                onChange={(value) => (setPrice(value), setError(null))}
                className="w-full"
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {batch.recommended_price_per_m ? (
              <button
                type="button"
                onClick={() => (setPrice(String(batch.recommended_price_per_m)), setError(null))}
                className={`pressable inline-flex min-h-9 items-center rounded-full border border-indigo/40 bg-indigo-soft px-3 font-medium text-indigo hover:border-indigo active:border-indigo [@media(pointer:coarse)]:min-h-11 ${focusRing}`}
              >
                {t("sales.entry.recommended", { price: formatPrice(batch.recommended_price_per_m, "m", t) })}
              </button>
            ) : (
              <span className="text-muted">{t("sales.entry.no_recommended")}</span>
            )}
            {sellByKg && !coefficient && <span className="text-muted">{t("sales.entry.no_coefficient")}</span>}
          </div>
          {overStock && (
            <p id={overId} className="mt-2 text-sm text-saffron">
              {t("sales.entry.over_stock", { available: formatDecimal(available.toFixed(2)) })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-muted">
              {t("sales.entry.line_total")}:{" "}
              <span className="text-[17px] font-semibold tabular-nums text-ink">
                {formatNumber(validMeters && Number(price) ? lineAmount(validMeters, Number(price)) : 0)}
              </span>{" "}
              {t("settings.units.sum")}
            </p>
            <Button type="submit">
              {!initial && <Plus className="size-[18px]" aria-hidden="true" />}
              {t(initial ? "common.save" : "sales.entry.add")}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-madder">
          {error}
        </p>
      )}
    </form>
  );
}
