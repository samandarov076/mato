# 03 — Katalog

## Modul nima qiladi
Matolar, ranglar, gullar va SKU (mato + rang + gul); tavsiya narx — yakka va ommaviy; narx tarixi; kg ↔ metr koeffitsienti; kam qoldiq chegarasi; rasm yuklash.

## Sahifalar
Menyuda bitta bo'lim — **Katalog**, ichida to'rtta varaq.

| Sahifa | Yo'l | Fayl |
|--------|------|------|
| Matolar (ro'yxat, qidiruv, qo'shish, tahrirlash, faolsizlantirish) | `/catalog` | `frontend/src/modules/catalog/FabricsPage.tsx` |
| Ranglar (rang namunasi bilan) | `/catalog/colors` | `modules/catalog/AttributesPage.tsx` |
| Gullar (xuddi shu sahifa, `kind="patterns"`) | `/catalog/patterns` | `modules/catalog/AttributesPage.tsx` |
| SKU ro'yxati (filtrlar, ommaviy narx, qo'lda SKU qo'shish) | `/catalog/skus` | `modules/catalog/SkusPage.tsx` |
| SKU kartochkasi (narx, kam qoldiq chegarasi, narx tarixi) | `/catalog/skus/:id` | `modules/catalog/SkuPage.tsx` |

Varaqlar qobig'i: `CatalogLayout.tsx`. Umumiy qismlar: `parts.tsx` (belgi/namuna, qidiruv), `types.ts` (turlar, o'xshash kodlar, kasr son), `shared/ui/ImageField.tsx` (rasm maydoni), `shared/ui/controls.tsx` → `MoneyInput` (pul maydoni).

## Kim ishlatadi
Biznes egasi, omborchi. Sotuvchi katalogni faqat sotuv ekrani orqali ko'radi (06-sales).

## Bog'liqliklar
- **Bog'liq:** 00-core
- **Bunga bog'liq:** 04-receiving, 06-sales, 08-reports

## Batafsil
`docs/03-details/03-katalog.md`

## Kod
- `backend/app/modules/catalog/` — `models` (Fabric, Color, Pattern, Sku, SkuPriceHistory), `schemas`, `service`, `router`
- `backend/app/core/media.py` — rasm yuklash va berish (qayta kodlash, hajm chegarasi)
- `backend/alembic/versions/0003_catalog.py` — 5 jadval + RLS
- `backend/tests/test_catalog.py` — 30 ta test
- `frontend/src/modules/catalog/` — sahifalar va `SkusPage.test.tsx` (7 ta test)

