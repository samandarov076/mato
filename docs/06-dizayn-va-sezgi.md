# 06 — Dizayn tizimi, harakat, tovush va tebranish

Bu hujjat interfeysning "sezgi" qatlamini belgilaydi: ranglar (kontrast), harakat tokenlari, 3D, tovush va
tebranish, kirish imkoniyati. Kod: `frontend/src/index.css`, `tailwind.config.js`, `src/shared/ui/*`,
`src/shared/feedback/*`, `src/shared/ui/hero3d/*`. 2026-10-03 audit (7 nuqtai nazar, 140 topilma) asosida.

## 1. Ranglar — WCAG AAA kontrast

Tokenlar `R G B` ko'rinishida (`index.css :root` va tungi bloklar). Har rangning o'z ishi bor:
indigo — asosiy amal; leaf — pul, sotuv, muvaffaqiyat; saffron — nasiya, ogohlantirish; madder — xato,
kamomad; sky — ombor; plum — katalog; coral — hisobot; rose — tuzilma.

| Token (kunduz) | Qiymat | oq fonda | sahifa fonida | o'z "soft" fonida |
|---|---|---|---|---|
| ink | 24 27 42 | 17.1 | 15.8 | — |
| muted | 73 77 94 | 8.4 (AAA) | 7.8 (AAA) | 7.0 (indigo-soft) |
| indigo | 56 71 185 | 7.6 (AAA) | 7.0 (AAA) | 6.4 (AA) |
| leaf | 15 96 58 | 7.6 | 7.1 | 6.7 (AA) |
| saffron | 122 72 4 | 7.6 | 7.1 | 6.8 (AA) |
| madder | 154 42 54 | 7.6 | 7.1 | 6.5 (AA) |
| sky | 4 91 117 | 7.6 | 7.1 | 6.6 (AA) |
| coral | 141 59 28 | 7.6 | 7.0 | 6.5 (AA) |
| edge (maydon chegarasi) | 126 141 188 | 3.3 (UI 3:1) | 3.0 | — |

Qoidalar:
- Matn oq va sahifa fonida — 7:1 (AAA). Rangli yorliq (`Chip`: rang matni + soft fon) — 4.5:1 dan yuqori (AA);
  7:1 soft fonda rangni qoraytirib yuboradi — ataylab AA da qoldirildi.
- Shaffof matn ishlatilmaydi (`text-muted/60`, `text-white/75` — taqiq): placeholder — `text-muted`, gradient
  kartochkada — `text-white` to'liq, gradient oxiri `--hero-to` (oq matn 7.2:1).
- Kiritish maydoni chegarasi — `border-edge` (3:1); kartochka va ajratgich — `border-line` (bezak).
- Toggle "o'chiq" holati — `bg-muted` yo'l + `bg-panel` tugmacha; PIN bo'sh nuqtasi — `border-muted`;
  diagramma "bo'sh" ustuni — `bg-indigo/70` (3.5:1).
- Fokus halqasi: `focusRing` / `focusWithinRing` (`tones.ts`) — to'liq rangli 2px, 2px oraliq. Shaffof halqa
  (`ring-indigo/20`) ishlatilmaydi.
- Tungi rejim: muted 181 185 200, madder 240 153 162, indigo 172 184 237, leaf 133 200 156, rose 244 152 195 —
  hammasi o'z soft fonida 7:1.

## 2. Harakat tokenlari

`index.css :root`:

| Token | Qiymat | Qayerda |
|---|---|---|
| `--dur-1` | 120 ms | bosilish, rang almashishi |
| `--dur-2` | 200 ms | paydo bo'lish, menyu |
| `--dur-3` | 320 ms | kartochka ko'tarilishi, tanlov belgisi siljishi |
| `--dur-4` | 500 ms | "sakrab" chiqish, son sanash |
| `--ease-standard` | cubic-bezier(0.2, 0, 0, 1) | odatiy |
| `--ease-emphasized` | cubic-bezier(0.05, 0.7, 0.1, 1) | kirish |
| `--ease-exit` | cubic-bezier(0.3, 0, 0.8, 0.15) | chiqish |
| `--ease-spring` | `linear(...)` — so'ngan prujina (stiffness 260, damping 14, ~12% oshib ketish) | pop, PIN nuqtasi, son "urishi" |
| `--ease-spring-soft` | `linear(...)` (200/22, ~2% oshish) | tanlov belgisi, pastki menyu tabletkasi, Toggle |

Prujina egri chizig'i Python'da so'ngan tebranish tenglamasidan 24 nuqta bilan olingan; `linear()`ni
qo'llamagan brauzerlarda `cubic-bezier` zaxirasi. Tailwind: `duration-fast|base|slow|grand`,
`ease-standard|emphasized|exit|spring|spring-soft`.

