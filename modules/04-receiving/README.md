# 04 — Kirim

## Modul nima qiladi
Skladga tovar qabul qilish: kirim hujjati va uning qatorlari — partiyalar (rulon, metr, kg, koeffitsient, 1 metr tannarxi). Har partiya raqam oladi, metri skladga qoldiq bo'lib tushadi, etiketka (shtrix-kod) chop etiladi. Tuzatish va bekor qilish.

## Sahifalar
| Sahifa | Yo'l | Fayl |
|--------|------|------|
| Kirimlar ro'yxati (davr, sklad, kim kiritdi bo'yicha filtr) | `/receiving` | `frontend/src/modules/receiving/ReceiptsPage.tsx` |
| Kirim yaratish (bir nechta partiya, jami ko'rinish) | `/receiving/new` | `modules/receiving/ReceiptCreatePage.tsx` |
| Kirim kartochkasi (partiyalar, tuzatish, bekor qilish, etiketka) | `/receiving/:id` | `modules/receiving/ReceiptPage.tsx` |

Umumiy qismlar: `LineEditor.tsx` (bitta partiya qatori — yaratishda ham, tuzatishda ham), `Labels.tsx` (etiketka va chop etish), `types.ts` (tekshiruv, koeffitsient, summa), `shared/barcode.ts` + `shared/ui/Barcode.tsx` (Code 128 shtrix-kod).

Menyuda: omborchi uchun — **Kirimlar**; biznes egasi uchun — **Ombor** (05-inventory qurilgach shu bo'lim qoldiq va ko'chirishlar bilan to'ladi).

## Kim ishlatadi
Omborchi (faqat o'ziga biriktirilgan skladlar), biznes egasi

## Bog'liqliklar
- **Bog'liq:** 02-structure (skladlar, xodimga biriktirish), 03-catalog (SKU, tavsiya narx)
- **Bunga bog'liq:** 05-inventory, 08-reports

## Batafsil
`docs/03-details/04-kirim.md`

## Kod
- `backend/app/modules/receiving/` — `models` (Receipt, Batch), `schemas`, `service`, `router`
- `backend/app/modules/inventory/` — `models` (BatchStock, StockMovement), `stock.move_stock` — **qoldiqni o'zgartiradigan yagona funksiya** (05, 06 ham shuni chaqiradi)
- `backend/app/core/counters.py` — hujjat raqamlari (KR-00001, P-000001)
- `backend/app/modules/structure/access.py` — xodimga ruxsat etilgan joylar
- `backend/alembic/versions/0004_receiving.py` — 4 jadval + RLS + harakatlar jurnali himoyasi
- `backend/tests/test_receiving.py` — 26 ta test
- `frontend/src/modules/receiving/` — sahifalar, `ReceiptCreatePage.test.tsx` (6 ta test); `shared/barcode.test.ts` (4 ta)

## API
Biznes egalari va omborchi uchun.

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/receipts` | Ro'yxat: partiyalar soni, jami metr, jami summa; `date_from`, `date_to`, `warehouse_id`, `created_by`, `limit`, `offset` |
| `GET /api/receipts/options` | Xodim ishlay oladigan skladlar va kirim kiritganlar (forma va filtr uchun) |
| `POST /api/receipts` | Kirim: sklad, sana, izoh, qatorlar. SKU bo'lmasa yaratiladi; qatorda tavsiya narx berilsa — yangilanadi |
| `GET /api/receipts/{id}` | Kartochka: qatorlar, skladdagi qoldiq, "tuzatsa bo'ladimi" belgilari |
| `PATCH /api/receipts/{id}` | Sana va izoh |
| `POST /api/receipts/{id}/cancel` | Bekor qilish (faqat biznes egasi, harakatsiz kirim) |
| `PATCH /api/batches/{id}` | Partiyani tuzatish: rulon, metr, kg, koeffitsient, tannarx; harakatsiz bo'lsa — tovar ham |

Xato kodlari: `receipt_not_found`, `batch_not_found`, `receipt_cancelled`, `receipt_locked`, `batch_has_movement`, `sku_inactive`, `location_forbidden`.

## Qoidalar (kodda qanday bajarilgan)
- **Kirim faqat skladga**; omborchi faqat o'ziga biriktirilgan skladga kirim qiladi va faqat o'sha skladlar kirimlarini ko'radi.
- **Raqamlar** har biznesda o'zining uzluksiz ketma-ketligi: kirim `KR-00001`, partiya `P-000001`. Bir vaqtda kelgan so'rovlarda ham takrorlanmaydi; saqlanmagan kirim raqam sarflamaydi.
- **Qoldiq:** har partiya metri skladga `move_stock` orqali tushadi — harakat `stock_movements` ga yoziladi, `batch_stock` shu tranzaksiyada yangilanadi. `stock_movements` ni hech kim (jadval egasi ham) o'zgartira olmaydi.
- **Koeffitsient (1 kg = X m):** metr va kg ikkalasi kiritilsa — metr ÷ kg; aks holda qatorda yozilgani; u ham bo'lmasa — matoning standarti.
- **SKU** kirimda o'zi yaratiladi; faolsiz mato, rang, gul yoki SKU tanlanmaydi.
- **Tavsiya narx** kirim qatorida ko'rinadi va o'zgartirilishi mumkin — SKU narx tarixi va jurnalga yoziladi.
- **Tuzatish:** harakatsiz partiyani kiritgan omborchi yoki biznes egasi tuzatadi; partiyadan sotilgan yoki ko'chirilgan bo'lsa — faqat biznes egasi, va tovarni almashtirib bo'lmaydi. Metr o'zgarsa, skladdagi qoldiq ham shuncha o'zgaradi ("tuzatish" harakati).
- **Bekor qilish:** kirim o'chirilmaydi; harakatsiz kirimni biznes egasi bekor qiladi — metr skladdan chiqariladi, kirim ro'yxatda "bekor qilingan" bo'lib qoladi.
- **Ogohlantirishlar (taqiqlanmaydi):** koeffitsient standartdan 20% dan ko'p farq qilsa; tannarx tavsiya narxdan yuqori bo'lsa; bir xil tovar ikki qatorda bo'lsa (birlashtirish taklif qilinadi).
- **Etiketka:** SKU kodi va nomi, shtrix-kod (Code 128, partiya raqami), sana. Nusxalar soni har partiyaga alohida (boshida — rulonlar soni); o'lcham: 58×40, 58×30, 100×50 mm. Istalgan payt qayta chop etiladi.
- Hammasi jurnalga ("Ombor"): kirim yaratildi, tuzatildi (eski → yangi), bekor qilindi.

## Keyingi modullarga qoldirilgan
- **Qoldiq sahifasi, partiya kartochkasi, ko'chirish, partiyani yopish** — 05-inventory (jadvallarning yarmi va `move_stock` shu modulda tayyorlandi).
- **Etiketka o'lchami** pilot mijozning printeriga moslanadi (biznesdan-savollar, 5-savol) — hozir uchta tayyor o'lcham.
- Mavjud kirimga yangi qator qo'shish yo'q — yangi kirim ochiladi.

## Tekshirish
```bash
cd backend && pytest tests/test_receiving.py
cd frontend && npm test
```
Qo'lda: `+998 90 111 22 33` / `demo1234` → **Ombor** → **Kirim yaratish**.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:** qoldiq jadvallari (`batch_stock`, `stock_movements`) va `move_stock` 05-modulni kutmasdan shu yerda yaratildi — kirim skladga qoldiq tushirishi kerak. Sxemaga qo'shildi: `receipts.number`, `cancelled_by`, `cancelled_at`.
- **Texnik qarz:** tannarx tuzatilganda eski sotuvlar foydasi qayta hisoblanmaydi (06-sales sotuv paytidagi tannarxni qatorda saqlaydi — shunda tarix buzilmaydi); etiketka faqat brauzer chop etish oynasi orqali (to'g'ridan-to'g'ri printerga emas).
- **Keyingi modulda e'tibor:** 05-inventory `move_stock` dan boshqa yo'l bilan qoldiqqa tegmasin; bekor qilingan kirim partiyalari qoldiq ro'yxatida ko'rinmasligi kerak; "harakat bo'lganmi" tekshiruvi (`receiving.service._moved`) ko'chirish va sotuv turlarini o'zi hisobga oladi.