## API
Hammasi biznes egalari va omborchi uchun.

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/catalog/fabrics` | Matolar; `search`, `include_inactive`. Har matoda SKU soni |
| `POST` · `PATCH /api/catalog/fabrics[/{id}]` | Qo'shish · tahrirlash |
| `POST /api/catalog/fabrics/{id}/deactivate` · `/activate` | Faolsizlantirish / qaytarish |
| `GET` · `POST` · `PATCH /api/catalog/colors[/{id}]`, `.../deactivate` · `/activate` | Ranglar (`hex` — rang namunasi) |
| `GET` · `POST` · `PATCH /api/catalog/patterns[/{id}]`, `.../deactivate` · `/activate` | Gullar; "gulsiz" o'zi yaratiladi |
| `GET /api/catalog/skus` | SKU ro'yxati; `fabric_id`, `color_id`, `pattern_id`, `no_price`, `include_inactive`, `search`, `limit`, `offset` → `{items, total}` |
| `POST /api/catalog/skus` | Bitta mato uchun ranglar × gullar; borlari o'tkazib yuboriladi → `{created, existing}` |
| `POST /api/catalog/skus/price` | Ommaviy narx: tanlangan SKU'larga bitta narx → `{changed}` |
| `GET /api/catalog/skus/{id}` | Kartochka: narx tarixi va biznesning standart chegarasi bilan |
| `PATCH /api/catalog/skus/{id}` | Tavsiya narx, birligi, kam qoldiq chegarasi |
| `POST /api/catalog/skus/{id}/deactivate` · `/activate` | Faolsizlantirish / qaytarish |
| `POST /api/uploads/image` | Rasm yuklash → `{url}` |
| `GET /api/media/{biznes}/{fayl}` | Rasmni berish (tokensiz, manzil taxmin qilib bo'lmaydi) |

Xato kodlari: `code_taken`, `fabric_not_found`, `color_not_found`, `pattern_not_found`, `sku_not_found`,
`plain_pattern_protected`, `too_many_skus`, `invalid_image`, `image_too_large`.

## Qoidalar (kodda qanday bajarilgan)
- **Kodlar erkin**, o'z turi ichida noyob va katta-kichik harfni farqlamaydi ("M101" = "m101"). Baza indeksi bilan kafolatlangan. Forma yozilayotgan kodga **o'xshash kodlarni** ko'rsatib ogohlantiradi ("M-101" yozilsa — "M101 bor").
- **Ranglar va gullar ro'yxati umumiy** — barcha matolar uchun bitta (biznes boshqacha desa, baza tayyor: `fabric_id`).
- **"Gulsiz"** har biznesda bitta, o'zi yaratiladi, nomini o'zgartirsa bo'ladi, faolsizlantirib bo'lmaydi. SKU kodida yozilmaydi: `M101-03`.
- **SKU kodi** = mato-rang-gul (`M101-03-G1`). Bir kombinatsiya bir marta.
- **Tavsiya narx SKU'ga bog'liq**, so'mda, 1 metr yoki 1 kg uchun. Bo'sh bo'lishi mumkin ("narx yo'q"). Har o'zgarish **narx tarixiga** (eski → yangi, kim, qachon) va jurnalning "Narx" kategoriyasiga yoziladi. Narx o'zgarmagan bo'lsa — hech narsa yozilmaydi.
- **Ommaviy narx**: begona yoki yo'q SKU aralashgan bo'lsa, butun amal rad etiladi (hech biri o'zgarmaydi). Jurnalga bitta yozuv, har SKU tarixiga alohida qator.
- **Kam qoldiq chegarasi** bo'sh bo'lsa — biznes sozlamasidagi standart ishlatiladi (kartochkada ko'rsatib turiladi).
- **Kg ↔ metr ekvivalenti** kartochkada matoning standart koeffitsienti bo'yicha taxminan ko'rsatiladi; sotuvda partiyaning o'z koeffitsienti ishlatiladi (06-sales).
- **Hech narsa o'chirilmaydi** — mato, rang, gul, SKU faqat faolsizlantiriladi.
- **Rasmlar** qayta kodlanadi (WebP, 1200 px gacha), 8 MB dan katta yoki rasm bo'lmagan fayl rad etiladi; formaga faqat shu biznes yuklagan rasm manzili qabul qilinadi.
- Katalog o'zgarishlari jurnalning "Ombor" kategoriyasiga, narx — "Narx" kategoriyasiga.

## Keyingi modullarga qoldirilgan
- **SKU'ning kirimda avtomatik yaratilishi** va "faolsiz mato / rang / gul / SKU yangi kirimda tanlanmaydi" tekshiruvi — 04-receiving (yaratish mantig'i tayyor: `service.create_skus`).
- **Sotuvchi uchun o'qish** (tavsiya narxlar sotuv ekranida) va sotuvda nom/kodni o'sha paytdagi holida saqlash — 06-sales.
- **Biznes "kg bilan sotish"ni o'chirgan bo'lsa** narx birligidan "kg"ni yashirish — 06-sales bilan birga (hozir ikkala birlik doim ko'rinadi).
- Rasmlarni doimiy omborga (S3 yoki server diski) ko'chirish va formada bekor qilingan yuklamalarni tozalash — hosting tanlanganda.

## Tekshirish
```bash
cd backend && pytest tests/test_catalog.py
cd frontend && npm test
```
Qo'lda: `+998 90 111 22 33` / `demo1234` bilan kiring → **Katalog** (namuna: 3 mato, 6 rang, 2 gul, 11 SKU).

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:** sxemaga uchta kichik qo'shimcha kirdi — `colors.hex` (rang namunasi), `patterns.is_plain` ("gulsiz"), `sku_price_history.old_price_unit`. Hujjatda SKU faqat kirimda yaratiladi deyilgan; narxni oldindan qo'yish va sinash uchun qo'lda qo'shish ham qilindi. Katalog o'zgarishlari jurnalda "Ombor" kategoriyasiga tushadi (hujjatda faqat narx aytilgan edi).
- **Texnik qarz:** rasmlar lokal diskda; formada tanlab, keyin bekor qilingan rasm fayli diskda qoladi; mato/rang/gul ro'yxatlari to'liq yuklanadi (yuzlab qator uchun yetarli, minglab bo'lsa sahifalash kerak); ommaviy narx faqat ko'rsatilgan (yuklangan) qatorlar bo'yicha tanlanadi.
- **Keyingi modulda e'tibor:** 04-receiving partiya kiritishda `fabric.default_m_per_kg` ni partiyaga ko'chiradi va SKU bo'lmasa yaratadi; narxni kirim paytida ham o'zgartirish mumkin bo'lishi kerak — `service._change_price` tarix va jurnalni o'zi yozadi.
