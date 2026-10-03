# mato-savdo — Claude uchun ish qoidalari

Mato sotuvchilar uchun SaaS (multi-tenant): sklad, partiyalar, sotuv, nasiya, hisobotlar. Talablar to'liq yozilgan va biznes egasi tomonidan tasdiqlangan. Sening vazifang — shu hujjatlar asosida kodni modulma-modul yozish.

## Avval o'qi (har yangi sessiyada)
1. `PROGRESS.md` — qayerda to'xtaganmiz, qabul qilingan qarorlar
2. `docs/01-biznes-maqsad.md`, `docs/02-loyiha-tavsifi.md`
3. `docs/03-details/` — har modulning to'liq tavsifi (sahifalar, maydonlar, qoidalar, chekka holatlar)
4. `docs/04-sahifalar-xaritasi.md`, `docs/04-eskizlar.md`
5. `docs/atamalar.md` — interfeysda qaysi so'z ishlatilishi (masalan "kamomad" emas, "Metr farqi")
6. `docs/biznesdan-savollar.md` — hali ochiq savollar (hozirgi taxmin bo'yicha qur, lekin oson o'zgartiriladigan qilib)
7. `docs/06-dizayn-va-sezgi.md` — ranglar, harakat, 3D, tovush va tebranish qoidalari; yangi sahifa shu umumiy qismlardan (`frontend/src/shared/ui/`, `shared/feedback/`) quriladi

Hujjatlarda yozilmagan narsani o'zingcha o'ylab topma — so'ra. Hujjatlar bilan kod zid bo'lib qolsa, hujjat ustun; o'zgartirish kerak bo'lsa avval kelish, keyin hujjatni ham yangila.

