/** Sana va son formatlari. Barcha kunlar Toshkent vaqti bo'yicha (UTC+5, yozgi vaqt yo'q). */

/** 1250000 → "1 250 000". Bo'shliq uzilmaydigan — son qator oxirida ikkiga bo'linmaydi. */
export function formatNumber(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Serverdan kelgan aniq son: "3.2500" → "3.25", "50.00" → "50" */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Aniq son o'qishga qulay ko'rinishda (metr, kg): "5000.50" → "5 000.5", "700.00" → "700" */
export function formatDecimal(value: string): string {
  // Belgi butun qismdan ALOHIDA saqlanadi: "-0.13" ning butun qismi "-0", Number("-0") esa matnda "0" —
  // minus yo'qolib, −1 va 0 orasidagi har qiymat musbat ko'rinardi (metr farqi teskari tushunilardi).
  const trimmed = trimDecimal(value.trim());
  const negative = trimmed.startsWith("-");
  const [whole, fraction] = (negative ? trimmed.slice(1) : trimmed).split(".");
  const grouped = formatNumber(Number(whole));
  const text = fraction ? `${grouped}.${fraction}` : grouped;
  return negative && /[1-9]/.test(text) ? `-${text}` : text; // "-0.00" — oddiy nol
}

/** Narx birligi bilan: "45 000 so'm / m". `t` — i18next tarjima funksiyasi. */
export function formatPrice(
  price: number,
  unit: "m" | "kg",
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return t(unit === "kg" ? "price.per_kg" : "price.per_m", { amount: formatNumber(price) });
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Bugungi biznes kuni (Toshkent vaqti): "2026-10-02" */
export function todayISO(): string {
  return new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

// Brauzerlarda o'zbekcha oy va hafta kuni nomlari yo'q (Intl "M10 2, Fri" qaytaradi) — o'zimiz yozamiz
const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

const INTL_LOCALES: Record<string, string> = { en: "en-GB", ru: "ru-RU" };

// Intl.DateTimeFormat qimmat yaratiladi — bir xil sozlama bir marta yaratilib qayta ishlatiladi
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let instance = formatters.get(key);
  if (!instance) formatters.set(key, (instance = new Intl.DateTimeFormat(locale, options)));
  return instance;
}

const DATE_TIME = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const DATE_ONLY = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "02.10.2026, 11:08" — raqamli ko'rinish uch tilda ham bir xil */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** "02.10.2026" */
export function formatDate(iso: string): string {
  return DATE_ONLY.format(new Date(iso));
}

/** Kun va oy: "2-oktabr" · "2 October" · "2 октября". `iso` — "2026-10-02" */
export function formatDayMonth(iso: string, language: string): string {
  const [, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (language === "uz" || !INTL_LOCALES[language]) return `${day}-${UZ_MONTHS[month - 1]}`;
  return formatter(INTL_LOCALES[language], { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/** Oy va yil: "oktabr 2026" · "October 2026" · "октябрь 2026 г." `iso` — "2026-10" */
export function formatMonth(iso: string, language: string): string {
  const [year, month] = iso.split("-").map(Number);
  if (language === "uz" || !INTL_LOCALES[language]) return `${UZ_MONTHS[month - 1]} ${year}`;
  return formatter(INTL_LOCALES[language], { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** "Juma, 2-oktabr" · "Friday 2 October" · "пятница, 2 октября" */
export function formatLongDate(date: Date, language: string): string {
  if (language === "uz" || !INTL_LOCALES[language]) {
    const local = new Date(date.getTime() + TASHKENT_OFFSET_MS);
    return `${UZ_WEEKDAYS[local.getUTCDay()]}, ${local.getUTCDate()}-${UZ_MONTHS[local.getUTCMonth()]}`;
  }
  const text = formatter(INTL_LOCALES[language], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tashkent",
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
