/**
 * Dizayn tokenlari dashboard eskizidan (docs/sketches/dashboard.html).
 * Ranglar CSS o'zgaruvchilari orqali (src/index.css) — kunduzgi va tungi rejim bir xil klasslar bilan ishlaydi.
 * Nomlar — matoning tabiiy bo'yoqlari: indigo (asosiy), madder/ro'yan (xato), saffron/za'faron (ogohlantirish), leaf (muvaffaqiyat).
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        indigo: { DEFAULT: token("indigo"), 2: token("indigo-2"), soft: token("indigo-soft") },
        madder: { DEFAULT: token("madder"), soft: token("madder-soft") },
        saffron: { DEFAULT: token("saffron"), soft: token("saffron-soft") },
        leaf: { DEFAULT: token("leaf"), soft: token("leaf-soft") },
        sky: { DEFAULT: token("sky"), soft: token("sky-soft") },
        plum: { DEFAULT: token("plum"), soft: token("plum-soft") },
        coral: { DEFAULT: token("coral"), soft: token("coral-soft") },
        rose: { DEFAULT: token("rose"), soft: token("rose-soft") },
        hero: { from: token("hero-from"), to: token("hero-to") },
        ink: token("ink"),
        muted: token("muted"),
        line: token("line"),
        edge: token("edge"),
        page: token("page"),
        panel: token("panel"),
      },
      fontFamily: { sans: ['"Golos Text"', "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"] },
      fontSize: { base: ["15px", "1.5"] },
      borderRadius: { card: "14px", control: "10px" },
      // Harakat tokenlari (index.css :root): duration-fast/base/slow/grand, ease-standard/emphasized/exit/spring
      transitionDuration: {
        DEFAULT: "var(--dur-1)",
        fast: "var(--dur-1)",
        base: "var(--dur-2)",
        slow: "var(--dur-3)",
        grand: "var(--dur-4)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease-standard)",
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
        exit: "var(--ease-exit)",
        spring: "var(--ease-spring)",
        "spring-soft": "var(--ease-spring-soft)",
      },
      boxShadow: {
        pop: "0 12px 32px -12px rgb(26 29 41 / 0.28)",
        // Kartochkalar sahifadan biroz ko'tarilib turadi
        card: "0 1px 2px rgb(26 29 41 / 0.04), 0 6px 18px -10px rgb(26 29 41 / 0.14)",
        // Sichqoncha ustiga kelganda kartochka yana balandroq ko'tariladi
        lift: "0 2px 4px rgb(26 29 41 / 0.05), 0 18px 34px -16px rgb(26 29 41 / 0.3)",
      },
      keyframes: {
        // Xato PIN: nuqtalar "yo'q" degandek chayqaladi
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-7px)" },
          "40%, 80%": { transform: "translateX(7px)" },
        },
        // Tabrik: rangli qog'ozchalar tepadan tushadi
        confetti: {
          "0%": { transform: "translate3d(0, -10vh, 0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translate3d(var(--drift), 105vh, 0) rotate(var(--spin))", opacity: "0.9" },
        },
        // Muvaffaqiyat belgisi "sakrab" chiqadi (oshib ketishni prujina egri chizig'i beradi)
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // Faqat shaffoflik — sahifa almashganda (kartochkalar o'zi ko'tariladi, ikki marta siljimasin)
        fade: { "0%": { opacity: "0" } },
        // Telefon menyusi chapdan kiradi
        "drawer-in": { "0%": { transform: "translateX(-100%)" } },
        // Savatga qator qo'shildi
        "line-in": { "0%": { opacity: "0", transform: "translateY(-6px)" } },
        // Son o'zgardi — yengil "urish"
        bump: { "0%": { transform: "scale(1.04)" } },
        // PIN tekshirilayotganda nuqtalar to'lqin bo'lib ko'tariladi
        wave: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        // Sahifa va kartochkalar pastdan yengil ko'tarilib ochiladi
        rise: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "none", opacity: "1" },
        },
        // Diagramma ustunlari pastdan o'sib chiqadi
        grow: {
          "0%": { transform: "scaleY(0)" },
          "100%": { transform: "scaleY(1)" },
        },
        // 3D mato taxlami: har qavat tepadan tushib joylashadi, keyin sekin "nafas oladi"
        "sheet-drop": {
          "0%": { transform: "translateZ(calc(var(--z) + var(--drop)))", opacity: "0" },
          "100%": { transform: "translateZ(var(--z))", opacity: "1" },
        },
        "sheet-float": {
          "0%, 100%": { transform: "translateZ(var(--z))" },
          "50%": { transform: "translateZ(calc(var(--z) + var(--lift)))" },
        },
        "grow-x": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        sway: {
          "0%, 100%": { transform: "rotateX(58deg) rotateZ(-40deg)" },
          "50%": { transform: "rotateX(56deg) rotateZ(-33deg)" },
        },
      },
      animation: {
        shake: "shake 360ms ease-in-out",
        confetti: "confetti var(--time) cubic-bezier(0.2, 0.6, 0.4, 1) var(--delay) both",
        pop: "pop var(--dur-4) var(--ease-spring) both",
        rise: "rise var(--dur-3) var(--ease-emphasized) backwards",
        fade: "fade var(--dur-2) var(--ease-standard) backwards",
        grow: "grow var(--dur-3) var(--ease-standard) backwards",
        // Suzish chekli: 10 marta (~1 daqiqa) — ochiq qolgan ekran kompozitorni band qilmaydi
        sheet:
          "sheet-drop var(--dur-4) var(--ease-emphasized) var(--delay) both, sheet-float 6s ease-in-out calc(var(--delay) + 0.5s) 10",
        "sheet-still": "sheet-drop var(--dur-4) var(--ease-emphasized) var(--delay) both",
        "grow-x": "grow-x var(--dur-3) var(--ease-standard) backwards",
        sway: "sway 14s ease-in-out 4",
        "drawer-in": "drawer-in var(--dur-3) var(--ease-emphasized) both",
        "line-in": "line-in var(--dur-2) var(--ease-standard) backwards",
        bump: "bump var(--dur-3) var(--ease-spring) both",
        wave: "wave 600ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
