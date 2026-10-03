/**
 * Ilovaning yangi versiyasini qo'llash sahifani qayta yuklaydi — shuning uchun faqat hech narsa yo'qolmaydigan
 * paytda: oyna ko'rinmayotgan, savat bo'sh, tasdiqlanmagan sotuv yo'q va ochiq formaga hech narsa yozilmagan.
 * Aks holda yangilanish kutadi (keyingi qulay payt yoki ilovaning keyingi ochilishi).
 */

const CART = /^mato\.cart\.\d+\.\d+$/;
const DRAFT = /^mato\.(receipt|transfer)\.\d+$/;

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Foydalanuvchi yozgan maydonlar. Maydon hali ekranda va bo'sh bo'lmasa — forma tahrirlangan. Sahifa manzili
 * emas, maydonning o'zi kuzatiladi: sotuvchi kun bo'yi sotuv sahifasida turadi, har sotuvdan keyin maydonlar
 * bo'shaydi — o'shanda sahifa yana "bo'sh" hisoblanadi.
 */
const touched = new Set<Field>();
let tracking = false;

/** Formalarga yozilganini kuzatadi (bir marta, `main.tsx` da): `input` hodisasi butun hujjat bo'yicha */
export function installDirtyTracking(): void {
  touched.clear();
  if (tracking) return;
  tracking = true;
  document.addEventListener(
    "input",
    (event) => {
      const field = event.target;
      const typed =
        field instanceof HTMLTextAreaElement ||
        (field instanceof HTMLInputElement && field.type !== "checkbox" && field.type !== "radio");
      if (typed) touched.add(field);
    },
    { capture: true, passive: true },
  );
}

/** Ekranda turgan, foydalanuvchi yozgan va bo'sh bo'lmagan maydon bormi */
function hasEditedField(): boolean {
  for (const field of touched) {
    if (!field.isConnected) touched.delete(field); // forma yopilgan yoki boshqa sahifaga o'tilgan
    else if (field.value.trim() !== "") return true;
  }
  return false;
}

/** Qayta yuklansa yo'qoladigan yoki chalkashadigan ish bormi */
export function hasUnsavedWork(): boolean {
  if (hasEditedField()) return true;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? "";
      if (DRAFT.test(key)) return true; // qoralama faqat forma to'ldirilganda saqlanadi
      if (!CART.test(key)) continue;
      const cart = JSON.parse(localStorage.getItem(key) ?? "null");
      if (cart?.pending || (Array.isArray(cart?.lines) && cart.lines.length > 0)) return true;
    }
  } catch {
    return true; // xotirani o'qib bo'lmadi — ehtiyot shart yangilanmaydi
  }
  return false;
}

/** Yangi versiya tayyor: oyna yashirilganda va ish yo'q bo'lsa — bir marta qo'llaydi */
export function applyUpdateWhenIdle(update: () => void): void {
  let applied = false;
  const attempt = () => {
    if (applied || document.visibilityState !== "hidden" || hasUnsavedWork()) return;
    applied = true;
    document.removeEventListener("visibilitychange", attempt);
    update();
  };
  document.addEventListener("visibilitychange", attempt);
  attempt();
}
