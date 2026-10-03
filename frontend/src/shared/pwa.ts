import { useSyncExternalStore } from "react";

/**
 * Ilovani o'rnatish (PWA). Chrome / Edge / Android brauzerning o'z "o'rnatish" oynasini beradi —
 * `beforeinstallprompt` hodisasi sahifa ochilishi bilan keladi, shuning uchun u `main.tsx` da darhol
 * ushlab qolinadi va tugma bosilganda ko'rsatiladi. iPhone / iPad Safari bunday oyna bermaydi — u yerda
 * "Ulashish → Bosh ekranga qo'shish" yo'riqnomasi ko'rsatiladi. Ilova o'rnatilgan holda ochilgan bo'lsa,
 * tugma ko'rinmaydi.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * prompt — brauzer o'z oynasini beradi; ios — Safari "Bosh ekranga qo'shish";
 * manual — taklif hali kelmagan yoki brauzer bermaydi: shu brauzer uchun yo'riqnoma; null — o'rnatilgan
 */
export type InstallMode = "prompt" | "ios" | "manual" | null;

/** Qo'lda o'rnatish yo'li qaysi brauzerda qanday */
export type Browser = "chromium" | "safari" | "firefox" | "android";

export function browserKind(): Browser {
  const ua = navigator.userAgent;
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/android/i.test(ua)) return "android";
  if (/chrome|chromium|crios|edg\//i.test(ua)) return "chromium";
  return "safari";
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function standalone(): boolean {
  const media = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(media || iosStandalone);
}

/** iPhone / iPad (iPadOS o'zini Mac deb ko'rsatadi — sensorli ekrandan ajratiladi) */
function ios(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Sahifa ochilishi bilan bir marta chaqiriladi (main.tsx) — hodisa React chizilishidan oldin kelishi mumkin */
export function installPwaListeners(): void {
  installed = standalone();
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // brauzerning o'z kichik bannerini emas, bizning tugmani ko'rsatamiz
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/** Faqat testlar uchun: holat modul darajasida saqlanadi — har test toza holatdan boshlanadi */
export function resetInstallStateForTests(): void {
  deferred = null;
  installed = false;
  emit();
}

function snapshot(): InstallMode {
  if (installed) return null;
  if (deferred) return "prompt";
  return ios() ? "ios" : "manual";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstall(): { mode: InstallMode; install: () => Promise<boolean> } {
  const mode = useSyncExternalStore(subscribe, snapshot, () => null);
  return {
    mode,
    /** Brauzer oynasini ochadi; o'rnatilsa true. Oyna yo'q bo'lsa (ios / manual) — false, yo'riqnoma ko'rsatiladi. */
    async install() {
      const event = deferred;
      if (!event) return false;
      await event.prompt();
      const { outcome } = await event.userChoice;
      deferred = null; // bitta hodisa faqat bir marta ishlatiladi
      if (outcome === "accepted") installed = true;
      emit();
      return outcome === "accepted";
    },
  };
}
