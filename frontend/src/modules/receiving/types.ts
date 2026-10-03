/** Kirim API'sining shakllari (/api/receipts, /api/batches) va forma yordamchilari. */
import type { Attribute, Fabric, PriceUnit, Sku } from "@/modules/catalog/types";
import { parseDecimal } from "@/modules/catalog/types";

export type Ref = { id: number; name: string };

export type ReceiptRow = {
  id: number;
  number: string;
  receipt_date: string;
  status: "active" | "cancelled";
  warehouse: Ref;
  created_by: Ref;
  batches_count: number;
  total_m: string;
  total_amount: number;
};

export type ReceiptPage = { items: ReceiptRow[]; total: number };

/** Kirim qatori — partiya */
export type BatchLine = {
  id: number;
  /** P-000123 — etiketkadagi shtrix-kod */
  number: string;
  sku: Sku;
  rolls_count: number;
  meters_labeled: string;
  kg: string | null;
  m_per_kg: string | null;
  cost_per_m: number;
  amount: number;
  /** Skladdagi hozirgi qoldiq */
  qty_m: string;
  /** Sotilgan yoki ko'chirilgan — tovarni almashtirib bo'lmaydi */
  has_movement: boolean;
  can_edit: boolean;
};

export type ReceiptCard = {
  id: number;
  number: string;
  receipt_date: string;
  note: string | null;
  status: "active" | "cancelled";
  warehouse: Ref;
  created_by: Ref;
  created_at: string;
  cancelled_by: Ref | null;
  cancelled_at: string | null;
  lines: BatchLine[];
  total_m: string;
  total_amount: number;
  can_edit: boolean;
  can_cancel: boolean;
};

export type ReceiptOptions = { warehouses: Ref[]; creators: Ref[] };

export const receivingKeys = {
  all: ["receipts"] as const,
  list: (filters: string) => ["receipts", "list", filters] as const,
  card: (id: number) => ["receipts", "card", id] as const,
  options: ["receipts", "options"] as const,
};

/** Formadagi bitta qator. Hamma maydon matn — foydalanuvchi yozayotgan holida. */
export type LineDraft = {
  key: number;
  fabricId: string;
  colorId: string;
  /** "" — gulsiz */
  patternId: string;
  rolls: string;
  meters: string;
  kg: string;
  /** Kg kiritilmaganda qo'lda yoziladigan koeffitsient; bo'sh — matoning standarti */
  coefficient: string;
  cost: string;
  /** Tavsiya narx: null — tegilmagan (SKU'ning hozirgi narxi ko'rsatiladi) */
  price: string | null;
  priceUnit: PriceUnit | null;
};

let nextKey = 1;

/** Qoralamadan tiklangan qatorlarning kalitlari band — yangi qator ular bilan to'qnashmaydi */
export function reserveKeys(lines: { key: number }[]): void {
  for (const line of lines) nextKey = Math.max(nextKey, line.key + 1);
}

/** Qatorga biror narsa yozilganmi — olib tashlashdan oldin so'rash va qoralamani saqlash uchun */
export const lineHasValues = (line: LineDraft): boolean =>
  Boolean(
    line.fabricId ||
      line.colorId ||
      line.rolls ||
      line.meters ||
      line.kg ||
      line.coefficient ||
      line.cost ||
      line.price,
  );

export const emptyLine = (): LineDraft => ({
  key: nextKey++,
  fabricId: "",
  colorId: "",
  patternId: "",
  rolls: "",
  meters: "",
  kg: "",
  coefficient: "",
  cost: "",
  price: null,
  priceUnit: null,
});

export type LineErrors = Partial<
  Record<"fabricId" | "colorId" | "rolls" | "meters" | "kg" | "coefficient" | "cost", string>
>;

export type Catalog = { fabrics: Fabric[]; colors: Attribute[]; patterns: Attribute[] };

const number = (text: string, decimals: number) => {
  const parsed = parseDecimal(text, decimals);
  return parsed === null ? null : Number(parsed);
};

/** 1 kg = X metr: metr va kg ikkalasi bor — metr ÷ kg; aks holda qo'lda yozilgani yoki matoning standarti. */
export function lineCoefficient(line: LineDraft, fabric: Fabric | undefined): number | null {
  const meters = number(line.meters, 2);
  const kg = number(line.kg, 3);
  if (meters !== null && kg !== null) return Math.round((meters / kg) * 10000) / 10000;
  const manual = number(line.coefficient, 4);
  if (manual !== null) return manual;
  return fabric?.default_m_per_kg ? Number(fabric.default_m_per_kg) : null;
}

/** Qator summasi (metr × tannarx), so'mda; hali to'ldirilmagan bo'lsa — null. */
export function lineAmount(line: LineDraft): number | null {
  const meters = number(line.meters, 2);
  if (meters === null || line.cost === "") return null;
  return Math.round(meters * Number(line.cost));
}

/** Qatorni tekshiradi: xatolar (tarjima kalitlari bilan). Bo'sh obyekt — hammasi joyida. */
export function validateLine(line: LineDraft): LineErrors {
  const errors: LineErrors = {};
  if (!line.fabricId) errors.fabricId = "receiving.errors.fabric";
  if (!line.colorId) errors.colorId = "receiving.errors.color";
  if (!/^\d{1,6}$/.test(line.rolls) || Number(line.rolls) < 1) errors.rolls = "receiving.errors.rolls";
  if (parseDecimal(line.meters, 2) === null) errors.meters = "receiving.errors.meters";
  if (line.kg.trim() !== "" && parseDecimal(line.kg, 3) === null) errors.kg = "receiving.errors.kg";
  if (line.kg.trim() === "" && line.coefficient.trim() !== "" && parseDecimal(line.coefficient, 4) === null) {
    errors.coefficient = "receiving.errors.coefficient";
  }
  if (line.cost === "") errors.cost = "receiving.errors.cost";
  return errors;
}

/** Formadagi qator → API ko'rinishi (tekshiruvdan o'tgan qator uchun). */
export function lineBody(line: LineDraft) {
  const kg = line.kg.trim() === "" ? null : parseDecimal(line.kg, 3);
  return {
    rolls_count: Number(line.rolls),
    meters: parseDecimal(line.meters, 2),
    kg,
    m_per_kg: kg === null && line.coefficient.trim() !== "" ? parseDecimal(line.coefficient, 4) : null,
    cost_per_m: Number(line.cost),
  };
}

export const skuPick = (line: LineDraft) => ({
  fabric_id: Number(line.fabricId),
  color_id: Number(line.colorId),
  pattern_id: line.patternId ? Number(line.patternId) : null,
});

/** Bugungi sana Toshkent vaqti bo'yicha: "2026-10-02" (sana maydoni uchun) */
export function todayInTashkent(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}
