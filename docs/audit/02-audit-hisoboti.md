# Audit hisoboti

**Sana:** 2026-10-14 · **Asos:** `01-loyiha-xaritasi.md` · **Holat:** ishchi daraxt (commit qilinmagan 45 fayl bilan), branch `audit-va-ui-zichligi`
**Usul:** kod o'qish (uch mustaqil yo'nalish), so'rov vaqtlarini o'lchash (lokal baza, 76 partiya / 27 sotuv), `pip-audit`, `npm audit`, yig'ma hajmi. Hech narsa o'zgartirilmadi.
**Taxminlar:** pilot — bitta biznes, yuzlab SKU, do'konda 500–2000 ochiq partiya-joy qatori; maqsad hali aniqlanmagan (3-bosqich).

## Eng muhim 5
1. 🔴 **Hisobdan chiqarilgan nasiya qaytarilsa, kassadan mijoz to'lamagan pul chiqadi** — `credit/service.py:172-179` (`offset_return`) + `sales/service.py:701-704`. `remaining` hisobdan chiqarilgan summani ham ayiradi, shuning uchun qaytarishda qarzdan ayiriladigan qism 0 bo'lib, butun summa naqd qaytadi. Sotuvchi ham hisobdan chiqara, ham qaytara oladi — firibgarlik yo'li (soxta mijoz → nasiya → hisobdan chiqarish → qaytarish).
2. 🔴 **Qaytarishda `client_uuid` yo'q** — `sales/service.py:662`, `ReturnIn`. Javob yo'qolib tugma qayta bosilsa, qisman qaytarish ikki marta yoziladi: pul ikki marta chiqadi, qoldiq ikki marta kiradi.
3. 🟠 **Sotuvda takror tekshiruvi qulfdan oldin** — `sales/service.py:246-249`. Bir savatning ikki so'rovi bir vaqtda kelsa, ikkinchisi kam qoldiqni ko'rib 409 `negative_stock_note_required` qaytaradi; interfeys 4xx da savatni ochib uuid'ni yangilaydi → ikki marta sotuv.
4. 🟠 **Sotuvchi istalgan do'kon qarzini hisobdan chiqaradi + hisobdan chiqarishda `client_uuid` yo'q** — `credit/router.py:150-154`, `credit/service.py:617-626`. 1-band bilan birga pul yo'qolish yo'li.
5. 🟠 **Ishlab chiqarishda xavfsiz bo'lmagan holatga "jim" tushish** — `config.py:25` `APP_ENV` sukuti `dev` (cookie `Secure` emas, `CREDENTIALS_KEY` tekshiruvi o'chadi), `SECRET_KEY` uzunligi tekshirilmaydi (`.env.prod.example` placeholder bilan ham ishga tushadi), Excel eksportida formula kiritish (`reports/export.py:43`).

