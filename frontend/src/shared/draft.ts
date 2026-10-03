/**
 * Yakunlanmagan forma (kirim, ko'chirish) — qoralama. Qurilmada (localStorage) saqlanadi: sahifa yangilansa,
 * planshet uxlab qolsa yoki tasodifan boshqa sahifaga o'tilsa ham yozilganlar yo'qolmaydi.
 * Savat (`sales/cart.ts`) bilan bir xil yondashuv; kalit — `mato.<forma>.<foydalanuvchi id>`.
 */

/** Saqlangan qoralama; yo'q, buzilgan yoki xotira yopiq bo'lsa — null. Shaklini chaqiruvchi o'zi tekshiradi. */
export function loadDraft<T>(key: string): T | null {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? null : (JSON.parse(saved) as T);
  } catch {
    /* saqlangan qoralama buzilgan yoki xotira yopiq — bo'sh formadan boshlanadi */
    return null;
  }
}

export function saveDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* xotira to'lgan yoki yopiq — forma faqat shu sahifada yashaydi */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* xotira yopiq — o'chiradigan narsa ham yo'q */
  }
}
