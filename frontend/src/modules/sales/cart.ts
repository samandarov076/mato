/**
 * Savat — yakunlanmagan sotuv. Qurilmada (localStorage) saqlanadi: sahifa yangilansa, qurilma qulflansa
 * yoki internet uzilsa ham yo'qolmaydi. Har savatning o'z identifikatori (`uuid`) bor — server shu bo'yicha
 * bitta sotuvni ikki marta yozmaydi.
 */
import type { CustomerBrief } from "@/modules/credit/types";
import { trimDecimal } from "@/shared/format";
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
  /** Yuborildi, lekin javob kelmadi (internet uzildi) — savat o'zgartirilmaydi, shu holicha qayta yuboriladi */
  pending: boolean;
};

/** Tasodifiy identifikator. `crypto.randomUUID` faqat HTTPS'da bor — bo'lmasa o'zimiz yasaymiz. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

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

/** Qator summasi: metr × narx, butun so'mgacha (yarim so'm — yuqoriga), serverdagi kabi. */
export function lineAmount(meters: string, price: number): number {
  const hundredths = Math.round(Number(meters) * 100);
  return Math.floor((hundredths * price + 50) / 100);
}

/** Metrdan kg: 2.35 m, 1 kg = 4 m → "0.588". Hisoblab bo'lmasa — bo'sh. */
export function kgFromMeters(meters: string, mPerKg: string): string {
  const value = Number(meters) / Number(mPerKg);
  return Number.isFinite(value) && value >= 0.0005 ? trimDecimal(value.toFixed(3)) : "";
}

/** Kg dan metr: 1.5 kg, 1 kg = 4 m → "6" */
export function metersFromKg(kg: string, mPerKg: string): string {
  const value = Number(kg) * Number(mPerKg);
  return Number.isFinite(value) && value >= 0.005 ? trimDecimal(value.toFixed(2)) : "";
}

/**
 * Qoldiqdan ko'p sotilayotgan qatorlar: { qator: shu qatorgacha partiyada qolgan metr }.
 * Bir partiyadan bir nechta qator bo'lsa, qoldiq ketma-ket kamayadi. `stock` — partiya → do'kondagi qoldiq;
 * ro'yxatda yo'q partiya tekshirilmaydi (uni server rad etadi).
 */
export function overdrawn(lines: CartLine[], stock: Record<number, string>): Record<string, number> {
  const left: Record<number, number> = {};
  const over: Record<string, number> = {};
  for (const line of lines) {
    if (!(line.batch_id in stock)) continue;
    const available = left[line.batch_id] ?? Number(stock[line.batch_id]);
    const meters = Number(line.meters);
    if (meters > available + 1e-9) over[line.id] = available;
    left[line.batch_id] = Math.round((available - meters) * 100) / 100;
  }
  return over;
}
