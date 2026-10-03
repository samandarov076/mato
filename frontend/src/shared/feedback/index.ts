import { vibrate, type HapticKind } from "./haptics";
import { playSound, type SoundKind } from "./audio";

export { installAudioUnlock } from "./audio";
export { HAPTICS, supportsHaptics } from "./haptics";
export { getFeedbackPrefs, setFeedbackPrefs, useFeedbackPrefs, type FeedbackPrefs } from "./settings";

/**
 * Sezgi javobi: bitta hodisa — bitta chaqiruv, tovush va tebranish birga.
 *
 *   feedback("tap", event)       — oddiy tugma
 *   feedback("success")          — sotuv yakunlandi, saqlandi
 *   feedback("error")            — xato, noto'g'ri PIN
 *   feedback("toggle", event, { on: true })
 */
export type FeedbackKind = SoundKind;

const HAPTIC_FOR: Record<FeedbackKind, HapticKind | null> = {
  tap: "tap",
  tick: "tick",
  toggle: "toggle",
  select: "select",
  success: "success",
  warning: "warning",
  error: "error",
  remove: "remove",
  scan: "scan",
  swish: null, // sahifa almashganda faqat tovush — qo'lda ushlab turgan planshet titramasin
  cash: "success",
  celebrate: "celebrate",
};

type PointerLike = { clientX?: number } | null | undefined;

/** Bosilgan nuqtaning ekrandagi o'rni (0 — chap, 1 — o'ng) — tovush o'sha tomondan keladi */
function pointerX(event: PointerLike): number | undefined {
  if (!event || typeof event.clientX !== "number" || typeof window === "undefined") return undefined;
  return window.innerWidth > 0 ? event.clientX / window.innerWidth : undefined;
}

export function feedback(kind: FeedbackKind, event?: PointerLike, options: { on?: boolean } = {}): void {
  const haptic = HAPTIC_FOR[kind];
  if (haptic) vibrate(haptic);
  playSound(kind, { x: pointerX(event), on: options.on });
}
