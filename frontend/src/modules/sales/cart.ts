/**
 * Savat — yakunlanmagan sotuv. Qurilmada (localStorage) saqlanadi: sahifa yangilansa, qurilma qulflansa
 * yoki internet uzilsa ham yo'qolmaydi. Har savatning o'z identifikatori (`uuid`) bor — server shu bo'yicha
 * bitta sotuvni ikki marta yozmaydi.
 */
import type { CustomerBrief } from "@/modules/credit/types";
import { newId } from "@/shared/api/requestId";
import { divRound, fromUnits, toUnits } from "@/shared/decimal";
import type { MoneyMethod, PaymentType } from "./types";

export type CartLine = {
  id: string;
  batch_id: number;
  batch_number: string;
  sku_code: string;
  /** "Atlas · Qizil" */
  sku_name: string;
  hex: string | null;
  image_url: string | null;
  meters: string;
  kg: string | null;
  /** 1 metr narxi, so'm */
  price: number;
  recommended: number | null;
  /** Qoldiqdan ko'p sotilayotganda majburiy izoh */
  note: string;
};

export type Cart = {
  uuid: string;
  lines: CartLine[];
  payment: PaymentType;
  customer: CustomerBrief | null;
  /** Boshlang'ich to'lov — faqat raqamlar */
  initial: string;
  initialMethod: MoneyMethod;
  /**
   * Yuborilgan, tasdiq hali kelmagan (so'rovdan OLDIN yoziladi). Javob kelmasa yoki server 5xx qaytarsa shunday
   * qoladi: sotuv yozilgan bo'lishi mumkin — savat o'zgartirilmaydi, shu holicha, shu `uuid` bilan qayta yuboriladi.
   */
  pending: boolean;
  /** Kim yuborgan — boshqa sotuvchi kirganda "falonchining sotuvi kutyapti" deb ko'rsatish uchun */
  seller?: string;
};

export { newId };

export const emptyCart = (): Cart => ({
  uuid: newId(),
  lines: [],
  payment: "cash",
  customer: null,
  initial: "",
  initialMethod: "cash",
  pending: false,
});

export function loadCart(key: string): Cart {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (saved && typeof saved.uuid === "string" && Array.isArray(saved.lines)) {
      return { ...emptyCart(), ...saved };
    }
  } catch {
    /* saqlangan savat buzilgan yoki xotira yopiq — yangisidan boshlanadi */
  }
  return emptyCart();
}

export function saveCart(key: string, cart: Cart): void {
  try {
    localStorage.setItem(key, JSON.stringify(cart));
  } catch {
    /* xotira to'lgan yoki yopiq — savat faqat shu sahifada yashaydi */
  }
}

export const cartKey = (userId: number, storeId: number) => `mato.cart.${userId}.${storeId}`;

/**
 * Shu qurilmada, shu do'konda boshqa xodimlarning tasdiqlanmagan sotuvlari. Savat xodim bo'yicha alohida,
 * shuning uchun boshqa sotuvchi PIN bilan kirsa, kutayotgan sotuv ko'zdan yo'qolmasligi kerak.
 */
export function pendingElsewhere(userId: number, storeId: number): { seller: string; total: number }[] {
  const found: { seller: string; total: number }[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? "";
      const [, owner, store] = /^mato\.cart\.(\d+)\.(\d+)$/.exec(key) ?? [];
      if (!owner || Number(owner) === userId || Number(store) !== storeId) continue;
      const cart = loadCart(key);
      if (!cart.pending || cart.lines.length === 0) continue;
      found.push({
        seller: cart.seller ?? "",
        total: cart.lines.reduce((amount, line) => amount + lineAmount(line.meters, line.price), 0),
      });
    }
  } catch {
    /* xotira yopiq — ko'rsatadigan narsa yo'q */
  }
  return found;
}

/** Qator summasi: metr × narx, butun so'mgacha (yarim so'm — yuqoriga), serverdagi kabi. */
export function lineAmount(meters: string, price: number): number {
  const hundredths = toUnits(meters, 2);
  return hundredths === null ? 0 : divRound(hundredths * price, 100);
}

/**
 * Metrdan kg: 2.35 m, 1 kg = 4 m → "0.588". Hisoblab bo'lmasa — bo'sh. Butun birliklarda (metr — yuzdan bir,
 * koeffitsient — o'n mingdan bir), yaxlitlash serverdagidek ROUND_HALF_UP.
 */
export function kgFromMeters(meters: string, mPerKg: string): string {
  const hundredths = toUnits(meters, 2);
  const coefficient = toUnits(mPerKg, 4);
  if (hundredths === null || !coefficient || coefficient < 0) return "";
  const thousandths = divRound(hundredths * 100_000, coefficient); // (m/100) ÷ (k/10000) × 1000
  return thousandths >= 1 ? fromUnits(thousandths, 3) : "";
}

/** Kg dan metr: 1.5 kg, 1 kg = 4 m → "6" */
export function metersFromKg(kg: string, mPerKg: string): string {
  const thousandths = toUnits(kg, 3);
  const coefficient = toUnits(mPerKg, 4);
  if (thousandths === null || coefficient === null) return "";
  const hundredths = divRound(thousandths * coefficient, 100_000); // (kg/1000) × (k/10000) × 100
  return hundredths >= 1 ? fromUnits(hundredths, 2) : "";
}

/**
 * Qoldiqdan ko'p sotilayotgan qatorlar: { qator: shu qatorgacha partiyada qolgan metr }.
 * Bir partiyadan bir nechta qator bo'lsa, qoldiq ketma-ket kamayadi. `stock` — partiya → do'kondagi qoldiq;
 * ro'yxatda yo'q partiya tekshirilmaydi (uni server rad etadi).
 */
export function overdrawn(lines: CartLine[], stock: Record<number, string>): Record<string, number> {
  const left: Record<number, number> = {}; // yuzdan bir metrda — aniq
  const over: Record<string, number> = {};
  for (const line of lines) {
    if (!(line.batch_id in stock)) continue;
    const available = left[line.batch_id] ?? toUnits(stock[line.batch_id], 2) ?? 0;
    const meters = toUnits(line.meters, 2) ?? 0;
    if (meters > available) over[line.id] = available / 100;
    left[line.batch_id] = available - meters;
  }
  return over;
}