Mikro-animatsiyalar (hammasi faqat `transform`/`opacity`):
- Sahifa almashishi — `animate-fade` (shaffoflik), kartochkalar — `.stagger` (40 ms qadam, 6 tadan keyin birga).
- Tugma: `press` (pastki qirra cho'kadi), `pressable` (0.97 ga kichrayadi) — sensorli ekranda hover yo'q, shu
  bitta javob; `-webkit-tap-highlight-color: transparent`.
- Tanlov (`Segmented`), pastki menyu tabletkasi — bitta belgi variantlar orasida prujina bilan siljiydi.
- Savatga qator — `animate-line-in`; jami o'zgarsa — `animate-bump`; PIN nuqtasi — scale 1.25 prujina,
  tekshirilayotganda to'lqin (`animate-wave`).
- Uzun ro'yxat qatorlari — `reveal` (scroll-driven `animation-timeline: view()`, qo'llamagan brauzerda oddiy).
- 3D og'ish (`.tilt`) faqat sichqonchali qurilmalarda (`hover: hover and pointer: fine`); yaltirash dog'i
  `transform` bilan siljiydi, gradient qayta chizilmaydi; ko'tarilgan soya `::after` opacity bilan.
- Hisoblagich (`CountUp`) — barcha kartochkalar bitta `requestAnimationFrame` siklidan, DOM'ga to'g'ridan-to'g'ri yoziladi.
- Cheklar: Dashboard'da cheksiz animatsiya yo'q (`FabricStack still`); kirish sahifasida suzish 10 sikl (~1 daqiqa).
- `prefers-reduced-motion`: barcha davomiylik va kechikish 0; faqat `animate-spin`/`animate-pulse` (holat belgisi)
  sekin qoladi; scroll-driven va skelet yaltirashi o'chadi.

## 3. 3D

