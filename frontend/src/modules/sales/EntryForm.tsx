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
import { fold, searchItems } from "./search";
import { skuImage, skuTitle, type SellableSku } from "./types";

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

// Shundan ko'p qiymat bo'lsa chiplar o'rniga qidiruvli tanlov chiqadi (chiplar ekranni to'ldirib yuboradi)
const CHIP_LIMIT = 10;

type PickOption = { key: number; label: string; stock?: number; onPick: () => void };

/**
 * Qidiruvli ochiladigan tanlov (mato / rang / gul ko'p bo'lganda). Klaviatura: yozib qidiriladi,
 * ↑ ↓ — yurish, Enter — tanlash, Esc — yopish. Qoldiq tugagan variant xira, lekin tanlanadi.
 */
function ComboPick({ label, options }: { label: string; options: PickOption[] }) {
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const words = fold(text).split(/\s+/).filter(Boolean);
  const found = options.filter((option) => words.every((word) => fold(option.label).includes(word)));

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(found.length === 0 ? -1 : (active + step + found.length) % found.length);
    } else if (event.key === "Enter") {
      event.preventDefault(); // formani yubormaydi — faqat variantni tanlaydi
      (found[active] ?? (found.length === 1 ? found[0] : undefined))?.onPick();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative max-w-md">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && found[active] ? `${listId}-${found[active].key}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={label}
        onChange={(event) => (setText(event.target.value), setOpen(true), setActive(-1))}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`h-11 w-full rounded-control border border-edge bg-panel px-3.5 text-[16px] text-ink transition-colors placeholder:text-muted focus:border-indigo ${focusRing}`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-control border border-line bg-panel p-1 shadow-pop"
        >
          {found.map((option, index) => (
            <li
              key={option.key}
              id={`${listId}-${option.key}`}
              role="option"
              aria-selected={index === active}
              // mousedown: maydon fokusni yo'qotib ro'yxat yopilishidan oldin tanlanadi
              onMouseDown={(event) => (event.preventDefault(), option.onPick())}
              className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-[15px] ${
                index === active ? "bg-indigo-soft text-indigo" : "hover:bg-indigo-soft"
              } ${option.stock !== undefined && option.stock <= 0 ? "opacity-60" : ""}`}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              {option.stock !== undefined && (
                <span className="shrink-0 text-sm tabular-nums text-muted">{formatDecimal(fromUnits(option.stock, 2))} m</span>
              )}
            </li>
          ))}
          {found.length === 0 && <li className="px-3 py-2 text-sm text-muted">—</li>}
        </ul>
      )}
    </div>
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

/**
 * To'r katakchasi — ko'rib tanlashda ham, qidiruv natijasida ham bir xil: rasm (yoki rang namunasi / kod harflari),
 * kod, nom, qoldiq va tavsiya narx. `active` — klaviatura bilan belgilangan (↓ ↑), Enter shuni tanlaydi.
 */
function ItemTile({ item, active, onPick }: { item: SellableSku; active: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const stock = stockOf([item]);
  const title = skuTitle(item.sku);
  const price = item.batches[0]?.recommended_price_per_m ?? null; // eng eski partiya — tanlanganda shu olinadi
  return (
    <button
      type="button"
      aria-label={`${item.sku.code} · ${title}`}
      aria-current={active || undefined}
      title={`${item.sku.code} · ${title}`}
      onClick={onPick}
      className={`pressable flex min-w-0 items-center gap-3 rounded-control border bg-panel p-2.5 text-left hover:border-indigo hover:bg-indigo-soft active:bg-indigo-soft ${focusRing} ${
        active ? "border-indigo bg-indigo-soft ring-1 ring-indigo" : "border-line"
      } ${stock <= 0 ? "opacity-60" : ""}`}
    >
      <span className="relative shrink-0">
        <Thumb imageUrl={skuImage(item.sku)} hex={item.sku.color.hex} code={item.sku.color.code} size="lg" />
        {/* Rasm gul yoki matoniki bo'lsa, rang ko'rinmay qoladi (bir matoning oq va qorasi bir xil rasm) —
            burchakda rang nuqtasi */}
        {item.sku.color.hex && skuImage(item.sku) !== null && skuImage(item.sku) !== item.sku.color.image_url && (
          <span
            aria-hidden="true"
            data-color-dot
            className="absolute -bottom-1 -right-1 size-5 rounded-full border-2 border-panel ring-1 ring-ink/15"
            style={{ backgroundColor: item.sku.color.hex }}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-5">{item.sku.code}</span>
        <span className="block truncate text-sm text-muted">{title}</span>
        {/* Tor katakchada (telefon) narx qoldiq ostiga tushadi — hech biri kesilmaydi */}
        <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] tabular-nums">
          <span className={`whitespace-nowrap ${stock <= 0 ? "text-madder" : "text-muted"}`}>
            {formatDecimal(fromUnits(stock, 2))} m
          </span>
          {price !== null && <span className="whitespace-nowrap text-ink">{formatPrice(price, "m", t)}</span>}
        </span>
      </span>
    </button>
  );
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
  const [patternId, setPatternId] = useState<number | null>(null);
  const [skuId, setSkuId] = useState<number | null>(start?.sku.id ?? null);
  const [batchId, setBatchId] = useState<number | null>(start ? initial!.batch_id : null);
  const [meters, setMeters] = useState(start ? initial!.meters : "");
  const [kg, setKg] = useState(start ? (initial!.kg ?? "") : "");
  const [price, setPrice] = useState(start ? String(initial!.price) : "");
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [gridSize, setGridSize] = useState(GRID_STEP);
  const [active, setActive] = useState(-1); // qidiruv natijalarida ↓ ↑ bilan belgilangan katakcha

  const item = items.find((candidate) => candidate.sku.id === skuId) ?? null;
  const batch = item ? (item.batches.find((candidate) => candidate.id === batchId) ?? item.batches[0]) : null;
  const coefficient = batch?.m_per_kg ?? null;
  const available = batch ? Math.round((Number(batch.qty_m) - (inCart[batch.id] ?? 0)) * 100) / 100 : 0;
  const validMeters = parseDecimal(meters, 2);
  const overStock = validMeters !== null && Number(validMeters) > available;

  // Ko'rib tanlash — ketma-ket, bir-biriga bog'liq: mato → shu matoning ranglari → shu mato va rangning gullari
  // (docs/03-details/06-sotuv.md). Keyingi qadam oldingisi tanlangach chiqadi; × undan keyingilarni ham tozalaydi.
  type Facets = { fabric: number | null; color: number | null; pattern: number | null };
  const chosen: Facets = { fabric: fabricId, color: colorId, pattern: patternId };
  const fits = (candidate: SellableSku, facets: Facets) =>
    (facets.fabric === null || candidate.sku.fabric.id === facets.fabric) &&
    (facets.color === null || candidate.sku.color.id === facets.color) &&
    (facets.pattern === null || candidate.sku.pattern.id === facets.pattern);
  const without = (facet: keyof Facets) => items.filter((candidate) => fits(candidate, { ...chosen, [facet]: null }));
  const fabrics = [...new Map(without("fabric").map((candidate) => [candidate.sku.fabric.id, candidate.sku.fabric])).values()];
  const forColor = without("color");
  const colors = [...new Map(forColor.map((candidate) => [candidate.sku.color.id, candidate.sku.color])).values()];
  const forPattern = without("pattern");
  const patterns = [...new Map(forPattern.map((candidate) => [candidate.sku.pattern.id, candidate.sku.pattern])).values()];
  const filtered = items.filter((candidate) => fits(candidate, chosen));
  const wanted = query.trim();
  const matches = searchItems(items, query);
  // To'rdagi tovarlar: yozilgan bo'lsa — qidiruv natijasi (butun do'kon bo'yicha, eng aniq mos kelgani birinchi);
  // aks holda tanlangan mato / rang / gul bo'yicha toraytirilgan
  const gridItems = wanted ? matches : filtered;
  const visible = gridItems.slice(0, gridSize);

  function pick(chosen: SellableSku, chosenBatch?: number) {
    const target = chosen.batches.find((row) => row.id === chosenBatch) ?? chosen.batches[0]; // qo'lda — eng eskisi
    setFabricId(chosen.sku.fabric.id);
    setColorId(chosen.sku.color.id);
    setSkuId(chosen.sku.id);
    setBatchId(target.id);
    // Narxni ega yoki omborchi belgilagan (katalog / kirim) — o'zi qo'yiladi; sotuvchi kerak bo'lsa o'zgartiradi
    setPrice(target.recommended_price_per_m ? String(target.recommended_price_per_m) : "");
    setQuery("");
    setActive(-1);
    setError(null);
    // Maydon keyingi chizishda paydo bo'ladi
    setTimeout(() => metersRef.current?.focus(), 0);
  }

  function clear() {
    setSkuId(null);
    setBatchId(null);
    setColorId(null);
    setPatternId(null);
    setMeters("");
    setKg("");
    setPrice("");
    setError(null);
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  /** Rang yoki gul tanlandi: bitta tovar qolsa — o'zi tanlanadi, aks holda to'r torayadi */
  function narrow(facet: "color" | "pattern", id: number) {
    // Rang tanlanganda gul hali tanlanmagan bo'ladi (gul — keyingi qadam)
    const next: Facets = facet === "color" ? { ...chosen, color: id, pattern: null } : { ...chosen, pattern: id };
    const left = items.filter((candidate) => fits(candidate, next));
    if (left.length === 1) return pick(left[0]);
    if (facet === "color") setColorId(id);
    else setPatternId(id);
    setGridSize(GRID_STEP);
  }

  const patternLabel = (pattern: SellableSku["sku"]["pattern"]) =>
    pattern.is_plain ? pattern.name : `${pattern.code} · ${pattern.name}`;

  /** Bitta filtr qatori: tanlangan bo'lsa — × li chip; aks holda qiymatlar (10 tadan ko'p — qidiruvli tanlov) */
  function facetRow(
    legend: string,
    selected: { label: string; thumb?: ReactNode; onClear: () => void } | null,
    options: (PickOption & { thumb?: ReactNode })[],
    className = "",
  ) {
    if (!selected && options.length === 0) return null;
    return (
      <fieldset className={`min-w-0 ${className}`}>
        <legend className={fieldLabel}>{legend}</legend>
        {selected ? (
          <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-indigo bg-indigo-soft py-1.5 pl-3 pr-1.5 text-[15px] font-medium text-indigo">
            {selected.thumb}
            {selected.label}
            {/* before: ko'rinmas kengaytirilgan bosish maydoni (44px) — chip balandligi o'zgarmaydi */}
            <button
              type="button"
              aria-label={t("sales.entry.clear_filter", { name: legend })}
              onClick={selected.onClear}
              className={`pressable relative grid size-7 place-items-center rounded-full hover:bg-panel active:bg-panel before:absolute before:-inset-2 before:content-[''] ${focusRing}`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </span>
        ) : options.length > CHIP_LIMIT ? (
          <ComboPick label={legend} options={options} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <OptionChip key={option.key} label={option.label} stock={option.stock} onClick={option.onPick}>
                {option.thumb}
                {option.label}
              </OptionChip>
            ))}
          </div>
        )}
      </fieldset>
    );
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
    if (wanted && (event.key === "ArrowDown" || event.key === "ArrowUp") && visible.length > 0) {
      // Natijalar bo'ylab yurish: ↓ birinchisidan boshlaydi, oxiridan keyin boshiga qaytadi
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      return setActive(active < 0 && step < 0 ? visible.length - 1 : (active + step + visible.length) % visible.length);
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (wanted && visible[active]) return pick(visible[active]);
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
      image_url: skuImage(item.sku),
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
    <form
      onSubmit={add}
      noValidate
      className={`relative rounded-card border border-line bg-panel p-4 shadow-card sm:p-5 ${
        item && batch ? "mx-auto max-w-2xl" : ""
      }`}
    >
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
              onChange={(e) => (setQuery(e.target.value), setActive(-1), setGridSize(GRID_STEP), setError(null))}
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
            // Yozilgan: chiplar yashiriladi, ostidagi to'r natijaga torayadi
            <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted">
              {matches.length > 0 ? (
                <>
                  <span>{t("sales.entry.found", { count: matches.length })}</span>
                  <span className="hidden sm:inline">{t("sales.entry.search_keys")}</span>
                </>
              ) : (
                !error && (
                  <span role="status" className="py-2 text-[15px]">
                    {t("catalog.nothing_found")}
                  </span>
                )
              )}
            </p>
          ) : (
            // Keng ekranda mato va rang yonma-yon — to'r yuqoriroqda boshlanadi; gul butun enda
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {facetRow(
                t("catalog.sku.fabric"),
                (() => {
                  const fabric = items.find((candidate) => candidate.sku.fabric.id === fabricId)?.sku.fabric;
                  return fabric
                    ? {
                        label: `${fabric.code} · ${fabric.name}`,
                        thumb: fabric.image_url && <Thumb imageUrl={fabric.image_url} code={fabric.code} size="sm" />,
                        onClear: () => (setFabricId(null), setColorId(null), setPatternId(null), setGridSize(GRID_STEP)),
                      }
                    : null;
                })(),
                fabrics.map((fabric) => ({
                  key: fabric.id,
                  label: `${fabric.code} · ${fabric.name}`,
                  thumb: fabric.image_url && <Thumb imageUrl={fabric.image_url} code={fabric.code} size="sm" />,
                  onPick: () => (setFabricId(fabric.id), setColorId(null), setPatternId(null), setGridSize(GRID_STEP)),
                })),
              )}
              {/* Rang — mato tanlangach */}
              {fabricId !== null &&
                facetRow(
                t("catalog.sku.color"),
                (() => {
                  const color = items.find((candidate) => candidate.sku.color.id === colorId)?.sku.color;
                  return color
                    ? {
                        label: `${color.code} · ${color.name}`,
                        thumb: <Thumb imageUrl={color.image_url} hex={color.hex} code={color.code} size="sm" />,
                        onClear: () => (setColorId(null), setPatternId(null), setGridSize(GRID_STEP)),
                      }
                    : null;
                })(),
                colors.map((color) => ({
                  key: color.id,
                  label: `${color.code} · ${color.name}`,
                  stock: stockOf(forColor.filter((candidate) => candidate.sku.color.id === color.id)),
                  thumb: <Thumb imageUrl={color.image_url} hex={color.hex} code={color.code} size="sm" />,
                  onPick: () => narrow("color", color.id),
                })),
              )}
              {/* Gul — rang tanlangach (shu rangda bitta tovar bo'lsa, u rang bosilganda o'zi tanlanadi) */}
              {fabricId !== null &&
                colorId !== null &&
                facetRow(
                  t("catalog.sku.pattern"),
                  (() => {
                    const pattern = items.find((candidate) => candidate.sku.pattern.id === patternId)?.sku.pattern;
                    return pattern
                      ? {
                          label: patternLabel(pattern),
                          thumb: !pattern.is_plain && <Thumb imageUrl={pattern.image_url} code={pattern.code} size="sm" />,
                          onClear: () => (setPatternId(null), setGridSize(GRID_STEP)),
                        }
                      : null;
                  })(),
                  patterns.map((pattern) => ({
                    key: pattern.id,
                    label: patternLabel(pattern),
                    stock: stockOf(forPattern.filter((candidate) => candidate.sku.pattern.id === pattern.id)),
                    thumb: !pattern.is_plain && <Thumb imageUrl={pattern.image_url} code={pattern.code} size="sm" />,
                    onPick: () => narrow("pattern", pattern.id),
                  })),
                  "lg:col-span-2",
                )}
            </div>
          )}

          {/* Tovarlar to'ri: do'konda bori ko'z oldida — rasm (yoki rang namunasi / kod harflari), kod, nom, qoldiq,
              narx. Mato / rang tanlansa yoki qidiruvga yozilsa — torayadi. Bosilsa tovar tanlanadi (eng eski partiya). */}
          {visible.length > 0 && (
            <div role="group" aria-label={t("sales.entry.items")} className="mt-4">
              {!wanted && (
                <p className={fieldLabel} aria-hidden="true">
                  {t("sales.entry.items")}
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
                {visible.map((candidate, index) => (
                  <ItemTile
                    key={candidate.sku.id}
                    item={candidate}
                    active={Boolean(wanted) && index === active}
                    onPick={() => pick(candidate)}
                  />
                ))}
              </div>
              {gridItems.length > gridSize && (
                <LoadMore loading={false} onClick={() => setGridSize(gridSize + GRID_STEP)} />
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Tanlangan tovar — katta rasm bilan: skaner, qidiruv yoki mato → rang → gul, qaysi yo'l bo'lmasin,
              sotuvchi qo'lidagi mato shu ekanini rasmdan tekshiradi */}
          <div className="flex items-start gap-3 sm:gap-4">
            <Thumb imageUrl={skuImage(item.sku)} hex={item.sku.color.hex} code={item.sku.color.code} size="hero" />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold leading-7">{item.sku.code}</p>
              {/* Tarkibi: mato, rang, gul — har biri katalogdagi o'z rasmi / namunasi bilan. Gul doim ko'rsatiladi:
                  gulsiz tovarda ham "Gulsiz" deb — rang bosilganda tovar o'zi tanlangan bo'lsa, guli noma'lum qolmasin */}
              <ul aria-label={t("sales.entry.parts")} className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
                {[
                  { key: "fabric", label: t("catalog.sku.fabric"), name: item.sku.fabric.name, image: item.sku.fabric.image_url, hex: null, code: item.sku.fabric.code, plain: false },
                  { key: "color", label: t("catalog.sku.color"), name: item.sku.color.name, image: item.sku.color.image_url, hex: item.sku.color.hex, code: item.sku.color.code, plain: false },
                  { key: "pattern", label: t("catalog.sku.pattern"), name: item.sku.pattern.name, image: item.sku.pattern.image_url, hex: null, code: item.sku.pattern.code, plain: item.sku.pattern.is_plain },
                ].map((part) => (
                  <li key={part.key} className="flex min-w-0 items-center gap-2">
                    {part.plain ? (
                      // Gulsiz: rasm o'rnida bo'sh katakcha (kod harflari "0" chalg'itadi)
                      <span aria-hidden="true" className="size-8 shrink-0 rounded-lg border border-dashed border-edge" />
                    ) : (
                      <Thumb imageUrl={part.image} hex={part.hex} code={part.code} size="sm" />
                    )}
                    <span className="min-w-0 leading-4">
                      <span className="block text-[12px] text-muted">{part.label}</span>
                      <span className="block truncate text-[15px] font-medium">{part.name}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
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
