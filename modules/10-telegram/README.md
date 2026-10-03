# 10 — Telegram

## Modul nima qiladi
Bitta umumiy platforma boti orqali biznes egalariga Telegram xabarlari: ikki muhim hodisa darhol (ko'chirish farqi, katta metr farqi) va har kuni kunlik xulosa (savdo, tushum, foyda, kam qoldiq, muddati o'tgan nasiya). Har ega Telegram'ni o'z profilida ulaydi va sozlaydi. Tizim ichidagi xabarlar (09) o'zgarmaydi — Telegram ularga qo'shimcha.

## Sahifalar
| Sahifa | Yo'l | Kim | Fayl |
|--------|------|-----|------|
| Profildagi "Telegram" bo'limi: ulash, uzish, kunlik xulosa va darhol xabarlarni yoqish / o'chirish | `/profile` | biznes egalari | `frontend/src/modules/telegram/TelegramCard.tsx` |
| Sozlamalardagi "Kunlik xulosa vaqti" (soat) | `/settings` | biznes egalari | `frontend/src/modules/core/SettingsPage.tsx` |

## Kim ishlatadi
Biznes egalari (asosiy ega va sherik-egalar — har biri o'z Telegram'ini ulaydi).

## Bog'liqliklar
- **Bog'liq:** 08-reports (kunlik xulosa raqamlari — dashboard bilan bir joydan), 09-notifications (hodisalar)
- **Bunga bog'liq:** —

## Batafsil
`docs/03-details/09-bildirishnomalar.md`

## Kod
- `backend/app/modules/telegram/` — `bot` (Bot API mijozi), `service` (ulash, darhol xabar, kunlik xulosa), `texts` (xabar matnlari uch tilda), `models` (TelegramLink), `router`, `schemas`
- `backend/app/core/queue.py` — fon navbatiga vazifa qo'yish (arq)
- `backend/app/worker.py` — `deliver_telegram` (navbatdagi darhol xabar), `poll_telegram` (botga kelgan yangiliklar, har 3 soniyada), `daily_summaries` (har 10 daqiqada)
- `backend/app/modules/notifications/service.py` — darhol hodisa saqlangach navbatga qo'yiladi
- `backend/alembic/versions/0009_telegram.py` — `telegram_links`
- `backend/tests/test_telegram.py` — 12 ta test (Telegram serveri o'rniga soxta mijoz)
- `frontend/src/modules/telegram/` — `TelegramCard.tsx`, `TelegramCard.test.tsx` (4 ta test)

## Sozlash (bir marta)
1. Telegram'da **@BotFather** → `/newbot` → bot nomi va foydalanuvchi nomi → token beriladi.
2. Loyiha ildizidagi `.env` ga: `TELEGRAM_BOT_TOKEN=<token>`.
3. Backend va fon ishchisini qayta ishga tushiring: `uvicorn ...` va `cd backend && arq app.worker.WorkerSettings`.
   **Ishchisiz Telegram ishlamaydi** — ulash ham, xabarlar ham, kunlik xulosa ham ishchi orqali o'tadi.

Token bo'sh bo'lsa, Telegram qismi o'chiq: profilda "bot sozlanmagan" ko'rinadi, xabarlar faqat tizim ichida keladi.

## API
Faqat biznes egalariga.

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/telegram` | Holat: `{configured, linked, username, daily_summary, instant_alerts}` |
| `POST /api/telegram/link` | Bir martalik havola (`https://t.me/<bot>?start=<token>`, 15 daqiqa). Bot sozlanmagan bo'lsa — 503 |
| `PATCH /api/telegram` | Kunlik xulosa va darhol xabarlarni yoqish / o'chirish |
| `DELETE /api/telegram` | Uzish |
| `PUT /api/settings` → `daily_summary_time` | Kunlik xulosa vaqti (to'liq soat, biznes vaqti bo'yicha) |

## Qoidalar (kodda qanday bajarilgan)
- **Ulash:** profil → "Telegram'ni ulash" → havola → botda "Start". Havola bir marta ishlaydi va 15 daqiqa yashaydi; boshqa odam shu havola bilan ulana olmaydi. Sahifa ulanishni o'zi kutib turadi.
- **Darhol xabarlar** — faqat ikki hodisa: ko'chirish farq bilan qabul qilindi, partiya 10%+ farq bilan yopildi. Qolgan hodisalar (qaytarish, hisobdan chiqarish, kam qoldiq ...) faqat tizim ichida — xabar ko'payib, e'tibor yo'qolmasligi uchun.
- **Fonda yuboriladi:** hodisa saqlangach vazifa navbatga qo'yiladi; foydalanuvchi so'rovi Telegram javobini kutmaydi. Telegram vaqtincha ishlamasa — ishchi 5 martagacha, oraliqni uzaytirib qayta urinadi.
- **Kunlik xulosa** — biznes sozlamasidagi soatda (standart 21:00), har egaga kuniga bir marta, egasining tilida. Savdo bo'lmagan kun ham keladi ("Bugun savdo bo'lmadi"). Raqamlar dashboard bilan bir joydan hisoblanadi (`reports.service.totals`). Yuborib bo'lmasa, shu soat ichida har 10 daqiqada qayta uriniladi.
- **Ega botni bloklasa** — bog'lanish uziladi va tizim ichida "Telegram uzildi" xabari qoladi (bosilsa — profil).
- **Uzilganda qator o'chirilmaydi** (`chat_id` bo'shatiladi) — sozlamalar saqlanadi, qayta ulansa o'sha holatda davom etadi.
- Faolsiz xodimga va Telegram'i uzilgan egaga xabar yuborilmaydi. Foydalanuvchi kiritgan matn (nom, izoh) xabarda ekranlanadi.