## Texnologiya steki
(tasdiqlangan)
- **Backend:** Python, FastAPI, SQLAlchemy 2 (async), Alembic (migratsiyalar), Pydantic
- **Baza:** PostgreSQL — `business_id` + Row-Level Security (qo'shimcha himoya qatlami)
- **Fon vazifalari:** Redis + navbat (ARQ yoki Celery) — xabarlar, kunlik xulosa, eksport
- **Frontend:** React + TypeScript + Vite, PWA (vite-plugin-pwa), React Router, TanStack Query, i18next (uz/en/ru), Tailwind CSS
- **Skaner:** brauzer kamerasi orqali (masalan @zxing yoki html5-qrcode)
- **Real vaqt:** Server-Sent Events (SSE) + Redis pub/sub — xabarlar, ko'chirish keldi, qoldiq va dashboard yangilanishi sahifani yangilamasdan
- **Boshqa:** pyotp (2FA), openpyxl (Excel), Docker Compose (ishga tushirish)

## Ish tartibi
1. **Papka skeleti:** tayyor (barcha papkalar inglizcha). `modules/NN-name/README.md` — modullar xaritasi; kod `backend/app/modules/<name>/` (models.py, schemas.py, service.py, router.py, permissions.py) va `frontend/src/modules/<name>/` da.
2. **Baza sxemasi:** butun loyiha uchun (mermaid erDiagram) → `docs/05-baza-sxemasi.md`. Muhim qarorlarni tushuntir. Tasdiq so'ra. Tasdiqsiz kod yozma.
3. **Modullar shu tartibda:** 00-core → 01-platform-admin (minimal) → 02-structure → 03-catalog → 04-receiving → 05-inventory → 09-notifications (tizim ichida) → 06-sales → 07-credit → 08-reports → 10-telegram.
4. **Har modul ichida, har qadam alohida va tasdiq bilan:** reja → jadvallar (migratsiya) → backend → frontend → tekshiruv/testlar → yakun (modul README va PROGRESS.md yangilanadi).
5. **Bitta modul to'liq tugamaguncha keyingisiga o'tma.** "Tugadi": detallar hujjatidagi barcha sahifa va qoidalar ishlaydi, asosiy ssenariylar tekshirilgan, ruxsatlar to'g'ri, README va PROGRESS yangilangan.
6. Har modul oxirida qisqa xulosa: nima rejadagidek bo'lmadi, qanday texnik qarz qoldi.

## Majburiy texnik qoidalar
- **Multi-tenant:** har jadvalda `business_id` (bog'liq jadvallarda ham) + RLS, `SET LOCAL app.business_id` har tranzaksiyada; har so'rov joriy biznes bilan cheklanadi (bir biznes boshqasining ma'lumotini hech qachon ko'rmaydi). Buni testlar bilan tekshir.
- **Baza sessiyalari:** biznes ichidagi har so'rov — `tenant_session(business_id)` (rol `mato_app`, RLS ta'sir qiladi). `system_session()` (RLS'dan tashqari) faqat uch joyda: kirishda qidiruv (biznes hali noma'lum), platforma paneli, barcha bizneslar bo'yicha fon vazifalari. Har yangi biznes jadvali migratsiyasida `enable_tenant_rls(...)` (`app/core/rls.py`) chaqiriladi va izolyatsiya testi yoziladi.
- **Ruxsatlar server tomonida:** tannarx sotuvchiga, foyda sotuvchi va omborchiga API javoblarida ham qaytmaydi.
- **Pul:** so'm, butun son (float emas). **Metr va kg:** aniq o'nli tur (decimal/numeric).
- **Qoldiq faqat `inventory.service.move_stock` orqali o'zgaradi** — u `stock_movements` ga yozadi va `batch_stock` ni bitta tranzaksiyada yangilaydi; `batch_stock` boshqa joyda to'g'ridan-to'g'ri o'zgartirilmaydi. `daily_summary` ham faqat bitta funksiya orqali.
- **Qoldiq — harakatlar jurnali (ledger):** har kirim, jo'natish, qabul, sotuv, qaytarish, bekor qilish, partiya yopish/qayta ochish alohida yozuv. Qoldiq shulardan kelib chiqadi; partiya kartochkasida har metrning tarixi ko'rinadi.
- **Bir vaqtdagi amallar:** sotuv, ko'chirish, yopish — tranzaksiya ichida, qoldiq qulflanadi.
- **Takrorlanishdan himoya:** pul yoki qoldiq yozadigan har "yaratish" amaliga — sotuv, qarz to'lovi, kirim, ko'chirish — mijoz tomonda noyob identifikator (`client_uuid`, idempotency key; biznes ichida noyob). Shu identifikator qayta kelsa server yangi yozuv yaratmaydi — avvalgisini qaytaradi; mazmuni avvalgisidan farq qilsa — 409 (jimgina eskisini qaytarmaydi). Javob kelmasa yoki server 5xx qaytarsa natija "noaniq": interfeys o'sha mazmunni o'sha identifikator bilan qayta yuboradi; identifikator faqat server aniq rad etganda (4xx) yoki amal tasdiqlanganda yangilanadi. Sotuvda savat qurilmada saqlanadi va natija noaniq bo'lsa qulflanadi.
- **Hech narsa o'chirilmaydi** (biznes, xodim, joy, mato, SKU, mijoz, kirim) — faqat faolsizlantirish/bekor qilish.
- **Jurnal (audit log):** hodisa kodi + ma'lumot sifatida (matn emas), kategoriyalar bilan; o'zgartirib bo'lmaydi.
- **Til:** interfeys uz (lotin), en, ru — birinchi kundan barcha matnlar tarjima fayllarida. Xabarlar va jurnal kod sifatida saqlanadi.
- **Vaqt:** barcha kun chegaralari va hisobotlar Asia/Tashkent bo'yicha.
- **Kirish:** telefon + parol; do'kon qurilmasi do'konning o'z logini/paroli bilan (yoki egasi bog'laydi) ochiladi, unda sotuvchi faqat 4 xonali PIN bilan kiradi (PIN'ni faqat biznes egasi o'rnatadi); platforma egasi uchun 2FA (TOTP) + zaxira kodlar — hozircha ixtiyoriy (Xavfsizlik sahifasida o'zi yoqadi), `PLATFORM_2FA_REQUIRED=true` bilan majburiy.
- **Xabarlar fonda** (navbat) yuboriladi — sotuv tezligiga ta'sir qilmaydi.
- **Zaxira:** kunlik, serverdan tashqarida, shifrlangan.
- **Tezlik (qotmaslik):** tranzaksiyalar qisqa va faqat kerakli qatorni qulflaydi (SELECT ... FOR UPDATE partiya-joy qatoriga, butun jadvalga emas); so'rovlarda N+1 yo'q; filtr va bog'lanish ustunlarida indekslar; hisobotlar kunlik yig'ma jadvallardan; sekin ishlar (Telegram, Excel, kunlik xulosa) faqat fonda; ulanishlar puli (connection pool).

## Muloqot
- Foydalanuvchi bilan o'zbek tilida (lotin) gaplash.
- Har qadamda nima qilayotganingni va nega — 1-3 jumla. Har qadam oxirida tasdiq so'ra.
- Bir javobda bitta fayl yoki bitta mantiqiy bo'lak.
