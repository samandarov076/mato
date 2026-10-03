import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/**
 * Tarjimalar alohida bo'laklarda: foydalanuvchiga faqat o'z tili yuklanadi (uz — zaxira sifatida doim).
 * `loadLanguage(lng)` tilni almashtirishdan OLDIN chaqiriladi — matnlar "yo'q" bo'lib qolmasin.
 */
const LANGUAGES = ["uz", "en", "ru"] as const;
type Lng = (typeof LANGUAGES)[number];

const loaders: Record<Lng, () => Promise<{ default: Record<string, unknown> }>> = {
  uz: () => import("@/locales/uz/common.json"),
  en: () => import("@/locales/en/common.json"),
  ru: () => import("@/locales/ru/common.json"),
};
const loaded = new Map<string, Promise<void>>();

export function loadLanguage(language: string): Promise<void> {
  const lng = (LANGUAGES as readonly string[]).includes(language) ? (language as Lng) : "uz";
  let pending = loaded.get(lng);
  if (!pending) {
    pending = loaders[lng]().then((module) => {
      i18n.addResourceBundle(lng, "common", module.default, true, true);
    });
    loaded.set(lng, pending);
  }
  return pending;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {},
    partialBundledLanguages: true,
    fallbackLng: "uz",
    supportedLngs: [...LANGUAGES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

// <html lang> doim joriy tilda — ekran o'quvchilar va brauzer tarjimoni uchun
const syncHtmlLang = (language: string) => {
  document.documentElement.lang = language;
};
syncHtmlLang(i18n.resolvedLanguage ?? "uz");
i18n.on("languageChanged", syncHtmlLang);

/** Boshlang'ich til (va zaxira uz) yuklangach hal bo'ladi — ilova shundan keyin chiziladi */
export const i18nReady: Promise<void> = (async () => {
  const lng = i18n.resolvedLanguage ?? "uz";
  await Promise.all([loadLanguage(lng), lng !== "uz" ? loadLanguage("uz") : null]);
})();

export default i18n;
