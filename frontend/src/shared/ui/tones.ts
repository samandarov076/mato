/**
 * Rang to'plamlari. Har rangning o'z ma'nosi bor — sahifalar bo'ylab bir xil ishlatiladi:
 * indigo — asosiy amal va umumiy ko'rsatkich; leaf — pul, sotuv, muvaffaqiyat; saffron — nasiya va
 * ogohlantirish; madder — xato, kamomad, muddati o'tgan; sky — ombor va tovar harakati; plum — katalog;
 * coral — hisobotlar; rose — tuzilma (odamlar va joylar); neutral — sozlash va yordamchi narsalar.
 *
 * Klass nomlari to'liq yozilgan — Tailwind ularni matndan topadi (`bg-${tone}` kabi yasab bo'lmaydi).
 */
export type Tone = "indigo" | "leaf" | "saffron" | "madder" | "sky" | "plum" | "coral" | "rose" | "neutral";

/**
 * Klaviatura fokusi: to'liq rangli 2px halqa, fon bilan oraliq (WCAG 2.4.13). Shaffof halqa ishlatilmaydi —
 * u fon bilan 1.4:1 bo'lib ko'rinmas edi. `focusRing` — elementning o'zida, `focusWithinRing` — ichida maydon bo'lgan o'ramda.
 */
export const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--panel))]";
export const focusWithinRing =
  "focus-within:ring-2 focus-within:ring-indigo focus-within:ring-offset-2 focus-within:ring-offset-[rgb(var(--panel))]";
export const focusRingError =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-madder focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--panel))]";

export const TONES: Record<
  Tone,
  {
    /** Belgi katakchasi: och fon + shu rangdagi belgi */
    chip: string;
    /** Matn rangi */
    text: string;
    /** Och fon */
    soft: string;
    /** To'q fon (ustida oq/panel rangli matn) */
    solid: string;
    /** Sichqoncha ustiga borganda chegara */
    hoverBorder: string;
  }
> = {
  indigo: {
    chip: "bg-indigo-soft text-indigo",
    text: "text-indigo",
    soft: "bg-indigo-soft",
    solid: "bg-indigo",
    hoverBorder: "hover:border-indigo",
  },
  leaf: {
    chip: "bg-leaf-soft text-leaf",
    text: "text-leaf",
    soft: "bg-leaf-soft",
    solid: "bg-leaf",
    hoverBorder: "hover:border-leaf",
  },
  saffron: {
    chip: "bg-saffron-soft text-saffron",
    text: "text-saffron",
    soft: "bg-saffron-soft",
    solid: "bg-saffron",
    hoverBorder: "hover:border-saffron",
  },
  madder: {
    chip: "bg-madder-soft text-madder",
    text: "text-madder",
    soft: "bg-madder-soft",
    solid: "bg-madder",
    hoverBorder: "hover:border-madder",
  },
  sky: {
    chip: "bg-sky-soft text-sky",
    text: "text-sky",
    soft: "bg-sky-soft",
    solid: "bg-sky",
    hoverBorder: "hover:border-sky",
  },
  plum: {
    chip: "bg-plum-soft text-plum",
    text: "text-plum",
    soft: "bg-plum-soft",
    solid: "bg-plum",
    hoverBorder: "hover:border-plum",
  },
  coral: {
    chip: "bg-coral-soft text-coral",
    text: "text-coral",
    soft: "bg-coral-soft",
    solid: "bg-coral",
    hoverBorder: "hover:border-coral",
  },
  rose: {
    chip: "bg-rose-soft text-rose",
    text: "text-rose",
    soft: "bg-rose-soft",
    solid: "bg-rose",
    hoverBorder: "hover:border-rose",
  },
  neutral: {
    chip: "bg-line/70 text-muted",
    text: "text-ink",
    soft: "bg-page",
    solid: "bg-muted",
    hoverBorder: "hover:border-muted",
  },
};