- Kirish sahifasi (≥1024 px): WebGL sahna `shared/ui/hero3d/FabricScene.tsx` (Three.js + React Three Fiber).
  Beshta mato "plita"si `RoundedBox` (2.4 × 0.11 × 1.7, radius 0.032) + `meshPhysicalMaterial` (roughness 0.8,
  metalness 0, sheen 1, sheenRoughness 0.45, sheenColor — har matoning och rangi, envMapIntensity 1.3, bumpScale
  0.012 — to'qima teksturasi 28×20 takror); ustki mato — canvas'da chizilgan adras naqshi (brand.tsx bilan bir
  xil, 176×264 plitka, SRGB, anisotropy 8), rangi oq (naqsh teksturaning o'zida). Yorug'lik: ambient 0.45,
  yo'naltirilgan 3.0 (#fff4e0, 2048 soya xaritasi, bias −0.00025, normalBias 0.02) + `Environment` (256) ichida
  uchta `Lightformer` (issiq tepa 4, sovuq chap 2, halqa 2.5) — tarmoqdan HDR yuklanmaydi. Yer: `shadowMaterial`
  (opacity 0.26) + `ContactShadows` (opacity 0.55, blur 2.6). Post-ishlov: `DepthOfField` (target [0, 1.2, 0],
  focalLength 0.04, bokehScale 2) + `Vignette` (offset 0.25, darkness 0.45), faqat WebGL2 va dpr ≤ 2 da. Kamera
  [0, 3.2, 6.6] → (0, 1.1, 0), fov 30, ACES exposure 1.15, dpr 1–1.5; oyna yashirin bo'lsa chizish to'xtaydi.
  Qavatlar 0.12 s farq bilan tepadan tushadi (`easing.damp3`, 0.34 s), sichqoncha bo'yicha ±0.22 rad parallaks,
  `Float` bilan sekin suzadi.
- Shisha kartochka (glassmorphism): `bg-white/10 backdrop-blur-xl border-white/20` + ichki yorug' chiziq.
- Zaxira: ekran < 1024 px (panel ko'rinmaydi — Three.js umuman yuklanmaydi) / WebGL yo'q / harakat
  kamaytirilgan / `saveData` / bo'lak yuklanmasa (oflayn) — CSS 3D `FabricStack`.
  Three.js bo'lagi (~277 KB gzip) service worker tomonidan oldindan keshlanmaydi (`globIgnores`).
- Bosh sahifa va boshqa joylar — CSS 3D (`FabricStack`, `chip-3d`, `.tilt`); planshetda WebGL ishlatilmaydi.

## 4. Tovush (`shared/feedback/audio.ts`)

Web Audio bilan sintez — fayl yo'q, oflaynda ishlaydi. Umumiy kuch 0.6, kompressor, bir xil tovush 35 ms dan
tez takrorlanmaydi. Fazoviy: bosilgan nuqtaning gorizontal o'rni `StereoPanner` pan'iga (±0.7).

| Hodisa | Tovush | Qayerda |
|---|---|---|
| tap | 35 ms shovqin (3200→1100 Hz) + 28 ms 1400 Hz | Button, RowAction, menyu |
| tick | 16 ms 2600 Hz | PIN raqami, Segmented, til |
| toggle | 65 ms triangle 1100→1500 (yoqish) / 1500→1000 (o'chirish) | Toggle, rejim, tovush tugmasi |
| select | 740 Hz triangle 50 ms + 1480 Hz 60 ms | savatga qo'shish, nusxa olish |
| success | C6–E6–G6 (1046/1318/1568 Hz) 70 ms qadam, 0.5 s so'nish | `Alert tone=success`, PIN to'g'ri |
| warning | 520 → 440 Hz triangle | xavfli tugma (danger) |
| error | 220→180 Hz triangle, ikki marta | `Alert tone=error`, PIN xato, forma xatosi |
| remove | shovqin 1800→300 Hz + 300→150 Hz | qator o'chirish |
| scan | 1760 Hz 60 ms + 2217 Hz 80 ms | etiketka topildi |
| swish | shovqin 600→2400 Hz 160 ms (tebranishsiz) | sahifa almashishi |
| cash | 2637 Hz + 3520 Hz "jiring" | to'lov qabul qilindi |
| celebrate | arpejio C5…G6 + akkord | biznes yaratildi (konfetti) |

Brauzer qoidasi: tovush foydalanuvchi sahifaga bir marta tekkanidan keyin ochiladi (`installAudioUnlock`).

## 5. Tebranish (`shared/feedback/haptics.ts`, `navigator.vibrate`, ms)

| Hodisa | Naqsh |
|---|---|
| tap | [8] |
| tick | [4] |
| toggle | [6, 24, 6] |
| select | [10] |
| success / cash | [12, 48, 24] |
| warning | [20, 40, 20] |
| error | [40, 36, 40, 36, 40] |
| remove | [14, 30, 8] |
| scan | [6, 20, 12] |
| celebrate | [10, 40, 10, 40, 30, 60, 60] |
| swish | — (sahifa almashganda planshet titramaydi) |

Android/Chrome'da ishlaydi; iPhone/iPad Safari `navigator.vibrate`ni qo'llamaydi — jim o'tadi.

## 6. Sozlamalar

`localStorage["mato.feedback"] = {"sound": true, "haptics": true}` — qurilmada (hisobda emas: do'kon planshetiga
bir sozlama). Yuqori panelda tovush tugmasi (🔊/🔇); Profil → "Tovush va tebranish" kartochkasida ikkala toggle.
Standart: ikkalasi yoqilgan.

## 7. Kirish imkoniyati (a11y) — qoidalar

- Har sahifada `PageTitle` (h1 24px) → `document.title` ham o'zgaradi. Tab tartibi: "Asosiy qismga o'tish"
  havolasi → sahifa almashganda fokus `main`ga (skaner maydoni o'zi fokus olsa — tegilmaydi).
- Telefon menyusi: `role=dialog`, fokus ichkariga, Tab aylanadi, ortidagi sahifa `inert`, yopilganda fokus tugmaga.
- Tasdiq: `ConfirmBar` — fokus "Yo'q, qolsin"ga, yopilganda ochgan tugmaga; ochgan tugma DOM'da qoladi.
- Sensorli ekranda bosish maydoni 44 px (`RowAction`, tablar, Toggle ko'rinmas maydoni, ikonka tugmalari).
- Ro'yxat/holat: `Loading` (`role=status`), `Alert` (`role=alert|status`), nusxa olindi — sr-only status.
- Jadval telefonda kartochkaga aylansa ham ARIA rollari (table/row/columnheader/cell) saqlanadi.
- Diagramma ustunlari tugma: `aria-label` qiymat bilan, sr-only ro'yxat.
- Til tanlovida `lang` atributi; `Segmented` — ARIA radio guruhi, ← → Home End.

## 8. Ko'rsatkichlar (ishlab chiqarish yig'masi)

Kirish bo'lagi 826 KB → 234 KB (gzip 235 → 60 KB); tillar, 2FA, hisobot/katalog/kirim/tuzilma/sozlamalar/
platforma — alohida bo'laklar; shrift o'zimizda (Google Fonts yo'q), service worker shrift va belgilarni
oldindan keshlaydi, tovar rasmlari `CacheFirst`; backend `GZip` (JSON 6–8 marta kichik) va 96 px rasm varianti.
