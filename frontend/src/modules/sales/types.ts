/** Sotuv API'sining shakllari (/api/sales). Metr va kg — aniq son (matn), pul — butun so'm. */
import type { Sku } from "@/modules/catalog/types";

export type Ref = { id: number; name: string };
export type PaymentType = "cash" | "card" | "credit";
export type MoneyMethod = "cash" | "card";
export type SaleStatus = "completed" | "partially_returned" | "returned" | "cancelled";

// ---------- Sotuv ekrani ----------

export type SellableBatch = {
  id: number;
  number: string;
  receipt_date: string;
  qty_m: string;
  /** 1 kg = X metr; yo'q bo'lsa kg kiritib bo'lmaydi */
  m_per_kg: string | null;
  /** Tavsiya narx 1 metr uchun (SKU narxi kg da bo'lsa — partiya koeffitsienti bo'yicha) */
  recommended_price_per_m: number | null;
};

/** Do'kondagi tovar va uning ochiq partiyalari (eng eskisi birinchi) */
export type SellableSku = { sku: Sku; batches: SellableBatch[] };

export type SaleContext = {
  store: Ref;
  sell_by_kg: boolean;
  credit_enabled: boolean;
  items: SellableSku[];
};

export type SaleCreated = {
  id: number;
  number: string;
  total: number;
  payment_type: PaymentType;
  /** Shu savat avval yozilgan — yangi sotuv yaratilmadi */
  duplicate: boolean;
};

// ---------- Ro'yxat va kartochka ----------

export type SaleRow = {
  id: number;
  number: string;
  created_at: string;
  store: Ref;
  seller: Ref;
  customer: Ref | null;
  total: number;
  returned_total: number;
  payment_type: PaymentType;
  status: SaleStatus;
};

/** `amount` — filtrga mos sotuvlar summasi (bekor qilinganlarsiz, qaytarilgani ayirilgan) */
export type SalePage = { items: SaleRow[]; total: number; amount: number };

export type SaleLine = {
  id: number;
  sku_label: string;
  batch_id: number;
  batch_number: string;
  meters: string;
  kg: string | null;
  price_per_m: number;
  recommended_price_per_m: number | null;
  amount: number;
  returned_m: string;
  returned_amount: number;
  negative_stock_note: string | null;
  /** Faqat biznes egasiga */
  cost_per_m: number | null;
};

export type SaleDebt = {
  amount: number;
  remaining: number;
  due_date: string;
  status: "active" | "cancelled";
};

export type SaleReturn = {
  id: number;
  created_at: string;
  user: string;
  amount: number;
  /** Qarzdan ayirilgani */
  debt_amount: number;
  /** Pul bilan qaytarilgani */
  refund: number;
  method: MoneyMethod | null;
  lines: { sku_label: string; meters: string; amount: number }[];
};

export type SaleCard = SaleRow & {
  initial_payment: number;
  initial_payment_method: MoneyMethod | null;
  lines: SaleLine[];
  debt: SaleDebt | null;
  returns: SaleReturn[];
  /** Faqat biznes egasiga */
  profit: number | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  can_cancel: boolean;
  can_return: boolean;
};

export type ReturnCreated = { id: number; amount: number; debt_amount: number; refund: number };

/** So'rov kalitlari: har sotuv, qaytarish va bekor qilish ro'yxat, kartochka va sotuv ekranini yangilaydi */
export const salesKeys = {
  all: ["sales"] as const,
  context: (store: number | null) => ["sales", "context", store] as const,
  list: (filters: string) => ["sales", "list", filters] as const,
  sale: (id: number) => ["sales", "sale", id] as const,
};

/** "Xon atlas · Qizil · Lola" (gulsiz bo'lsa — gul nomisiz) */
export const skuTitle = (sku: Sku) =>
  [sku.fabric.name, sku.color.name, sku.pattern.is_plain ? null : sku.pattern.name]
    .filter(Boolean)
    .join(" · ");

/**
 * Tovar rasmi — katalogdagi eng aniq rasm: gul (gulsiz bo'lmasa) → rang → mato; hech biri bo'lmasa null
 * (unda rang namunasi yoki kod harflari ko'rsatiladi). docs/03-details/06-sotuv.md, "Rasm".
 */
export const skuImage = (sku: Sku): string | null =>
  (sku.pattern.is_plain ? null : sku.pattern.image_url) ?? sku.color.image_url ?? sku.fabric.image_url ?? null;
