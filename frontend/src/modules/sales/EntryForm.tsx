import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus, ScanLine, X } from "lucide-react";
import { Thumb } from "@/modules/catalog/parts";
import { fromUnits, parseDecimal, toUnits } from "@/shared/decimal";
import { ApiError, api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDate, formatDecimal, formatNumber, formatPrice, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { AutoScanStrip } from "@/shared/ui/AutoScanner";
import { CameraScanButton } from "@/shared/ui/CameraScanner";
import { MoneyInput } from "@/shared/ui/controls";
import { Spinner } from "@/shared/ui/feedback";
import { fieldLabel } from "@/shared/ui/fields";
import { Chip, LoadMore } from "@/shared/ui/list";
import { focusRing } from "@/shared/ui/tones";
import { kgFromMeters, lineAmount, metersFromKg, newId, type CartLine } from "./cart";
import { skuTitle, type SellableSku } from "./types";

const cell = `h-11 w-full rounded-control border border-edge bg-panel px-3 text-right text-[16px] tabular-nums transition-colors placeholder:text-muted focus:border-indigo disabled:bg-page disabled:text-muted ${focusRing}`;

/** Tanlov chipi (mato, rang, gul): bosilganda darhol bosilgani seziladi — sensorli ekranda hover yo'q */
/**
 * Tanlov tugmasi (mato, rang, gul). `stock` — shu do'kondagi qoldiq (yuzdan bir metrda): tugmada ko'rinadi;
 * qoldiq tugagan bo'lsa tugma xira, lekin bosiladi (tizimda tugagan mato haqiqatda bo'lishi mumkin — izoh bilan sotiladi).
 */
function OptionChip({
  onClick,
  label,
  stock,
  children,
}: {
  onClick: () => void;
  /** Tugma nomi (ekran o'quvchi uchun) — qoldiq alohida tavsif sifatida o'qiladi */
  label?: string;
  stock?: number;
  children: ReactNode;
}) {
  const meters = stock === undefined ? null : `${formatDecimal(fromUnits(stock, 2))} m`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-description={meters ?? undefined}
      className={`pressable inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-left text-[15px] hover:border-indigo hover:bg-indigo-soft active:bg-indigo-soft ${focusRing} ${
        stock !== undefined && stock <= 0 ? "opacity-60" : ""
      }`}
    >
      {children}
      {meters && <span className="text-sm tabular-nums text-muted">{meters}</span>}
    </button>
  );
}

/** Tovarning shu do'kondagi jami qoldig'i (barcha ochiq partiyalari), yuzdan bir metrda — aniq */
const stockOf = (candidates: SellableSku[]) =>
  candidates.reduce(
    (total, candidate) => total + candidate.batches.reduce((sum, row) => sum + (toUnits(row.qty_m, 2) ?? 0), 0),
    0,
  );

// To'rda bir yo'la shuncha tovar; ko'p bo'lsa — "Yana ko'rsatish" (mato tanlash yoki qidiruv tezroq toraytiradi)
const GRID_STEP = 24;

