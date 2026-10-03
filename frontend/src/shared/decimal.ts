/**
 * Metr va kg — aniq o'nli sonlar (server: NUMERIC). Brauzerda float bilan hisoblansa `12.3 − 2.4` =
 * `9.900000000000002` chiqadi va yarim holatlar serverdan boshqacha yaxlitlanadi. Shuning uchun hisob butun
 * birliklarda yuritiladi: metr — yuzdan bir (scale 2), kg — mingdan bir (3), koeffitsient — o'n mingdan bir (4).
 * Yaxlitlash serverdagi `ROUND_HALF_UP` bilan bir xil (yarim — noldan uzoqqa).
 *
 * Birliklar oddiy `number` (BigInt emas — eski planshetlarda yo'q): haqiqiy miqdorlar xavfsiz butun son
 * chegarasidan (9·10¹⁵) ancha kichik; chegaradan oshsa — `null`.
 */

/** Kasr son: "3,25" → "3.25". Musbat son bo'lmasa (`zero` — 0 ham mumkin) yoki kasr qismi uzun bo'lsa — null. */
export function parseDecimal(
  text: string,
  decimals: number,
  { zero = false, digits = 6 }: { zero?: boolean; digits?: number } = {},
): string | null {
  const value = text.trim().replace(",", ".");
  if (!new RegExp(`^\\d{1,${digits}}(\\.\\d{1,${decimals}})?$`).test(value)) return null;
  return zero || toUnits(value, decimals) !== 0 ? value : null;
}

/** "12.5" → 1250 (scale 2). Satrdan to'g'ridan-to'g'ri — float'siz. Yaroqsiz yoki kasr qismi uzun bo'lsa — null. */
export function toUnits(text: string, scale: number): number | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim().replace(",", "."));
  if (!match || (match[3]?.length ?? 0) > scale) return null;
  const units = Number(match[2] + (match[3] ?? "").padEnd(scale, "0"));
  if (!Number.isSafeInteger(units)) return null;
  return match[1] && units !== 0 ? -units : units;
}

/** 1250 → "12.5" (scale 2); `fixed` — serverdagidek doim to'liq kasr: "12.50" */
export function fromUnits(units: number, scale: number, fixed = false): string {
  const digits = String(Math.abs(units)).padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? digits.slice(-scale) : "";
  const text = fraction && (fixed || /[1-9]/.test(fraction)) ? `${whole}.${fixed ? fraction : fraction.replace(/0+$/, "")}` : whole;
  return units < 0 ? `-${text}` : text;
}

/** Butun sonlarni bo'lish, natija eng yaqin butunga; yarim — noldan uzoqqa (ROUND_HALF_UP). */
export function divRound(a: number, b: number): number {
  const remainder = a % b;
  const quotient = (a - remainder) / b;
  return 2 * Math.abs(remainder) >= Math.abs(b) ? quotient + Math.sign(a) * Math.sign(b) : quotient;
}

/** Yig'indi: yaroqsiz va bo'sh qiymatlar hisobga kirmaydi. ["500", "200,5"] → "700.5" */
export function sumDecimals(values: string[], scale: number): string {
  return fromUnits(
    values.reduce((total, value) => total + (toUnits(value, scale) ?? 0), 0),
    scale,
  );
}

/** Ikki sondan kichigi: ("150", "120.50") → "120.5". Biri yaroqsiz bo'lsa — ikkinchisi. */
export function minDecimal(a: string, b: string, scale: number): string {
  const first = toUnits(a, scale);
  const second = toUnits(b, scale);
  if (first === null || second === null) return first === null ? b : a;
  return fromUnits(Math.min(first, second), scale);
}
