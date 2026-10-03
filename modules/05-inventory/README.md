# 05 — Ombor

## Modul nima qiladi
Joylar bo'yicha qoldiq (metrda), partiya kartochkasi (butun tarix), ikki bosqichli ko'chirish (jo'natish → qabul), partiyani yopish va qayta ochish, metr farqi hisoboti.

## Sahifalar
| Sahifa | Yo'l | Kim | Fayl |
|--------|------|-----|------|
| Qoldiq (SKU → joylar → partiyalar; filtr: joy, kam / manfiy / yo'lda, qidiruv) | `/stock` | hamma | `frontend/src/modules/inventory/StockPage.tsx` |
| Partiya kartochkasi (joylar, yopish / qayta ochish, harakatlar tarixi, etiketka) | `/batches/:id` | hamma | `modules/inventory/BatchPage.tsx` |
| Ko'chirishlar ro'yxati (yo'ldagilar tepada) | `/transfers` | hamma | `modules/inventory/TransfersPage.tsx` |
| Ko'chirish yaratish | `/transfers/new` | ega, omborchi | `modules/inventory/TransferCreatePage.tsx` |
| Ko'chirish kartochkasi — qabul qilish / bekor qilish (2-eskiz) | `/transfers/:id` | hamma | `modules/inventory/TransferPage.tsx` |
| Metr farqi hisoboti | `/differences` | ega | `modules/inventory/DifferencesPage.tsx` |
| Partiyani yopish (skaner yoki raqam → kartochka) | `/close` | sotuvchi (do'kon qurilmasi) | `modules/inventory/CloseBatchPage.tsx` |

Menyu: biznes egasida — bitta **Ombor** bo'limi, ichida varaqlar: Qoldiq · Kirimlar · Ko'chirishlar · Metr farqi (`InventoryHeader.tsx`). Omborchida — Qoldiq, Kirimlar, Ko'chirishlar alohida. Sotuvchida (do'kon qurilmasi) — pastki menyuda Qoldiq, Ko'chirishlar, Partiyani yopish.

## Kim ishlatadi
Biznes egasi, omborchi, sotuvchi

## Bog'liqliklar
- **Bog'liq:** 02-structure, 03-catalog, 04-receiving
- **Bunga bog'liq:** 06-sales, 08-reports, 09-notifications

## Batafsil
`docs/03-details/05-ombor.md`, eskiz: `docs/04-eskizlar.md` (2 — ko'chirishni qabul qilish)

## Kod
- `backend/app/modules/inventory/` — `models` (BatchStock, StockMovement, Transfer, TransferLine, BatchClosure), `stock` (`move_stock`, `lock_stock`), `service` (qoldiq, partiya, yopish, metr farqi), `transfers` (ko'chirish), `schemas`, `router`
- `backend/app/modules/structure/access.py` — kim qayerda ishlay oladi (`can_act_at`), kim qaysi joyni ko'radi (`visible_location_ids`)
- `backend/alembic/versions/0005_inventory.py` — `transfers`, `transfer_lines`, `batch_closures` + RLS
- `backend/tests/test_inventory.py` — 28 ta test; umumiy sinov biznesi: `tests/shop.py`
- `frontend/src/modules/inventory/` — sahifalar, `TransferPage.test.tsx` (5 ta test)

## API
| Yo'l | Kim | Nima qiladi |
|------|-----|-------------|
| `GET /api/stock` | hamma | Qoldiq: SKU bo'yicha → har joydagi jami → partiyalar; `location_id`, `fabric_id`, `color_id`, `pattern_id`, `search`, `only=low\|negative\|in_transit` |
| `GET /api/stock/differences` | ega | Metr farqi: yopilgan partiyalar va ko'chirish farqlari; `date_from`, `date_to`, `location_id`, `user_id`, `kind` |
| `GET /api/batches/by-number/{raqam}` | hamma | Skaner: partiya raqami bo'yicha id |
| `GET /api/batches/{id}` | hamma | Kartochka: joylar bo'yicha qoldiq, yo'ldagi ko'chirishlar, harakatlar tarixi |
| `POST /api/batches/{id}/close` | joyiga qarab | Partiyani shu joyda yopish |
| `POST /api/batches/{id}/reopen` | ega, omborchi | Xato yopilganni qayta ochish |
| `GET /api/transfers` | hamma | Ro'yxat; `status`, `location_id`, `date_from`, `date_to` |
| `GET /api/transfers/options` · `/sendable` | ega, omborchi | Forma uchun: qayerdan / qayerga; shu joydan jo'natsa bo'ladigan partiyalar |
| `POST /api/transfers` | ega, omborchi | Jo'natish |
| `GET /api/transfers/{id}` | hamma | Kartochka |
| `POST /api/transfers/{id}/receive` | qabul qiluvchi | Kelgan rulon va metrni tasdiqlash |
| `POST /api/transfers/{id}/cancel` | jo'natuvchi, ega | Yo'ldagi ko'chirishni bekor qilish |

Xato kodlari: `batch_not_open`, `batch_not_closed`, `batch_in_transit`, `not_enough_stock`, `transfer_not_found`, `transfer_not_in_transit`, `location_forbidden`, `location_has_stock`.

## Qoidalar (kodda qanday bajarilgan)
- **Qoldiq metrda**, (partiya, joy) bo'yicha; rulonlar soni taxminiy (qoldiq ÷ o'rtacha rulon uzunligi). Qoldiqni faqat `move_stock` o'zgartiradi — har harakat tarixda qoladi.
- **Kim nimani ko'radi:** ega — hammasini; omborchi — o'z skladlari va barcha do'konlar; sotuvchi — barcha joylar, lekin faqat metr va rulon (narx va tannarx serverdan yuborilmaydi). Tannarx partiya kartochkasida faqat egaga.
- **Ko'chirish ikki bosqichli:** jo'natilganda metr jo'natuvchidan chiqadi ("yo'lda"), qabulda haqiqatda kelgani qabul qiluvchiga kiradi. Qoldiqdan ko'p jo'natib bo'lmaydi.
- **Kim jo'natadi / qabul qiladi:** ega — istalgan joydan; omborchi — o'z skladidan. Qabul: do'konga — shu do'kon qurilmasidagi sotuvchi; skladga — shu sklad omborchisi; ega — har qanday. Bekor qilish: jo'natuvchi yoki ega, faqat yo'lda bo'lsa.
- **Farq bilan qabul:** rulon yoki metr jo'natilgandan farq qilsa — izoh majburiy. Farq hech qaysi joy qoldig'iga kirmaydi, faqat ko'chirish qatorida turadi va hisobotda alohida ko'rinadi (yopishda ikkinchi marta hisoblanmaydi).
- **Bir ko'chirishni ikki kishi qabul qila olmaydi** — qator qulflanadi, ikkinchisi "allaqachon qabul qilingan" javobini oladi.
- **Yopish:** partiya har joyda alohida yopiladi. Tizimda qolgan metr — metr farqi: musbat — "kam chiqdi", manfiy — "ortiq chiqdi"; so'mda ham (farq × tannarx). Shu joyga yo'lda tovar kelayotgan bo'lsa — yopib bo'lmaydi. Farq 10% dan katta bo'lsa — qo'shimcha ogohlantirish.
- **Kim yopadi:** sotuvchi — o'z do'konida; omborchi — o'z skladida; ega — har qayerda. **Qayta ochish** — ega yoki (o'z skladida) omborchi: qoldiq qaytadi, metr farqi yozuvi bekor bo'ladi.
- **Yopilgan joyga yangi ko'chirish kelsa** — partiya u yerda o'zi qayta ochiladi.
- **Kam qoldiq** har joy bo'yicha: SKU'ning shu joydagi jami qoldig'i chegaradan (SKU'niki yoki biznes standarti) past bo'lsa belgilanadi.
- **Bekor qilingan kirim** partiyalari qoldiqda ko'rinmaydi.
- **Qoldig'i yoki yo'lda tovari bor joy faolsizlantirilmaydi** (02-tuzilmadan qolgan qoida shu yerda yopildi).
- Hammasi jurnalga ("Ombor"): jo'natildi, qabul qilindi (farqi bilan), bekor qilindi, yopildi, qayta ochildi.

## Keyingi modullarga qoldirilgan
- **Xabarlar** (09-notifications): farq bilan qabul qilinganda egalarga xabar, 24 soat qabul qilinmagan ko'chirish eslatmasi, kam qoldiq xabari. `transfers.receive_transfer` da `TODO(09-notifications)` belgisi bor.
- **Sotuv** (06-sales): manfiy qoldiqda izoh bilan sotish; yopilgan joyda partiyani sotib bo'lmasligi — sotuv `move_stock` va `batch_stock.status` dan foydalanadi.
- Qoldiq sahifasida mato / rang / gul bo'yicha alohida tanlovlar o'rniga bitta qidiruv maydoni (kod, nom, partiya raqami) — sotuvchi katalog ro'yxatlarini ko'ra olmagani uchun.
- Inventarizatsiya (to'liq sanash) — "keyinroq" ro'yxatida.

## Tekshirish
```bash
cd backend && pytest tests/test_inventory.py
cd frontend && npm test
```
Qo'lda: `+998 90 111 22 33` / `demo1234` → **Ombor**. Sotuvchi tomoni: **Tuzilma → Qurilmalar** da shu brauzerni do'konga bog'lang → PIN `1234`.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:** sxemadagi qator izohi (`transfer_lines.diff_note`) o'rniga butun ko'chirish uchun bitta `transfers.receive_note` — eskizda ham izoh bitta. Kirim raqami `KR-` ga o'zgardi, chunki eskizda `K-` ko'chirishga berilgan. Qoldiqda uchta tanlov o'rniga qidiruv.
- **Texnik qarz:** qoldiq sahifasi ko'p joyli biznesda (5+ joy) belgilar bilan zich bo'ladi — pilotda ko'rib, jadval ko'rinishi kerakmi hal qilinadi; metr farqi hisoboti sahifalanmagan (500 qatorgacha); harakatlar tarixi oxirgi 200 ta.
- **Keyingi modulda e'tibor:** 09-notifications `transfer.received` (farq bilan) va kam qoldiq hodisalariga ulanadi; 06-sales sotuvda `lock_stock` → tekshirish → `move_stock` tartibini saqlasin (ikki sotuvchi bitta partiyani bir paytda sotganda qoldiq to'g'ri chiqishi shunga bog'liq).