/** Qidiruv uchun bir xil ko'rinish: kichik harf, apostrof turlari olib tashlanadi (o' = oʻ = o’ = o) */
const normalize = (text: string) => text.toLowerCase().replace(/['‘’ʻʼ`]/g, "");

/**
 * Moslashuvchan qidiruv: har so'z (istalgan tartibda) SKU kodida, mato / rang / gul kodi yoki nomida yoki
 * partiya raqamida bo'lishi kerak — "qizil atlas", "m101 gul", "P-12". Matolar ko'p bo'lsa ham bir-ikki so'z
 * bilan topiladi.
 */
export function searchItems(items: SellableSku[], raw: string): SellableSku[] {
  const words = normalize(raw).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return items.filter(({ sku, batches }) => {
    const haystack = normalize(
      [
        sku.code,
        sku.fabric.code,
        sku.fabric.name,
        sku.color.code,
        sku.color.name,
        sku.pattern.code,
        sku.pattern.name,
        ...batches.map((batch) => batch.number),
      ].join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}

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
  quick,
}: {
  items: SellableSku[];
  sellByKg: boolean;
  /** Partiya → savatdagi metr (tahrirlanayotgan qatorsiz) */
  inCart: Record<number, number>;
  /** Tahrirlanayotgan savat qatori */
  initial: CartLine | null;
  onAdd: (line: CartLine) => void;
  onCancel: () => void;
  /** Savat bo'sh bo'lsa — tez sotish: to'lov turi tanlovi va "Sotish" shu formada */
  quick?: { payment: ReactNode; credit: boolean; busy: boolean; onSell: (line: CartLine) => void };
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const overId = useId();
  const scanRef = useRef<HTMLInputElement>(null);
  const metersRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const sellIntent = useRef(false);

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
  const [gridSize, setGridSize] = useState(GRID_STEP);

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
  const wanted = query.trim();
  const matches = searchItems(items, query);
  // To'rdagi tovarlar: tanlangan mato (va rang) bo'yicha toraytirilgan
  const gridItems = fabricId === null ? items : colorId === null ? ofFabric : ofColor;

  function pick(chosen: SellableSku, chosenBatch?: number) {
    const target = chosen.batches.find((row) => row.id === chosenBatch) ?? chosen.batches[0]; // qo'lda — eng eskisi
    setFabricId(chosen.sku.fabric.id);
    setColorId(chosen.sku.color.id);
    setSkuId(chosen.sku.id);
    setBatchId(target.id);
    // Narxni ega yoki omborchi belgilagan (katalog / kirim) — o'zi qo'yiladi; sotuvchi kerak bo'lsa o'zgartiradi
    setPrice(target.recommended_price_per_m ? String(target.recommended_price_per_m) : "");
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
    // Narx tavsiyadan o'zgartirilmagan bo'lsa — yangi partiyaning tavsiya narxi (kg narxi koeffitsientga bog'liq)
    const untouched = price === "" || price === String(batch?.recommended_price_per_m ?? "");
    if (untouched) setPrice(next?.recommended_price_per_m ? String(next.recommended_price_per_m) : "");
  }

  /**
   * Skaner Enter yuboradi. Aniq moslik birinchi: partiya raqami (etiketka) → shu partiya; SKU kodi → shu tovar,
   * eng eski partiyasi bilan. Aniq moslik bo'lmasa — qism bo'yicha qidiruv (bitta chiqsa tanlanadi).
   * SKU aniq solishtiriladi, chunki "M101-03" (gulsiz) "M101-03-G1" (gulli) kodining boshi ham bo'ladi.
   */
  async function lookup(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await resolve(query);
  }

  /** Kamera o'qigan kod — qo'l skaneri yuborgandek: maydonga yoziladi va darhol izlanadi */
  function scanned(code: string) {
    setQuery(code);
    setError(null);
    void resolve(code);
  }

  async function resolve(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    for (const candidate of items) {
      const hit = candidate.batches.find((row) => row.number.toUpperCase() === code);
      if (hit) {
        feedback("scan"); // etiketka topildi — skaner "bip"i
        return pick(candidate, hit.id);
      }
    }
    const sku = items.find((candidate) => candidate.sku.code.toUpperCase() === code);
    if (sku) {
      feedback("scan");
      return pick(sku);
    }
    const found = searchItems(items, raw);
    if (found.length === 1) return pick(found[0]);
    if (found.length > 1) return; // ro'yxatdan tanlanadi
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
    // "Sotish" bosilganmi (aks holda — "Qo'shish" / "Yana qo'shish" yoki Enter)
    const sell = sellIntent.current && Boolean(quick) && !initial;
    sellIntent.current = false;
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
    if (!sell) feedback("select"); // savatga tushdi (sotuvda esa natija tovushi keyin chalinadi)
    const weight = sellByKg && coefficient ? (parseDecimal(kg, 3) ?? kgFromMeters(validMeters, coefficient)) : "";
    const line: CartLine = {
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
    };
    if (sell) quick!.onSell(line);
    else onAdd(line);
    // Mato tanlovi qoladi — xaridor ko'pincha bir matoning bir necha rangini oladi
    clear();
  }

  const lineTotal = (
    <p className="text-muted">
      {t("sales.entry.line_total")}:{" "}
      <span className="text-[17px] font-semibold tabular-nums text-ink">
        {formatNumber(validMeters && Number(price) ? lineAmount(validMeters, Number(price)) : 0)}
      </span>{" "}
      {t("settings.units.sum")}
    </p>
  );

  return (
    <form onSubmit={add} noValidate className="relative rounded-card border border-line bg-panel p-4 shadow-card sm:p-5">
      {/* Doimiy kamera skaneri (yoqilgan bo'lsa): tovar tanlanganda pauza, kamera esa yoqiq qoladi */}
      <AutoScanStrip paused={Boolean(item && batch)} onCode={scanned} />
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
              className={`h-12 w-full rounded-control border border-edge bg-panel pl-10 pr-[5.5rem] text-[16px] text-ink transition-colors placeholder:text-muted focus:border-indigo ${focusRing}`}
            />
            {looking && (
              <span role="status" className="absolute right-14 top-1/2 -translate-y-1/2 text-muted">
                <Spinner />
                <span className="sr-only">{t("loading")}</span>
              </span>
            )}
            {/* Telefon/planshet kamerasi — qo'l skaneri bo'lmasa */}
            <CameraScanButton onDetected={scanned} className="absolute right-1 top-1/2 -translate-y-1/2" />
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
                        <OptionChip
                          key={color.id}
                          label={`${color.code} · ${color.name}`}
                          stock={stockOf(ofFabric.filter((candidate) => candidate.sku.color.id === color.id))}
                          onClick={() => chooseColor(color.id)}
                        >
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
                      <OptionChip
                        key={candidate.sku.id}
                        label={
                          candidate.sku.pattern.is_plain
                            ? candidate.sku.pattern.name
                            : `${candidate.sku.pattern.code} · ${candidate.sku.pattern.name}`
                        }
                        stock={stockOf([candidate])}
                        onClick={() => pick(candidate)}
                      >
                        <Thumb imageUrl={candidate.sku.pattern.image_url} code={candidate.sku.pattern.code} size="sm" />
                        {candidate.sku.pattern.is_plain
                          ? candidate.sku.pattern.name
                          : `${candidate.sku.pattern.code} · ${candidate.sku.pattern.name}`}
                      </OptionChip>
                    ))}
                  </div>
                </fieldset>
              )}

              {/* Tovarlar to'ri: do'konda bori ko'z oldida — rasm (yoki kod belgisi), kod va qoldiq. Mato tanlansa
                  shu matoga torayadi. Bosilsa — yuqoridagi tanlash bilan bir xil yo'l (eng eski partiya). */}
              <div role="group" aria-label={t("sales.entry.items")}>
                <p className={fieldLabel} aria-hidden="true">
                  {t("sales.entry.items")}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {gridItems.slice(0, gridSize).map((candidate) => {
                    const stock = stockOf([candidate]);
                    const title = skuTitle(candidate.sku);
                    return (
                      <button
                        key={candidate.sku.id}
                        type="button"
                        aria-label={`${candidate.sku.code} · ${title}`}
                        title={`${candidate.sku.code} · ${title}`}
                        onClick={() => pick(candidate)}
                        className={`pressable flex min-w-0 items-center gap-2.5 rounded-control border border-line bg-panel p-2 text-left hover:border-indigo hover:bg-indigo-soft active:bg-indigo-soft ${focusRing} ${
                          stock <= 0 ? "opacity-60" : ""
                        }`}
                      >
                        <Thumb
                          imageUrl={candidate.sku.pattern.image_url ?? candidate.sku.color.image_url}
                          hex={candidate.sku.color.hex}
                          code={candidate.sku.color.code}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{candidate.sku.code}</span>
                          <span className="block truncate text-[13px] text-muted">{title}</span>
                          <span className={`block text-[13px] tabular-nums ${stock <= 0 ? "text-madder" : "text-muted"}`}>
                            {formatDecimal(fromUnits(stock, 2))} m
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {gridItems.length > gridSize && (
                  <LoadMore loading={false} onClick={() => setGridSize(gridSize + GRID_STEP)} />
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Tanlangan tovar — katta rasm bilan: skaner, qidiruv yoki mato → rang → gul, qaysi yo'l bo'lmasin,
              sotuvchi qo'lidagi mato shu ekanini rasmdan tekshiradi */}
          <div className="flex items-start gap-3 sm:gap-4">
            <Thumb
              imageUrl={item.sku.pattern.image_url ?? item.sku.color.image_url}
              hex={item.sku.color.hex}
              code={item.sku.color.code}
              size="hero"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold leading-6">{item.sku.code}</p>
              <p className="text-muted">{skuTitle(item.sku)}</p>
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
            {batch.recommended_price_per_m && Number(price) === batch.recommended_price_per_m ? (
              <span className="inline-flex min-h-9 items-center gap-1.5 text-leaf">
                <Check className="size-4" aria-hidden="true" />
                {t("sales.entry.at_recommended")}
              </span>
            ) : batch.recommended_price_per_m ? (
              // Sotuvchi narxni o'zgartirdi — bir bosishda tavsiyaga qaytadi (farq "Narx og'ishi" hisobotida)
              <button
                type="button"
                onClick={() => (setPrice(String(batch.recommended_price_per_m)), setError(null))}
                className={`pressable inline-flex min-h-9 items-center rounded-full border border-indigo/40 bg-indigo-soft px-3 font-medium text-indigo hover:border-indigo active:border-indigo [@media(pointer:coarse)]:min-h-11 ${focusRing}`}
              >
                {t("sales.entry.recommended_restore", {
                  price: formatPrice(batch.recommended_price_per_m, "m", t),
                })}
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

          {quick && !initial ? (
            // Tez sotish (savat bo'sh): to'lov turi va "Sotish" shu yerda — bitta tovar bir bosishda sotiladi.
            // "Yana qo'shish" — qator savatga tushadi va savat ochiladi. Enter "Yana qo'shish"ni bosadi:
            // sotuv faqat tugma bilan yakunlanadi, tasodifiy Enter sotib yubormaydi.
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              {lineTotal}
              {quick.payment}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  disabled={quick.busy}
                  className="whitespace-nowrap px-3 text-[15px] sm:text-[17px]"
                >
                  {/* Tor telefonda belgisiz — matn bir qatorda sig'sin */}
                  <Plus className="hidden size-[18px] sm:block" aria-hidden="true" />
                  {t("sales.entry.add_more")}
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  size="lg"
                  loading={quick.busy}
                  onClick={() => (sellIntent.current = true)}
                >
                  {!quick.busy && <Check className="size-5" aria-hidden="true" />}
                  {t(quick.credit ? "sales.entry.sell_credit" : "sales.entry.sell")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              {lineTotal}
              <Button type="submit">
                {!initial && <Plus className="size-[18px]" aria-hidden="true" />}
                {t(initial ? "common.save" : "sales.entry.add")}
              </Button>
            </div>
          )}
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
