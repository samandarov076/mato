import { useSyncExternalStore } from "react";

/**
 * Tovush va tebranish sozlamalari — qurilmada saqlanadi (hisobda emas): do'kon planshetida bir
 * sotuvchi tovushni o'chirsa, boshqasi uchun ham o'chadi — bu to'g'ri, chunki qurilma umumiy.
 * Standart: ikkalasi yoqilgan; tovushlar past va faqat ma'noli hodisalarda chalinadi.
 */
export type FeedbackPrefs = { sound: boolean; haptics: boolean };

const STORAGE_KEY = "mato.feedback";
const DEFAULTS: FeedbackPrefs = { sound: true, haptics: true };

function load(): FeedbackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<FeedbackPrefs>;
      return { sound: saved.sound !== false, haptics: saved.haptics !== false };
    }
  } catch {
    /* xotira yopiq (maxfiy rejim) — standart qiymatlar */
  }
  return DEFAULTS;
}

let current: FeedbackPrefs = load();
const listeners = new Set<() => void>();

export function getFeedbackPrefs(): FeedbackPrefs {
  return current;
}

export function setFeedbackPrefs(patch: Partial<FeedbackPrefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* saqlanmadi — shu sahifa uchun baribir amal qiladi */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Joriy sozlamalar; o'zgarganda komponent qayta chiziladi. */
export function useFeedbackPrefs(): FeedbackPrefs {
  return useSyncExternalStore(subscribe, getFeedbackPrefs, getFeedbackPrefs);
}
