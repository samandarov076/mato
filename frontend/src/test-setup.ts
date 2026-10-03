/** Testlar uchun umumiy sozlama: DOM tekshiruvlari (toBeDisabled ...) va o'zbekcha interfeys. */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import i18n, { i18nReady } from "@/shared/i18n";

// Node'ning yangi versiyalarida o'zining `localStorage`i bor: fayl ko'rsatilmasa ishlamaydi va jsdom'nikini
// to'sib qo'yadi. Testlarda brauzerdagidek ishlashi uchun — xotiradagi oddiy almashtirgich.
if (typeof globalThis.localStorage?.clear !== "function") {
  const items = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: memory, configurable: true });
}

beforeAll(async () => {
  await i18nReady;
  await i18n.changeLanguage("uz");
});

afterEach(() => {
  cleanup();
});
