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

/** Bir vaqtda ochiq cheklar soni (docs/03-details/06-sotuv.md, "Bir nechta chek") */
export const MAX_CHECKS = 5;

/** Chek savatining kaliti. 1-chek — avvalgi kalitda: eski savat (noaniq sotuv ham) joyida qoladi */
export const checkKey = (userId: number, storeId: number, slot: number) =>
  slot === 1 ? cartKey(userId, storeId) : `${cartKey(userId, storeId)}.${slot}`;

export const checksKey = (userId: number, storeId: number) => `mato.checks.${userId}.${storeId}`;

/** Ochiq cheklar (raqamlari o'sish tartibida) va joriy chek */
export type Checks = { slots: number[]; active: number };

/** Savatda saqlashga arziydigan narsa bormi: qator yoki javobi kelmagan sotuv */
const worthKeeping = (key: string) => {
  const cart = loadCart(key);
  return cart.lines.length > 0 || cart.pending;
};

export function loadChecks(userId: number, storeId: number): Checks {
  let slots: number[] = [];
  let active = 1;
  try {
    const saved = JSON.parse(localStorage.getItem(checksKey(userId, storeId)) ?? "null");
    if (saved && Array.isArray(saved.slots)) {
      slots = saved.slots.filter((slot: unknown) => Number.isInteger(slot) && (slot as number) >= 1 && (slot as number) <= MAX_CHECKS);
      active = Number(saved.active);
    }
    // Ro'yxatda yo'q, lekin savati saqlanib qolgan chek ham ko'rsatiladi — hech bir sotuv ko'zdan yo'qolmasin
    for (let slot = 1; slot <= MAX_CHECKS; slot += 1) {
      if (!slots.includes(slot) && localStorage.getItem(checkKey(userId, storeId, slot)) !== null && worthKeeping(checkKey(userId, storeId, slot))) {
        slots.push(slot);
      }
    }
  } catch {
    /* ro'yxat buzilgan yoki xotira yopiq — bitta chekdan boshlanadi */
  }
  slots = [...new Set(slots)].sort((a, b) => a - b);
  if (slots.length === 0) slots = [1];
  return { slots, active: slots.includes(active) ? active : slots[0] };
}

export function saveChecks(userId: number, storeId: number, checks: Checks): void {
  try {
    localStorage.setItem(checksKey(userId, storeId), JSON.stringify(checks));
  } catch {
    /* xotira yopiq — cheklar faqat shu sahifada yashaydi */
  }
}

/** Yopilgan chekning savatini xotiradan olib tashlaydi */
export function dropCart(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* xotira yopiq */
  }
}

/**
 * Shu qurilmada, shu do'konda boshqa xodimlarning tasdiqlanmagan sotuvlari. Savat xodim bo'yicha alohida,
 * shuning uchun boshqa sotuvchi PIN bilan kirsa, kutayotgan sotuv ko'zdan yo'qolmasligi kerak.
 */
export function pendingElsewhere(userId: number, storeId: number): { seller: string; total: number }[] {
  const found: { seller: string; total: number }[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? "";
      // Har xodimning bir nechta cheki bo'lishi mumkin: "….<raqam>" qo'shimchali kalitlar ham
      const [, owner, store] = /^mato\.cart\.(\d+)\.(\d+)(?:\.\d+)?$/.exec(key) ?? [];
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
