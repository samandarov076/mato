# 01 — Platforma admin

## Modul nima qiladi
Platforma egasining paneli: ikki bosqichli kirish (parol + tasdiqlash ilovasidagi kod), bizneslarni qo'shish, bloklash, egasi parolini tiklash, asosiy egani almashtirish.

## Sahifalar
| Sahifa | Yo'l | Fayl |
|--------|------|------|
| Kirishning ikkinchi bosqichi (kod, ilovani ulash, zaxira kodlar) | `/login` | `frontend/src/modules/platform/TwoFactorStep.tsx` |
| Bizneslar ro'yxati (qidiruv, holat filtri, saralash) | `/` | `modules/platform/BusinessesPage.tsx` |
| Biznes qo'shish (vaqtinchalik parol bir marta ko'rsatiladi) | `/businesses/new` | `modules/platform/BusinessCreatePage.tsx` |
| Biznes sahifasi (statistika, egalar, bloklash, tarix) | `/businesses/:id` | `modules/platform/BusinessPage.tsx` |

## Kim ishlatadi
Platforma egasi

## Bog'liqliklar
- **Bog'liq:** 00-core
- **Bunga bog'liq:** —

## Batafsil
`docs/03-details/01-platforma-admin.md`

## Kod
- `backend/app/modules/platform/` — `two_factor` (ikki bosqichli kirish), `service` (bizneslar), `router`, `schemas`, `models`
- `backend/app/core/deps.py` — `PlatformAuth` (platforma egasi himoyasi, `system_session`)
- `backend/tests/test_platform.py` — 16 ta test
- `frontend/src/modules/platform/`

## API
| Yo'l | Nima qiladi |
|------|-------------|
| `POST /api/auth/login` | Platforma egasi uchun sessiya emas, ikkinchi bosqichga yo'llanma qaytaradi (`two_factor`: `required` yoki `setup`) |
| `POST /api/auth/2fa/setup` | Tasdiqlash ilovasini ulashni boshlaydi: kalit va QR manzili |
| `POST /api/auth/2fa/confirm` | Birinchi kod bilan ulashni yakunlaydi → 10 ta zaxira kod + sessiya |
| `POST /api/auth/2fa/verify` | Ilovadagi kod yoki zaxira kod bilan kirish |
| `GET /api/platform/businesses` | Ro'yxat: egasi, do'konlar va xodimlar soni, holat, oxirgi faollik; `search`, `status`, `sort` |
| `POST /api/platform/businesses` | Biznes + asosiy ega; javobda vaqtinchalik parol |
| `GET /api/platform/businesses/{id}` | Kartochka: statistika, egalar, bloklash tarixi |
| `POST .../{id}/block` · `.../unblock` | Sabab majburiy; bloklanganda barcha sessiyalar darhol tugaydi |
| `POST .../{id}/owners/{user_id}/reset-password` | Yangi vaqtinchalik parol; egasi barcha qurilmalardan chiqariladi |
| `POST .../{id}/primary-owner` | Asosiy egalikni faol sherik-egaga o'tkazadi; sabab majburiy |
| `PATCH .../{id}/owners/{user_id}` | Egasining telefonini yangilaydi |

Xato kodlari: `invalid_code`, `challenge_expired`, `setup_expired`, `two_factor_already_set`, `two_factor_setup_required`,
`phone_taken`, `business_not_found`, `owner_not_found`, `invalid_owner`, `status_unchanged`.

## Qoidalar (kodda qanday bajarilgan)
- **Parolning o'zi yetmaydi:** platforma egasiga sessiya faqat ikkinchi bosqichdan keyin ochiladi. Sessiya 12 soat harakatsizlikdan keyin tugaydi.
- **Ilovani ulash** birinchi kirishda; kalit birinchi kod bilan tasdiqlanmaguncha bazaga yozilmaydi. Zaxira kodlar (10 ta) faqat bir marta ko'rsatiladi, har biri bir marta ishlaydi, bazada faqat xeshi turadi.
- **Kodni tanlab topishdan himoya:** 5 ta xato kod → 15 daqiqa to'xtatiladi.
- **Chegara:** platforma egasi biznes ichidagi ma'lumotlarga kira olmaydi (unga bunday API yo'q), biznes xodimlari esa panelga kira olmaydi — ikkala tomoni testlar bilan tekshirilgan.
- **Biznes o'chirilmaydi** — faqat bloklanadi; bloklash, blokdan chiqarish va asosiy egani almashtirish `business_status_events` ga sababi bilan yoziladi.
- Biznes yaratish, ega parolini tiklash, asosiy ega va telefon o'zgarishi biznesning o'z jurnaliga ham yoziladi ("Tizim" nomidan) — egalar buni ko'rib turadi.

## Keyingi modullarga / ishga tushirishga qoldirilgan
- **Zaxira nusxa** (kunlik, serverdan tashqarida, shifrlangan) va paneldagi "Oxirgi zaxira" holati — hosting tanlanganda.
- **Haqiqiy platforma egasini yaratish** — hozir faqat namuna skriptida (`backend/scripts/seed_dev.py`); ishga tushirishda alohida buyruq kerak.
- Zaxira kodlarni qayta yaratish, ilovani boshqa telefonga ko'chirish — keyin.
- "Keyinroq" ro'yxati (hujjatdan): support xodimi roli, o'zi ro'yxatdan o'tish, obunalar.

## Tekshirish
```bash
cd backend && pytest tests/test_platform.py
cd frontend && npm test
```
Qo'lda: `+998 90 000 00 00` / `platforma1` bilan kiring → telefoningizdagi Google Authenticator bilan QR kodni skanerlang.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:** platforma amallari uchun alohida jurnal jadvali ochilmadi — sxemadagi `business_status_events` (3 amal) yetarli bo'ldi, qolganlari biznes jurnaliga yoziladi. Yangi migratsiya kerak bo'lmadi.
- **Texnik qarz:** tasdiqlash kaliti bazada ochiq turadi (shifrlanmagan); platforma egasida profil sahifasi yo'q (parolini panel orqali almashtira olmaydi); ro'yxat sahifalanmagan (bizneslar ko'paysa kerak bo'ladi).
- **Keyingi modulda e'tibor:** 02-structure da xodim faolsizlantirilganda sessiyalarini tugatish uchun `platform/service.py` dagi `_revoke_sessions` uslubidan foydalanish.