Umumiy manzara: arxitektura (RLS, ledger, qulflar tartibi, idempotency, butun so'm) to'g'ri qurilgan va testlar kuchli; topilmalar asosan **nasiya ↔ qaytarish kesishmasi** va **o'sishga tayyorlik** (indeks, N+1) atrofida.

## Xavfsizlik
Tekshirildi va to'g'ri: har biznes endpointida auth/rol bor, platforma — `PlatformAuth`; `system_session()` ning 7 joyida ham aniq `business_id`/`user_id` sharti bor; raw SQL faqat `db.py:85` da (parametrli), `rls.py` f-string'lari faqat migratsiyada va ekranlangan; klientdan kelgan har ID yozishdan oldin `tenant_session` ichida yuklanadi; tannarx/foyda sotuvchi va omborchiga hech qaysi API'da qaytmaydi (sale card, batch card, hisobotlar, eksport, xabarlar, Telegram); JWT HS256 qat'iy; cookie `httpOnly`+`secure`(prod)+`samesite=strict`; frontend'da token faqat xotirada, `innerHTML`/`eval` yo'q; CSP `script-src 'self'`; `pip-audit` toza; `npm audit` — faqat react-router (quyida).

| # | Qayerda | Muammo | Xavf | Og'irlik | Mehnat |
|---|---------|--------|------|----------|--------|
| X3 | credit/router.py:150-154, credit/service.py:617-626 | Sotuvchi biznesdagi istalgan qarzni hisobdan chiqaradi — o'z do'koni bilan cheklanmagan (hujjatda tan olingan: 07-nasiya.md:98) | Pul o'g'irlash yo'li (T1 bilan) | 🟠 | S |
| X4 | reports/export.py:43-44, credit/router.py:86-98, sales/router.py:118-131 | openpyxl `=` bilan boshlangan matnni formula qiladi; mijoz nomi/izoh sotuvchi kiritadi → egasining Excel'ida formula (=HYPERLINK, DDE) | Excel formula kiritish | 🟠 | S |
| X12 | config.py:25,56; auth/router.py:51; vault.py:23 | `APP_ENV` sukuti `dev`: prod'da unutilsa cookie `Secure` emas, `CREDENTIALS_KEY` `SECRET_KEY` dan hosil qilinadi | Fail-open | 🟠 | S |
| X13 | config.py:27; .env.prod.example:39-42 | `SECRET_KEY` uzunligi/entropiyasi tekshirilmaydi, placeholder bilan ishga tushadi | JWT soxtalashtirish | 🟠 | S |
| X22 | frontend/package.json: react-router-dom 6.30 | CVE-2025-68470 bypass (ochiq yo'naltirish `<Link>`/`useNavigate` backslash bilan) va SSR deserializeErrors — ikkinchisi SSR'siz tegishli emas; birinchisi faqat tashqi `to` qiymatida (kodda yo'q) | Past (hozirgi kodda ekspluatatsiya yo'li yo'q) | 🟡 | L (6→7 katta versiya) |
| X5 | credit/router.py:71-101 | Sotuvchi barcha mijozlarni (telefon, qarz) 5000 qatorgacha Excel'ga oladi | Mijozlar bazasi olib ketilishi | 🟡 | S |
| X8 | auth/service.py:261-269 | Refresh token qayta ishlatilsa (60 s grace'dan keyin) sessiya zanjiri bekor qilinmaydi, faqat 401 | O'g'irlangan token sezilmaydi | 🟡 | M |
| X9 | platform/two_factor.py:49-51 | TOTP kodi ±30 s oynada qayta ishlatiladi (oxirgi qadam saqlanmaydi) | Ushlab olingan kod | 🟡 | S |
| X10 | two_factor.py:92, security.py:59-61 | Zaxira kodlar tuzsiz SHA-256, ~40 bit entropiya | Baza oqsa oflayn topiladi | 🟡 | S |
| X11 | ratelimit.py:29-41; auth/service.py:139 | Telefon bo'yicha 10 xato bilan begona egani 15 daqiqa bloklaydi; 4 xonali PIN'ga do'konga kuniga ~60 urinish | DoS; uzoq muddatli PIN topish | 🟡 | M |
| X14 | config.py:37 | `platform_2fa_required` sukuti `False` | Platforma egasi faqat parol bilan | 🟡 | S |
| X1 | core/media.py:100-113 | Rasm tokensiz, `Cache-Control: public` (ataylab: 128-bit nom, traversal yopiq) | URL'ni bilgan ko'radi | 🟡 | — |
| X2 | core/media.py:39,91-97 | `Image.open` formatsiz; yuklash kvotasi yo'q; ishlatilmagan rasm o'chirilmaydi | Disk to'lishi | 🟡 | S |
| X6 | receiving/service.py:253,142 vs inventory/service.py:517 | Omborchi tannarxni kirimda ko'radi, partiya kartasida ko'rmaydi — qoida bir xil emas (hujjatlashtirilgan) | Chalkashlik | 🟡 | S |
| X7 | frontend/src/shared/draft.ts:20 | Kirim qoralamasi (`cost_per_m` bilan) `localStorage` da qoladi | Umumiy planshetda tannarx | 🟡 | S |
| X15 | main.py:45-51 | CORS `allow_methods/headers="*"` + credentials (originlar aniq ro'yxat) | Past | 🟡 | S |
| X17 | deploy/backup/keys/mato-backup-key.txt (0644) | age yopiq kaliti dev mashinada hamma o'qiydigan ruxsatda (git'da yo'q) | Barcha zaxiralar ochiladi | 🟡 | S |
| X18 | backup.sh:37-44 | Dump shifrlashdan oldin ochiq holda `/tmp` ga yoziladi; konteyner o'lsa qoladi | Ochiq dump | 🟡 | S |
| X19 | backup.sh:21 | Bot tokeni curl URL'ida (`ps` da ko'rinadi) | Kichik | 🟡 | S |
| X20 | restore.sh:25 | `roles.sql` xatolari yashiriladi | Rol tiklanmagani sezilmaydi | 🟡 | S |
| X21 | git: `mato-savdo (1).zip` | Eski arxiv repoda (ichida sir yo'q) | Gigiyena | 🟡 | S |

## To'g'rilik va ma'lumotlar
Tekshirildi va to'g'ri: `batch_stock` ga yozuv faqat `inventory/stock.py:46-60` (`move_stock`); qulflar qator darajasida va hamma joyda `batch_id` tartibida; pul `int`, metr `Numeric(12,2)`, kg `(12,3)`, yaxlitlash `ROUND_HALF_UP` backend/Postgres/frontend'da bir xil; `after_commit` dizayni to'g'ri (Redis/Telegram faqat commitdan keyin); hisoblagichlar uzluksiz (upsert qulfi, savepoint bilan qaytadi); kun chegaralari `business.timezone`; sotuv/kirim/ko'chirish/to'lov idempotentligi `UNIQUE(business_id, client_uuid)` + IntegrityError bilan; hujjat qoidalari (10 daqiqa bekor, boshlang'ich to'lov = jami, ikki bosqichli ko'chirish, manfiy qoldiqda izoh, eng eski qarzdan to'lov, due_date) kodga mos.

| # | Qayerda | Muammo | Xavf | Og'irlik | Mehnat |
|---|---------|--------|------|----------|--------|
| T1 | credit/service.py:172-179, sales/service.py:701-704, credit/service.py:641 | Hisobdan chiqarilganda qarz `active` qoladi, `remaining` 0 → qaytarishda `offset`=0 → butun summa naqd qaytadi. Misol: nasiya 1 000 000, to'langan 200 000, 800 000 hisobdan chiqarilgan → to'liq qaytarishda mijozga 1 000 000 beriladi | Kassadan pul chiqadi; firibgarlik yo'li | 🔴 | S |
| T2 | sales/service.py:662, sales/schemas.py (`ReturnIn`) | Qaytarishda `client_uuid` yo'q; holat to'sig'i ham yo'q — qisman qaytarish ikki marta yoziladi | Ikki marta pul va qoldiq | 🔴 | M |
| T3 | sales/service.py:246-249 → 263-291 → 339-362 | uuid tekshiruvi qulfdan oldin; bir vaqtdagi ikki so'rovda ikkinchisi kam qoldiqni ko'rib 409 qaytaradi, interfeys uuid'ni yangilaydi → ikki sotuv (ko'chirishda bu yo'q — u avval hisoblagichni qulflaydi) | Kam qoldiqli partiyada ikki sotuv | 🟠 | S |
| T4 | credit/service.py:617 | `write_off` da `client_uuid` yo'q — qisman hisobdan chiqarish ikki marta | Qarz noto'g'ri kamayadi | 🟠 | S |
| T5 | receiving/service.py:498-524 | `cancel_receipt` qoldiqni qulfsiz o'qiydi (`db.get(BatchStock)`, :510); bir vaqtda ko'chirish/ikki bekor — manfiy qoldiq | Qoldiq noto'g'ri (ledger buzilmaydi) | 🟠 | S |
| T6 | inventory/stock.py:75 → alerts.py | `move_stock` har harakatda `notifications` ga UPDATE/INSERT; savat SKU bo'yicha saralanmagan → ikki sotuvda xabar qatorlarida deadlock mumkin | Kamdan-kam 500 | 🟡 | S |
| T7 | receiving/service.py:433-494 | `update_batch` partiyani qulflamaydi (delta eski qiymatdan), yopiq partiyada ham `correction` yozadi | `received_m` siljiydi | 🟡 | S |
| T8 | credit/service.py:187-188 vs 07-nasiya.md:57, 06-sotuv.md:120 | Hujjat: "bekor qilinsa qarz tiklanadi"; kod: to'lov/hisobdan chiqarish bo'lsa bekor rad etiladi (kod qat'iyroq) | Hujjat-kod farqi | 🟡 | S |
| T9 | transfers.py:503, sales/service.py:647,733, inventory/service.py:695 | Qabul/qaytarish/bekor yopiq partiyani o'zi ochadi, lekin `BatchClosure.reopened_at` bo'sh — keyin `batch_not_closed`, kamomad hisobotda abadiy | Metr farqi hisoboti noto'g'ri | 🟡 | M |
| T10 | telegram/service.py:234-237 | Bizneslar siklida alohida `try` yo'q — bitta biznes xatosi qolganlarning xulosasini to'xtatadi; yuborish paytida tenant tranzaksiyasi ochiq | Kunlik xulosa yetmaydi | 🟡 | S |
| T11 | worker.py:138-146, 244 | Dedup `Notification` qatoriga bog'liq; 90 kunlik tozalashdan keyin eslatmalar qaytadan keladi | Takroriy xabar | 🟡 | S |
| T12 | sales/service.py:573-578 vs reports/service.py:150-155 | Foyda kartochkada `round((narx−tannarx)×m)`, hisobotda `amount − round(tannarx×m)` → ±1 so'm farq | Ekranlar mos kelmaydi | 🟡 | S |
| T13 | 0007_sales.py:117 (`amount > 0`), sales/service.py:692-696 | Juda kichik metr×narxda qaytarish summasi 0/−1 → CHECK → 500 | Chekka holat | 🟡 | S |
| T14 | EntryForm.tsx:292, CloseBatchPage.tsx:140, SkuPage.tsx:144-145 | UI'da float+`Math.round`; `SkuPage` ekvivalent narxni `price_rounding` siz ko'rsatadi | 1 so'm farq (server tekshiradi) | 🟡 | S |
| T15 | sales/service.py:305-307 | Klient yuborgan `kg` metr×koeffitsientga mosligi tekshirilmaydi | Ma'lumot sifati | 🟡 | S |
| T16 | 07-nasiya.md:15 vs credit/service.py:258,309 | Hujjat "30+ kun", kod `due_date < today` | Eski qator | 🟡 | S |
| T17 | receiving/service.py:291-324, credit/service.py:569-571 | Takror solishtiruvida kirimda `kg/m_per_kg/price/note`, to'lovda `debt_id` hisobga olinmaydi | O'zgarish jimgina yo'qoladi | 🟡 | S |

## Tezlik
**O'lchovlar (oldin), lokal baza: 5 biznes, 86 SKU, 76 partiya, 140 batch_stock, 251 harakat, 27 sotuv, 605 jurnal yozuvi — ya'ni "pol" qiymatlar, hajm o'sganda qayta o'lchanadi.**

| Sahifa / so'rov | O'rtacha (5 marta) | Javob hajmi | Izoh |
|-----------------|------|--------|------|
| `GET /stock` | 31 ms | 24 KB | sahifalangan (50 SKU), lekin ikki qavat sikl (P4) |
| `GET /sales/context?store_id=1` | 22 ms | 38 KB (62 tovar) | sahifalanmaydi; 1000 partiyada ~600 KB (gzip ~100 KB) |
| `GET /reports/dashboard` | 23 ms | 1.4 KB | 8+ agregat |
| `GET /stock/differences` | 21 ms | 1.6 KB | |
| `GET /reports/stock/export` | 20 ms | 5 KB | sinxron openpyxl |
| `GET /customers/{id}` | 17 ms | 1.2 KB | |
| `GET /reports/sales` (30 kun) | 15 ms | 3.4 KB | |
| `GET /batches/closable` | 14 ms | 21 KB | |
| `GET /catalog/skus` | 12 ms | 41 KB | |
| boshqalar (`/sales`, `/transfers`, `/receipts`, `/notifications`, `/audit-logs`, hisobotlar) | 2–11 ms | | |
| Frontend birinchi yuklanish (kirish sahifasi, prod yig'ma) | — | **200 KB gzip** (JS 183 + CSS 14) + shrift subsetlari; Three.js 276 KB gzip faqat ≥1024px va lazy | yaxshi |
| Backend testlar | 30.7 s / 351 | | |

| # | Qayerda | Muammo | Xavf | Og'irlik | Mehnat |
|---|---------|--------|------|----------|--------|
| P1 | inventory/service.py:329-331 | Skaner `func.upper(Batch.number) = …` bilan qidiradi; `uq_batches_business_id_number` xom ustunda → **har skanerda `batches` seq scan** (jadval barcha bizneslar uchun umumiy, RLS keyin filtrlaydi) | Kechikish platforma o'sishi bilan ortadi; sotuvning eng tez bo'lishi kerak amali | 🟠 | S |
| P2 | inventory/stock.py:44-77, inventory/alerts.py:19-60, sales/service.py:263-302,364-377 | Sotuv yozishda N+1: har partiya uchun `get(Batch)`, `get(Receipt)`, `lock_stock`; `move_stock` har qatorda 5–7 so'rov → 10 qatorli savat ≈ 80–100 SQL, qulflar shu vaqt ushlab turiladi | Sotuv sekin, qulf vaqti uzun | 🟠 | M |
| P3 | notifications/service.py:139-158, worker.py:244 | `release/resolve` `WHERE business_id=? AND dedup_key=?` — indeks faqat `(user_id, dedup_key)` → har sotuv qatorida `notifications` seq scan | Umumiy jadval, o'sadi | 🟠 | S |
| P4 | inventory/service.py:259-263 | `list_stock` ichida O(SKU × qator) sikl; eksportda (2000 SKU) millionlab iteratsiya, event loop bloklanadi | Eksport paytida hamma kutadi | 🟠 | S |
| P6 | reports/router.py:171 | Nasiya eksporti `limit=200`, "Jami" esa to'liq summadan → 200+ qarzdorda qatorlar yig'indisi jamiga teng emas | Noto'g'ri hisobot | 🟠 | S |
| P5 | reports/export.py:34-52, barcha `/export` | openpyxl sinxron, `to_thread` yo'q | Worker bloklanadi | 🟡 | S |
| P7 | credit/service.py:104-110,301-305; sales/service.py:449-455; catalog/service.py:97-99,331-335; inventory/service.py:146-160 | `ILIKE '%…%'` qidiruvlar, `pg_trgm` yo'q | Ko'p biznesda sekin | 🟡 | M |
| P8 | sales/service.py:433-434 | `(business_id, seller_id, created_at)` indeksi yo'q | Kichik | 🟡 | S |
| P9 | core/router.py:149-176 | Jurnalda `location_id` filtri indekssiz | Kichik | 🟡 | S |
| P10 | notifications/service.py:190 | `ORDER BY id DESC`, indeks `(user_id, created_at)` | Qo'shimcha sort | 🟡 | S |
| P11 | worker.py:68-100, 238-251 | Cron'da N+1 (har qarz/partiya uchun `notify_owners`, P3 dagi indekssiz COUNT) | Soatlik yuk chiziqli o'sadi | 🟡 | M |
| P12 | receiving/service.py:360-388 | Kirimda har qator uchun `ensure_sku`, flush, `move_stock` → 50 qator ≈ 400+ SQL | Katta kirim sekin | 🟡 | M |
| P13 | EntryForm.tsx:299-315, 669-695 | Fasetlar va `searchItems` (transliteratsiya) har renderda, `useMemo` yo'q; O(rang × SKU) | Arzon planshetda 500+ SKU da kechikish | 🟡 | S |
| P14 | main.tsx:18, Dashboard.tsx:63, Bell.tsx:84 | `staleTime` 10 s + `refetchOnWindowFocus`: sotuv konteksti har qaytishda; dashboard 60 s da 8+ agregat; Bell SSE + 60 s polling | Ortiqcha yuk | 🟡 | S |
| P15 | sales/service.py:173-186 | `/sales/context` da ikkinchi GROUP BY so'rov (`popular_sku_ids`) — ishlatiladi (PROGRESS'dagi "o'lik" yozuvi noto'g'ri), lekin har ochilishda hisoblanadi | Kichik | 🟡 | S |

## Kod sifati va tuzilma
Yaxshi: xatolar bir xil (`AppError`, 22 fayl); identifikatorlar inglizcha, izohlar o'zbekcha; TODO/FIXME yo'q; qattiq yozilgan UI matni yo'q; `manualChunks` va 30 lazy sahifa; ruff/eslint toza.

| # | Qayerda | Muammo | Xavf | Og'irlik | Mehnat |
|---|---------|--------|------|----------|--------|
| K1 | sales/service.py:60-62, inventory/service.py:91, receiving/service.py:66-68 | `int((m × narx).quantize(1, ROUND_HALF_UP))` uch joyda | Biri o'zgarsa farq | 🟡 | S |
| K2 | = T12 | Foyda ikki xil yaxlitlanadi | | 🟡 | S |
| K3 | SkuPage.tsx:138-145 vs sales/service.py:65-75 | kg↔m ekvivalent narx frontend'da `price_rounding` siz | Narx farqi | 🟡 | S |
| K4 | CustomerPage.tsx:91, SaleCardPage.tsx:91, JournalPage.tsx:126,136 | `formatNumber(v) + " so'm"` takror, helper yo'q | Mayda | 🟡 | S |
| K5 | `list_stock` 182 qator, `create_sale` 155, `pin_login` 109, `create_transfer` 103, `login` 100; EntryForm 985, SalePage 897, CustomerPage 716 | Uzun funksiya/fayllar | Ko'rib chiqish qiyin | 🟡 | M |
| K6 | core/router.py:99-206; sales/router.py:86-134; reports/router.py | Jurnal so'rov qurish va eksport formatlash router ichida | Qatlamlar aralash | 🟡 | S |
| K7 | PROGRESS.md "Texnik qarz" 1-band | `popular_sku_ids` "ishlatilmaydi" deyilgan — aslida frontend ishlatadi, test bor | Chalg'ituvchi hujjat | 🟡 | S |
| K8 | shared/ui/tones.ts `focusRingError`, notifications/messages.ts:32 `EVENTS` | Haqiqiy o'lik kod (2 ta); 4 ta ortiqcha `export` | Mayda | 🟡 | S |
| K9 | 12 ta `t(..., {defaultValue})` (StaffPage.tsx:315, LocationsPage.tsx:165 …) | Kalit locales'da bo'lmasa ru/en da o'zbekcha chiqadi | Tarjima | 🟡 | S |

## Testlar
Bor: 351 backend (30.7 s) + 233 frontend (6.7 s), hammasi o'tadi. Parallel holatlar `asyncio.gather` bilan (sotuv ×4, to'lov, qabul, kirim ×5, 10 parallel sotuv bitta partiyada); RLS baza darajasida (INSERT/UPDATE/system role/append-only/DELETE taqiqi); idempotency 409 yo'li; qaytarish+nasiya; 10 daqiqa bekor; tannarx yashirilishi (kartochka, partiya, qoldiq); noaniq natijada qayta yuborish (`SalePage.test.tsx:689,717,782,862`); hisobotlarda so'rovlar soni testi.

| # | Qayerda | Muammo | Xavf | Og'irlik | Mehnat |
|---|---------|--------|------|----------|--------|
| S1 | tests/test_tenant_isolation.py | "Har biznes jadvalida RLS yoqilgan" meta-testi yo'q (`pg_class.relrowsecurity`) — yangi jadvalda `enable_tenant_rls` unutilsa hech kim sezmaydi | Tenant oqishi | 🟠 | S |
| S5 | tests | `/sales/export`, `/stock/export`, `differences` (`diff_amount`), jurnal ma'lumotlarida tannarx yo'qligi tekshirilmagan | Yangi ustun tannarxni oqizishi mumkin | 🟠 | S |
| S8 | deploy/backup/ | backup/restore uchun test yo'q, haqiqiy tiklash sinalmagan | Zaxira ishlamasligi | 🟠 | M |
| S0 | — (T1, T2, T3 uchun) | Hisobdan chiqarilgan qarzni qaytarish, qaytarishni qayta yuborish, kam qoldiqda parallel bir xil savat — testlar yo'q (shuning uchun topilmadi) | | 🟠 | S |
| S2 | move_stock | Kesishgan partiyali ikki ko'p qatorli sotuv testi yo'q (T6 deadlock) | 500 | 🟡 | M |
| S4 | sales/service.py:692 | Qaytarish oxirgi qismi "qolgan summa" uchun alohida test yo'q | Kichik | 🟡 | S |
| S6 | worker.py | `WorkerSettings.cron_jobs` ro'yxati va `deliver_telegram` Retry yo'li testsiz | Job tushib qolsa sezilmaydi | 🟡 | S |
| S7 | counters | Sotuv raqami parallel+rollback holatida testsiz | Kichik | 🟡 | S |
| S9 | frontend | 27 sahifa testsiz: 6 hisobot, BatchPage (yopish/qayta ochish), ReceiptPage, Journal, Settings … | Regressiya | 🟡 | M |
| S10 | conftest.py:24-75; pyproject; package.json | Coverage vositasi yo'q (`pytest-cov`, `vitest --coverage`); test bazasi nomi qat'iy (parallel ishga tushirish to'qnashadi); CI yo'q | Qamrov o'lchanmaydi, testlar faqat qo'lda | 🟡 | S |

## Hujjat va DX
- **0 dan ishga tushirish:** README bo'yicha mumkin (compose → venv → `alembic upgrade head` rollarni yaratadi → seed → dev). `dev.sh` qulay.
- `.env.example` da 3 ixtiyoriy kalit yo'q: `PLATFORM_ALERT_CHAT_ID`, `TELEGRAM_API_URL`, `PASSWORD_HASH_ROUNDS` (🟡 S). `.env.prod.example` to'liq.
- Hujjat-kod farqlari: PROGRESS "git yo'q", eski test sonlari, K7; `docs/05` "32 jadval" (33); README 10-telegram ✅; T8, T16; CLAUDE.md "ARQ yoki Celery" (arq tanlangan). Barchasi 🟡 S.
- Migratsiya/seed/deploy/zaxira buyruqlari yozilgan (`docs/07`), avariya holatlari bo'limi bor.

## Ishlab chiqarish holati
| # | Qayerda | Muammo | Xavf | Og'irlik | Mehnat |
|---|---------|--------|------|----------|--------|
| I1 | `.github/` yo'q, `.git/hooks` da faqat graphify | CI yo'q — 584 test faqat qo'lda; deploy `./deploy.sh` qo'lda | Buzilgan commit serverga chiqadi | 🟠 | S |
| I2 | backend/app (logging sozlamasi yo'q), main.py | Logging — uvicorn standart; xato kuzatuv (Sentry/GlitchTip) yo'q; so'rov identifikatori (`X-Request-ID`) yo'q — 500 xatoni foydalanuvchi shikoyatiga bog'lab bo'lmaydi | Prod'da xato ko'rinmaydi | 🟠 | M |
| I3 | — | Monitoring/uptime yo'q: faqat `/api/health` va zaxira Telegram ogohlantirishi; Postgres/Redis/disk ko'rsatkichlari yo'q | To'xtab qolgani sezilmaydi | 🟡 | S (tashqi uptime ping) |
| I4 | docs/07, PROGRESS | Haqiqiy VPS yo'q; tiklash haqiqiy serverda sinalmagan; `PLATFORM_ALERT_CHAT_ID` qo'lda | Zaxira ishonchsiz | 🟠 | M |
| I5 | docker-compose.prod.yml | Zaxira: `json-file` 10 MB × 5; log aylanishi bor — yaxshi. Postgres uchun `shared_buffers` va h.k. sozlanmagan (standart) | Kichik | 🟡 | S |
| I6 | frontend | React `ErrorBoundary` faqat Hero3D'da — sahifa xatosi oq ekran | Foydalanuvchi oq ekran ko'radi | 🟡 | S |

Yaxshi: Caddy HTTPS avtomatik + CSP/HSTS; `restart: unless-stopped`; healthcheck'lar; `deploy.sh` migratsiya xatosida to'xtaydi; kunlik shifrlangan zaxira + tashqi ombor; `reconcile_stock` kechki solishtiruv; `.env.prod` tekshiruvlari (`CREDENTIALS_KEY`, tizim roli).

## AI xulosasi

✅ Qilsa bo'ladi (kichik, aniq, xavfsiz)
- **T1** — `offset_return` da `remaining` o'rniga `amount − paid − returned` (hisobdan chiqarilgan qismni ham qarzdan "qaytarish" deb hisoblash) yoki hisobdan chiqarilgan qarzli sotuvni qaytarishni faqat egaga ruxsat berish; test bilan. S.
- **T3** — qulflardan keyin `by_uuid` ni qayta tekshirish (ko'chirishdagi kabi). S.
- **X12, X13** — `APP_ENV` ni majburiy qilish yoki sukutni `prod` ga o'zgartirish; `SECRET_KEY` ≥ 32 belgi va placeholder emasligini tekshirish. S.
- **X4** — eksportda matn hujayralarini `'` bilan boshlash yoki `=+-@` bilan boshlanganini ekranlash (bitta joy `export.py`). S.
- **P1, P3** — ikki indeks (`upper(number)` funksional; `(business_id, dedup_key)`): migratsiya, xavfsiz. S.
- **P6** — eksport limitini olib tashlash yoki jamini qatorlardan hisoblash. S.
- **S1, S5, S0** — testlar: RLS meta-test, eksportda tannarx yo'qligi, T1/T2/T3 regressiya testlari. S.
- **I1** — GitHub Actions (pytest + vitest + ruff + eslint + alembic check + npm audit). S.
- Hujjat tozalash (K7, PROGRESS, docs/05, README, T8, T16, `.env.example`), zip'ni git'dan olish. S.

⚠️ Qiyin yoki xavfli
- **T2** (qaytarishda `client_uuid`) — sxema o'zgarishi (`sale_returns.client_uuid` + unique) va frontend savat/noaniq-natija mantig'ini qaytarish oynasiga kengaytirish; sotuvdagi tayyor naqsh bor, lekin ikki tomonlama ish. M. Xavfsiz yo'l: avval backend (ixtiyoriy uuid), keyin frontend, testlar bilan.
- **T4 + X3** (hisobdan chiqarish) — biznes qarori kerak: sotuvchiga faqat o'z do'koni qarzi? yoki umuman egaga? Kodda S, lekin hujjat (07-nasiya.md:84,98) o'zgaradi.
- **P2** (sotuvda N+1) — `create_sale` 155 qatorli funksiya; qayta yozishda qulf tartibi buzilsa deadlock. Avval S2 testini yozib, keyin o'zgartirish. M.
- **X22** react-router 6→7 — API o'zgarishlari, 40 yo'nalish; CVE hozirgi kodda ekspluatatsiya qilinmaydi (ichki `to` qiymatlari). Alohida branch, pilotdan keyin yoki CI bo'lgach.
- **I2** logging/xato kuzatuv — Sentry kabi tashqi servis sirlarni oqizmasligi uchun `before_send` filtri kerak; o'z-o'zidan joylashtiriladigan GlitchTip variantini ko'rish.

❌ Tavsiya etilmaydi / hozir emas
- Hisobotlar uchun yig'ma jadval (`daily_summary`) — o'lchov 15–23 ms, sabab yo'q; hajm o'sganda qaytamiz.
- `pg_trgm` (P7), worker N+1 (P11), uzun funksiyalarni bo'lish (K5), 27 sahifa frontend testi (S9) — pilot oldidan emas; ro'yxatda qoladi.
- Vite/Vitest/Tailwind/React katta versiyalari — sabab yo'q.

💡 Takliflar
- Pilotgacha **yuk testi**: seed bilan 1000 partiya × 300 SKU yaratib `/sales/context`, skaner (`/batches/by-number`), `/stock` ni qayta o'lchash — P1/P2/P4 ning haqiqiy og'irligini ko'rsatadi.
- **Nasiya ↔ qaytarish ↔ hisobdan chiqarish** uchlik — bitta "pul oqimi invariantlari" testi (har sotuv uchun: naqd kirgan − naqd chiqqan + qarz qoldig'i + hisobdan chiqarilgan = jami) kiritilsa, T1 turidagi xatolar keyin ham ushlanadi.
- Zaxiradan tiklash mashqini (S8/I4) haqiqiy serverga chiqishdan oldin bir marta `restore` profili bilan bo'sh bazaga qilish.

❓ Hal qilinishi kerak savollar (3-bosqichdan oldin)
1. Sotuvchi qarzni hisobdan chiqarishi kerakmi umuman (hujjatda "ha, egaga xabar")? Variantlar: (a) faqat ega — eng xavfsiz, tavsiya; (b) sotuvchi faqat o'z do'koni va kunlik limit; (c) hozirgicha.
2. Hisobdan chiqarilgan qarzli sotuvni qaytarish — qanday bo'lishi kerak: (a) qaytarish faqat mijoz haqiqatda to'lagan summagacha pul beradi (tavsiya); (b) hisobdan chiqarilgan sotuvni qaytarish taqiqlanadi; (c) faqat ega qaytaradi.
3. Ustuvorlik: ishlab chiqarishga tayyorlash (CI, logging, 🔴/🟠 yopish) birinchi — rozimisiz? Tezlik ishlari (P2, P7, P11) yuk testidan keyin.
4. 1-bosqich savollari hali ochiq: commit qilinmagan ishni commit qilamizmi; pilot hajmi; Telegram tokeni.