## Qoldirilgan
- **"Zaxira nusxa olinmadi" xabari (platforma egasiga)** — zaxira nusxaning o'zi hosting tanlanganda quriladi; xabar ham o'shanda.
- **Webhook:** hozir bot yangiliklarni so'rab oladi (har 3 soniyada) — lokalda va ochiq manzilsiz ishlaydi. Serverda HTTPS manzil bo'lganda webhook'ka o'tkazsa bo'ladi (tezroq, kamroq so'rov).

## Tekshirish
```bash
cd backend && pytest tests/test_telegram.py
cd frontend && npm test
```
Jonli sinov (token kerak): `.env` ga token → backend va ishchini ishga tushiring → profil → "Telegram'ni ulash" → botda "Start" → ko'chirishni farq bilan qabul qiling — xabar Telegram'ga keladi. Kunlik xulosani darhol ko'rish: **Sozlamalar → Kunlik xulosa vaqti** ni hozirgi soatga qo'ying (10 daqiqa ichida keladi).

## Holat
✅ Kod va testlar tayyor (2026-10-02). ⚠️ **Haqiqiy bot bilan sinalmagan** — bot tokeni berilgach jonli tekshiriladi.

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:**
  - Bot yangiliklarni webhook orqali emas, so'rab oladi (long polling) — ochiq HTTPS manzilsiz ham ishlashi uchun.
  - Kunlik xulosa vaqti daqiqagacha emas, to'liq soat bilan tanlanadi.
  - "Zaxira nusxa olinmadi" xabari qurilmadi (zaxira nusxaning o'zi yo'q).
- **Texnik qarz:**
  - **Haqiqiy Telegram bilan sinalmagan** (token yo'q edi): testlar soxta mijoz bilan. Birinchi jonli sinovda matn ko'rinishi va havola tekshirilishi kerak.
  - Fon ishchisi lokalda qo'lda ishga tushiriladi; serverda alohida xizmat bo'lishi shart — usiz Telegram umuman ishlamaydi.
  - Bot faqat "/start" ni tushunadi; boshqa buyruqlar (masalan "/bugun" — hozirgi xulosa) yo'q.
  - "Kunlik xulosa yuborildi" belgisi Redis'da (2 kun) — Redis tozalansa, shu kuni xulosa qayta ketishi mumkin.
- **Keyingi qadam:** token berilgach — jonli sinov; hosting tanlanganda — ishchini xizmat qilib ishga tushirish va (ixtiyoriy) webhook.
