# 02 — Tuzilma

## Modul nima qiladi
Biznes egasi o'z biznesining tuzilmasini kiritadi: do'konlar, skladlar, xodimlar (sherik-ega, omborchi, sotuvchi), xodimlarni joylarga biriktirish, sotuvchi PIN'i va xodim parolini yangilash, do'kon qurilmalari.

## Sahifalar
Menyuda bitta bo'lim — **Tuzilma**, ichida to'rtta varaq.

| Sahifa | Yo'l | Fayl |
|--------|------|------|
| Do'konlar (ro'yxat, qo'shish, tahrirlash, faolsizlantirish) | `/structure` | `frontend/src/modules/structure/LocationsPage.tsx` |
| Skladlar (xuddi shu sahifa, `type="warehouse"`) | `/structure/warehouses` | `modules/structure/LocationsPage.tsx` |
| Xodimlar (ro'yxat, rol va holat filtri, qo'shish, tahrirlash, PIN / parol, faolsizlantirish) | `/structure/staff` | `modules/structure/StaffPage.tsx` |
| Do'kon qurilmalari (00-core da qurilgan, shu bo'limga ko'chdi) | `/structure/devices` | `modules/auth/DevicesPage.tsx` |

Varaqlar qobig'i: `modules/structure/StructureLayout.tsx`.

## Kim ishlatadi
Biznes egasi (asosiy ega va sherik-egalar)

## Bog'liqliklar
- **Bog'liq:** 00-core
- **Bunga bog'liq:** 04-receiving, 05-inventory, 06-sales

## Batafsil
`docs/03-details/02-tuzilma.md`

## Kod
- `backend/app/modules/structure/` — `models` (Location, UserLocation), `schemas`, `service`, `router`
- `backend/alembic/versions/0002_structure.py` — joy nomi noyobligi uchun indeks
- `backend/tests/test_structure.py` — 16 ta test
- `frontend/src/modules/structure/` — sahifalar va `StaffPage.test.tsx` (4 ta test)

## API
Hammasi faqat biznes egalari uchun (`OwnerAuth`).

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/locations` | Ro'yxat; `type=store\|warehouse`, `include_inactive`. Har joyda qurilmalar soni va biriktirilgan xodimlar |
| `POST /api/locations` | Do'kon yoki sklad qo'shish |
| `PATCH /api/locations/{id}` | Nomi, manzili, telefoni |
| `POST /api/locations/{id}/deactivate` · `/activate` | Faolsizlantirish / qayta faollashtirish |
| `GET /api/users` | Xodimlar: rol, telefon, joylar, PIN o'rnatilganmi |
| `POST /api/users` | Xodim qo'shish (rolga qarab telefon + parol yoki PIN) |
| `PATCH /api/users/{id}` | Ism, telefon, joylar |
| `POST /api/users/{id}/password` | Omborchi yoki sherik-ega parolini yangilash |
| `POST /api/users/{id}/pin` | Sotuvchi PIN'ini almashtirish |
| `POST /api/users/{id}/deactivate` · `/activate` | Faolsizlantirish / qayta faollashtirish |

Xato kodlari: `name_taken`, `phone_taken`, `pin_taken`, `location_not_found`, `user_not_found`, `primary_owner_only`,
`primary_owner_protected`, `cannot_deactivate_self`, `seller_has_no_password`, `pin_only_for_sellers`.

## Qoidalar (kodda qanday bajarilgan)
- **Hech narsa o'chirilmaydi** — do'kon, sklad va xodim faqat faolsizlantiriladi (ilova rolida DELETE huquqi ham yo'q).
- **Nom noyobligi:** do'kon nomi do'konlar orasida, sklad nomi skladlar orasida takrorlanmaydi; katta-kichik harf farqlanmaydi. Baza indeksi bilan kafolatlangan.
- **Do'kon faolsizlantirilsa** unga bog'langan qurilmalar uziladi va o'sha qurilmalardagi sessiyalar tugaydi.
- **Sotuvchi:** telefon saqlanmaydi, kirish faqat PIN bilan. PIN faol sotuvchilar orasida noyob; uni faqat biznes egasi o'rnatadi — "PIN band" xabarini faqat u ko'radi.
- **Omborchi va sherik-ega:** telefon + parol. Parolni ega qo'yadi, xodim birinchi kirishda uni almashtirishga majbur. Ega parolni yangilaganda ham shunday.
- **Joylar:** sotuvchiga faqat do'konlar, omborchiga faqat skladlar biriktiriladi ("barchasi" yoki tanlanganlari); boshqa biznes joyini yoki faolsiz joyni biriktirib bo'lmaydi.
- **Darhol kuchga kiradi:** xodim faolsizlantirilsa, joyi olib qo'yilsa, PIN'i yoki paroli almashtirilsa — ochiq sessiyalari tugaydi.
- **Egalar:** sherik-egani faqat asosiy ega qo'shadi va boshqaradi. Asosiy egani bu yerda hech kim o'zgartira olmaydi (faqat platforma egasi). Ega o'zini faolsizlantira olmaydi.
- **Qayta faollashtirish:** sotuvchining eski PIN'i shu orada boshqaga berilgan bo'lsa, avval yangi PIN so'raladi.
- Barcha o'zgarishlar jurnalga — "Xodimlar va sozlamalar" kategoriyasi.

## Keyingi modullarga qoldirilgan
- **Qoldig'i bor do'kon yoki skladni faolsizlantirib bo'lmaydi** — qoldiq jadvallari 05-inventory da paydo bo'ladi; `service.set_location_active` da `TODO(05-inventory)` belgisi turibdi.
- Omborchining "faqat o'z skladlarini ko'rishi" sklad sahifalari qurilganda (04, 05) qo'llanadi — biriktirish ma'lumoti tayyor.

## Tekshirish
```bash
cd backend && pytest tests/test_structure.py
cd frontend && npm test
```
Qo'lda: `+998 90 111 22 33` / `demo1234` bilan kiring → **Tuzilma**.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:** hujjatda nom "biznes ichida takrorlanmaydi" deyilgan — men buni tur bo'yicha qildim (bir xil nomli do'kon va sklad bo'lishi mumkin, masalan "Chorsu"), chunki ular interfeysda alohida bo'limlar. Qoldiq tekshiruvi 05-modulga ko'chdi.
- **Texnik qarz:** xodimlar va joylar ro'yxati sahifalanmagan (bitta biznesda o'nlab qator — hozircha kerak emas); `LocationsPage` uchun alohida frontend testi yo'q (mantig'i backend testlarida).
- **Keyingi modulda e'tibor:** 03-catalog da ham "o'chirish yo'q, faolsizlantirish bor" va "nom noyobligi baza indeksi bilan" uslubini saqlash; ro'yxat + ichki forma ko'rinishi (`LocationsPage`) kataloglar uchun namuna bo'la oladi.
