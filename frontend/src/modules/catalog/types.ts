/** Katalog API'sining shakllari (/api/catalog/...) va umumiy yordamchilar. */

export type PriceUnit = "m" | "kg";

export type Fabric = {
  id: number;
  code: string;
  name: string;
  width_cm: number | null;
  composition: string | null;
  image_url: string | null;
  /** 1 kg = X metr; serverdan aniq son matn ko'rinishida keladi ("3.2500") */
  default_m_per_kg: string | null;
  is_active: boolean;
  sku_count: number;
};

export type AttributeKind = "colors" | "patterns";

/** Rang yoki gul */
export type Attribute = {
  id: number;
  code: string;
  name: string;
  /** Rang namunasi ("#c0392b") — faqat ranglarda */
  hex: string | null;
  image_url: string | null;
  /** "Gulsiz" — har biznesda bitta, faolsizlantirilmaydi */
  is_plain: boolean;
  is_active: boolean;
  sku_count: number;
};

export type Sku = {
  id: number;
  /** mato-rang[-gul] */
  code: string;
  fabric: { id: number; code: string; name: string; image_url: string | null; default_m_per_kg: string | null; is_active: boolean };
  color: { id: number; code: string; name: string; hex: string | null; image_url: string | null; is_active: boolean };
  pattern: { id: number; code: string; name: string; image_url: string | null; is_plain: boolean; is_active: boolean };
  /** Tavsiya narx, so'm; null — narxi belgilanmagan */
  price: number | null;
  price_unit: PriceUnit;
  low_stock_threshold: string | null;
  is_active: boolean;
};

export type SkuPage = { items: Sku[]; total: number };

export type PriceChange = {
  created_at: string;
  old_price: number | null;
  old_price_unit: PriceUnit | null;
  new_price: number | null;
  price_unit: PriceUnit;
  user_name: string | null;
};

export type SkuCard = Sku & { low_stock_default: string | null; history: PriceChange[] };

/** So'rov kalitlari — bir sahifadagi o'zgarish boshqalarini ham yangilashi uchun bitta joyda */
export const catalogKeys = {
  all: ["catalog"] as const,
  fabrics: ["catalog", "fabrics"] as const,
  attributes: (kind: AttributeKind) => ["catalog", kind] as const,
  skus: ["catalog", "skus"] as const,
  sku: (id: number) => ["catalog", "sku", id] as const,
};

/** Kodni solishtirish uchun: faqat harf va raqamlar, kichik harfda ("M-101" → "m101") */
const normalizeCode = (code: string) => code.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Yozilayotgan kodga o'xshash mavjud kodlar. Kodlar erkin bo'lgani uchun "M101" va "M-101"
 * ikki xil tovar bo'lib qolishi oson — forma shularni ko'rsatib ogohlantiradi.
 */
export function similarCodes<T extends { id: number; code: string }>(
  code: string,
  rows: T[],
  exceptId: number | null,
): T[] {
  const wanted = normalizeCode(code);
  if (wanted.length < 2) return [];
  return rows
    .filter((row) => {
      const existing = normalizeCode(row.code);
      return (
        row.id !== exceptId &&
        existing.length >= 2 &&
        (existing === wanted || existing.includes(wanted) || wanted.includes(existing))
      );
    })
    .slice(0, 5);
}

// Kasr sonni tekshirish va aniq hisob — `shared/decimal.ts` da (bitta joyda)
export { parseDecimal } from "@/shared/decimal";
