import { getFeedbackPrefs } from "./settings";

/**
 * Tebranish naqshlari (ms): [tebranish, pauza, tebranish, ...]. Qisqa — barmoq ostida "tugma bosildi"
 * hissi; uzunroq va takrorlanuvchi — xato. Android (Chrome) qurilmalarda ishlaydi; iPhone/iPad Safari'da
 * `navigator.vibrate` yo'q — u yerda jim o'tadi.
 */
export const HAPTICS = {
  tap: [8],
  tick: [4],
  toggle: [6, 24, 6],
  select: [10],
  success: [12, 48, 24],
  warning: [20, 40, 20],
  error: [40, 36, 40, 36, 40],
  remove: [14, 30, 8],
  scan: [6, 20, 12],
  celebrate: [10, 40, 10, 40, 30, 60, 60],
} as const satisfies Record<string, readonly number[]>;

export type HapticKind = keyof typeof HAPTICS;

export function supportsHaptics(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Naqshni ijro etadi; sozlamada o'chirilgan yoki qurilma qo'llamasa — hech narsa qilmaydi. */
export function vibrate(kind: HapticKind): boolean {
  if (!getFeedbackPrefs().haptics || !supportsHaptics()) return false;
  try {
    return navigator.vibrate([...HAPTICS[kind]]);
  } catch {
    return false;
  }
}
