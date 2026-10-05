/**
 * Sotuv ekranidagi tovar qidiruvi (docs/03-details/06-sotuv.md, "Qidiruv yanada moslashuvchan").
 *
 * Sotuvchi shoshib yozadi: kirillda, chiziqchasiz, bitta harfni adashtirib. Shuning uchun har so'z
 * bir xil ko'rinishga keltiriladi (`fold`) va tovarning kodi, mato / rang / gul nomi, partiya raqami bilan
 * solishtiriladi. Barcha so'zlar mos kelishi shart (istalgan tartibda); natija aniqligi bo'yicha tartiblanadi.
 */
import { toUnits } from "@/shared/decimal";
import type { SellableSku } from "./types";

// Kirill → lotin (o'zbek va rus harflari). Apostrofli juftlar (o', g') keyin apostrofsiz qoladi.
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k",
  л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/**
 * Bir xil ko'rinish: kichik harf, kirill → lotin, apostrof turlari olib tashlanadi (o' = oʻ = o),
 * `x` = `h` va `q` = `k` (og'zaki yozuvda almashib ketadi).
 */
export function fold(text: string): string {
  let out = "";
  for (const char of text.toLowerCase()) out += CYRILLIC[char] ?? char;
  return out.replace(/['‘’ʻʼ`]/g, "").replace(/x/g, "h").replace(/q/g, "k");
}

/** Faqat harf va raqam: "M101-03" → "m10103" — kodni chiziqchasiz yozsa ham topiladi */
const compact = (text: string) => fold(text).replace(/[^\p{L}\p{N}]/gu, "");

type Index = {
  /** Aniq mos kelishi kerak bo'lgan belgilar: SKU kodi, partiya raqami (to'liq va nolsiz) */
  ids: string[];
  /** Kod bo'laklari va nom so'zlari */
  tokens: string[];
};

const cache = new WeakMap<SellableSku, Index>();

function indexOf(item: SellableSku): Index {
  const cached = cache.get(item);
  if (cached) return cached;
  const { sku, batches } = item;
  const ids = [compact(sku.code)];
  for (const batch of batches) {
    ids.push(compact(batch.number));
    // "P-000012" → "p12": oldingi nollarsiz yozilsa ham
    const short = fold(batch.number).match(/^(\p{L}*)[^\p{L}\p{N}]*0*(\p{N}+)$/u);
    if (short) ids.push(short[1] + short[2]);
  }
  const words = [sku.fabric.name, sku.color.name, sku.pattern.name]
    .flatMap((name) => fold(name).split(/[^\p{L}\p{N}]+/u))
    .filter(Boolean);
  const codes = [sku.fabric.code, sku.color.code, sku.pattern.code].map(compact).filter(Boolean);
  const index = { ids, tokens: [...ids, ...codes, ...words] };
  cache.set(item, index);
  return index;
}

/** Ikki so'z orasida ko'pi bilan bitta xato (qo'shish, tushirib qoldirish, almashtirish) bormi */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const FUZZY_FROM = 4; // qisqa so'zda xato kechirilmaydi — aks holda hamma narsa "mos" bo'lib qoladi
const hasDigit = /\p{N}/u;

/** So'zning tovarga mosligi: 0 — aniq kod/partiya, 1 — boshlanishi, 2 — ichida, 3 — bitta xato bilan; null — mos emas */
function wordScore(word: string, index: Index): number | null {
  if (index.ids.includes(word)) return 0;
  let best: number | null = null;
  for (const token of index.tokens) {
    if (token.startsWith(word)) return 1;
    if (token.includes(word)) best = 2;
    else if (
      best === null &&
      word.length >= FUZZY_FROM &&
      // Kod va raqamda xato kechirilmaydi: "m10103" qo'shni "m10104" ni topib qo'ymasin
      !hasDigit.test(word) &&
      !hasDigit.test(token) &&
      [word.length - 1, word.length, word.length + 1].some(
        (length) => length <= token.length && withinOneEdit(word, token.slice(0, length)),
      )
    ) {
      best = 3;
    }
  }
  return best;
}

const inStock = (item: SellableSku) => item.batches.some((batch) => (toUnits(batch.qty_m, 2) ?? 0) > 0);

/**
 * So'rovga mos tovarlar, eng aniq mos kelgani birinchi; tengida qoldig'i bori oldin, keyin — asl tartib.
 * Bo'sh so'rov — bo'sh natija.
 */
export function searchItems(items: SellableSku[], raw: string): SellableSku[] {
  const words = raw.split(/\s+/).map(compact).filter(Boolean);
  if (words.length === 0) return [];
  const found: { item: SellableSku; score: number; stocked: boolean; order: number }[] = [];
  items.forEach((item, order) => {
    const index = indexOf(item);
    let score = 0;
    for (const word of words) {
      const one = wordScore(word, index);
      if (one === null) return;
      score += one;
    }
    found.push({ item, score, stocked: inStock(item), order });
  });
  return found
    .sort((a, b) => a.score - b.score || Number(b.stocked) - Number(a.stocked) || a.order - b.order)
    .map((entry) => entry.item);
}
