# 06 — Sotuv

## Modul nima qiladi
Do'kon qurilmasidagi sotuv ekrani (skaner yoki qo'lda tanlash, metr ↔ kg, tavsiya narx), to'lov — naqd / karta / nasiya, sotuvlar ro'yxati, sotuv kartochkasi, qaytarish va bekor qilish. Har sotuv qoldiqni kamaytiradi, jurnalga yoziladi; qaytarish va qoldiqdan ko'p sotuv haqida egalarga xabar boradi.

## Sahifalar
| Sahifa | Yo'l | Kim | Fayl |
|--------|------|-----|------|
| Sotuv ekrani | `/` (sotuvchi — bosh sahifa), `/sales/new` (biznes egasi, do'konni tanlaydi) | sotuvchi, ega | `frontend/src/modules/sales/SalePage.tsx`, `EntryForm.tsx` |
| Bugungi sotuvlarim / Sotuvlar ro'yxati | `/sales` | sotuvchi (bugun o'ziniki yoki do'konning barcha sotuvlari), ega (filtrlar bilan) | `SalesPage.tsx` |
| Sotuv kartochkasi + qaytarish + bekor qilish | `/sales/:id` | sotuvchi (o'z do'koni), ega | `SaleCardPage.tsx` |
| Mijoz tanlovi (nasiya uchun: qidiruv, tezkor qo'shish) | sotuv ekrani ichida | sotuvchi, ega | `frontend/src/modules/credit/CustomerPicker.tsx` |

Savat qurilmada saqlanadi: `frontend/src/modules/sales/cart.ts`.

## Kim ishlatadi
Sotuvchi (do'kon qurilmasida, PIN bilan), biznes egasi. Omborchiga yopiq.

## Bog'liqliklar
- **Bog'liq:** 03-catalog (SKU, tavsiya narx), 05-inventory (`move_stock`), 07-credit (mijoz, qarz), 09-notifications
- **Bunga bog'liq:** 07-credit (mijoz kartochkasi, to'lovlar), 08-reports

## Batafsil
`docs/03-details/06-sotuv.md`, eskiz — `docs/04-eskizlar.md` (1-eskiz)

## Kod
- `backend/app/modules/sales/` — `models` (Sale, SaleLine, SaleReturn, ReturnLine), `service`, `router`, `schemas`
- `backend/app/modules/credit/` — 06 uchun kerakli qismi: `models` (Customer, Debt), mijoz qidirish / qo'shish, qarzni ochish, qaytarishda kamaytirish, bekor qilish. To'lovlar va hisobdan chiqarish — 07-credit da
- `backend/alembic/versions/0007_sales.py` — `customers`, `debts`, `sales`, `sale_lines`, `sale_returns`, `return_lines`
- `backend/tests/test_sales.py` — 27 ta test; umumiy yordamchi — `tests/shop.py` (`in_store`, `sell_to`, `sale`, `customer`)
- `frontend/src/modules/sales/` — sahifalar, `SalePage.test.tsx` (12 ta test), `SaleCardPage.test.tsx` (6 ta test)
- Ulangan joylar: `notifications/messages.ts` (2 hodisa), `core/JournalPage.tsx` (sotuv tafsilotlari), `app/router.tsx`, `app/nav.ts`, `app/StoreShell.tsx`

## API
Biznes egalari va sotuvchilar uchun. Sotuvchi faqat o'z do'koni (qurilma bog'langan do'kon) bilan ishlaydi; tannarx va foyda faqat egaga qaytadi.

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/sales/context?store_id=` | Sotuv ekrani uchun: do'kon, `sell_by_kg`, `credit_enabled`, sotiladigan SKU'lar va ochiq partiyalari (eskisi birinchi), qoldiq, koeffitsient, 1 metrga tavsiya narx |
| `POST /api/sales` | Sotuvni yozadi: `client_uuid`, qatorlar (partiya, metr, kg, 1 metr narxi, izoh), to'lov turi, mijoz, boshlang'ich to'lov → `{id, number, total, duplicate}`. Takror savat — 200 va avvalgi sotuv |
| `GET /api/sales` | Ro'yxat: `date_from`, `date_to`, `store_id`, `seller_id`, `mine`, `payment_type`, `status`, `customer_id`, `search`, `limit`, `offset` → `{items, total, amount}` |
| `GET /api/sales/{id}` | Kartochka: qatorlar, to'lov, qarz, qaytarishlar, `can_cancel`, `can_return`; egaga — tannarx va foyda |
| `POST /api/sales/{id}/cancel` | Bekor qilish (sabab majburiy) |
| `POST /api/sales/{id}/returns` | Qaytarish: qatorlar (metr) va pul qaytarish usuli → `{amount, debt_amount, refund}` |
| `GET /api/customers/search?q=` | Mijoz tanlovi: ism yoki telefon bo'yicha, hozirgi qarzi bilan |
| `POST /api/customers` | Mijoz qo'shish; telefon band bo'lsa — 409 va mavjud mijoz |

## Qoidalar (kodda qanday bajarilgan)
- **Sotuv kimga yoziladi:** sotuvchida — qurilma bog'langan do'kon va PIN bilan kirgan sotuvchi (qurilma ham saqlanadi); ega do'konni o'zi tanlaydi. Qurilmasiz sotuvchi sota olmaydi.
- **Narx doim 1 metr uchun.** SKU narxi kg da bo'lsa, tavsiya narx partiya koeffitsienti bo'yicha metrga o'giriladi va sozlamadagi aniqlikda yaxlitlanadi. Chegara yo'q. Tavsiya narx o'zi qo'yilmaydi — sotuvchi tugmani bosadi yoki o'z narxini yozadi.
- **Sotuv qatorida nusxalar:** tovar nomi, tavsiya narx va tannarx sotuv paytidagi qiymat bilan saqlanadi — keyin katalog yoki kirim o'zgarsa ham eski sotuv va foyda o'zgarmaydi.
- **Qator summasi** = metr × narx, butun so'mgacha (yarim so'm — yuqoriga). Jami — qatorlar yig'indisi.
- **Metr ↔ kg:** biri kiritilsa, ikkinchisi partiya koeffitsienti bo'yicha hisoblanadi. Koeffitsient yo'q partiyada kg maydoni yopiq. "Kg da sotish" sozlamasi o'chiq bo'lsa, kg maydoni ko'rinmaydi.
- **Qo'lda tanlashda** eng eski partiya olinadi; bir nechta bo'lsa, sotuvchi boshqasini tanlay oladi. Skaner partiyani aniq topadi; topilmasa — "Partiya topilmadi" yoki "Bu partiya shu do'konda yo'q".
- **Yopilgan partiyadan** va boshqa joydagi partiyadan sotib bo'lmaydi.
- **Qoldiqdan ko'p sotish** — faqat izoh bilan (qatorda majburiy maydon ochiladi); egalarga xabar boradi. Bir partiyadan bir nechta qator bo'lsa, qoldiq ketma-ket hisoblanadi. Izoh qoldiq harakatiga ham yoziladi.
- **Bir savat — bir sotuv:** har savatning `client_uuid` si bor. Internet uzilsa, savat qurilmada saqlanadi va o'zgartirilmaydi; ulanish tiklangach o'sha identifikator bilan qayta yuboriladi — server ikkinchi marta yozmaydi (bir vaqtda kelgan takrorlarda ham). Sotuv raqamida bo'shliq qolmaydi.
- **Savat** xodim va do'kon bo'yicha alohida saqlanadi: qurilma qulflansa, uni faqat shu sotuvchi davom ettiradi.
- **Nasiya:** mijoz majburiy; boshlang'ich to'lov (naqd yoki karta) ixtiyoriy; qolgani — qarz, muddati sozlamadagi kun bo'yicha. Boshlang'ich to'lov jamiga teng bo'lsa — bu oddiy sotuv. Nasiya sozlamada o'chiq bo'lsa, to'lov turlarida ko'rinmaydi.
- **Bekor qilish:** sotuvchi — faqat o'z sotuvini, 10 daqiqa ichida; keyin — ega. Sabab majburiy. Metr do'konga qaytadi (yopilgan partiya qayta ochiladi), qarz bekor bo'ladi. Qaytarishi bor sotuv bekor qilinmaydi.
- **Qaytarish:** faqat asl sotuv bo'yicha, sotilganidan ko'p emas, muddatsiz. Summa = metr × sotilgan narx; qatorning oxirgi qismi qaytganda — qolgan summaning hammasi (yaxlitlash farqi qolmaydi). Nasiya sotuvda avval qarzdan ayriladi, qolgani pul bilan (naqd / karta). Metr shu do'kondagi o'sha partiyaga qaytadi. Egalarga xabar va jurnal.
- **Sotuv holati** bazada ikki xil (yakunlangan / bekor qilingan); "qisman qaytarilgan" va "qaytarilgan" qaytarilgan summadan hisoblanadi.
- **Jurnal ("Sotuv"):** `sale.created`, `sale.cancelled`, `sale.returned`; mijoz qo'shish — "Nasiya" kategoriyasida.
- **Sotuvchi nimani ko'radi:** o'z do'konining barcha sotuvlari (qaytarish uchun asl sotuvni topishi kerak); tannarx va foyda ko'rinmaydi.

## Keyingi modullarga qoldirilgan
- **07-credit** (qurildi): "Mijozlar" bo'limi, mijoz kartochkasi, qarz to'lovi, hisobdan chiqarish, muddati o'tgan qarz xabari. Qarziga to'lov tushgan sotuv bekor qilinmaydi (`debt_has_payments`).
- **08-reports:** savdo, foyda, narx og'ishi (tavsiya ↔ haqiqiy narx qatorlarda saqlangan), to'lov turlari bo'yicha tushum.
- Chek chop etish, aralash to'lov, kassa yopish — 1-versiyada yo'q (biznes qarori).

## Tekshirish
```bash
cd backend && pytest tests/test_sales.py
cd frontend && npm test
```
Qo'lda: ega bo'lib kiring → **Tuzilma → Qurilmalar** → do'konni bog'lang → PIN `1234` → sotuv ekrani ochiladi. Partiya raqamini (masalan `P-000001`) yozib Enter bosing — skaner shunday ishlaydi.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:**
  - Mijoz va qarz jadvallari (07-credit sxemasidan) shu modulda yaratildi — nasiya sotuvsiz to'lov turi to'liq bo'lmas edi. 07 da faqat to'lov va hisobdan chiqarish jadvallari qo'shiladi.
  - Sxemadagi `sale_returns.method = debt` o'rniga `debt_amount` ustuni: bitta qaytarishning bir qismi qarzdan ayrilib, qolgani pul bilan qaytishi mumkin (mijoz boshlang'ich to'lov qilgan bo'lsa).
  - Sotuv ekranida kiritish ikki qadamli: avval tovar (skaner yoki tanlash), keyin metr / kg / narx — telefonda ham bitta ustunga sig'adi. Eskizdagi maydonlar va tartib saqlangan.
  - "Jami" paneli keng ekranda pastga yopishib turadi; telefonda va nasiyada — oddiy oqimda (kiritish maydonlarini to'sib qo'ymasligi uchun).
- **Texnik qarz:**
  - Internet uzilganda faqat "javob kelmagan" holat qayta yuboriladi; butunlay oflayn sotish yo'q (hujjatdagidek — internet kerak).
  - Sotuv ekrani do'kondagi barcha tovarni bir so'rovda oladi — bitta do'konda minglab ochiq partiya bo'lsa sekinlashadi (qidiruvni serverga ko'chirish kerak bo'ladi).
  - Soxta qaytarish xavfi (hujjatdagi ⚠️): himoya — asl sotuvga bog'lanish, miqdor chegarasi, egaga xabar va jurnal. Kunlik qaytarish limiti yoki ega tasdig'i yo'q — pilotda kuzatiladi.
  - Kamera orqali skanerlash yo'q: USB / Bluetooth skaner (klaviatura kabi yozadi) yoki raqamni qo'lda yozish.
  - Sotuvlar ro'yxati sahifalangan (50 tadan), lekin Excel eksport yo'q — 08-reports da.
- **Keyingi modulda e'tibor:** 07-credit `debts` ga to'lov yozganda `paid` ni faqat qatorni qulflab (`sale_debt(..., lock=True)` kabi) o'zgartirsin — qaytarish ham shu qatorni o'zgartiradi. Mijoz qarzi `amount − paid − written_off − returned` (faqat `active`) — bitta joyda (`credit/service.py`) hisoblanadi.
