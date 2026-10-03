# 00 — Umumiy (core)

## Modul nima qiladi
Tizim poydevori: kirish (telefon + parol, do'kon qurilmasida PIN), rollar va ruxsatlar, biznes sozlamalari, 3 til, harakatlar jurnali.

## Sahifalar
| Sahifa | Yo'l | Kim | Fayl |
|--------|------|-----|------|
| Kirish | `/login` | hamma | `frontend/src/modules/auth/LoginPage.tsx` |
| PIN ekrani | `/login` (bog'langan qurilmada) | sotuvchi | `modules/auth/PinPage.tsx` |
| Parolni majburiy almashtirish | birinchi kirishda | vaqtinchalik parolli xodim | `modules/auth/ChangePasswordPage.tsx` |
| Profil | `/profile` | ega, omborchi | `modules/auth/ProfilePage.tsx` |
| Do'kon qurilmalari (bog'lash, uzish) | `/structure/devices` ("Tuzilma" bo'limi ichida) | ega | `modules/auth/DevicesPage.tsx` |
| Biznes sozlamalari | `/settings` | ega | `modules/core/SettingsPage.tsx` |
| Harakatlar jurnali | `/settings/journal` | ega | `modules/core/JournalPage.tsx` |

Qobiqlar: `frontend/src/app/AppShell.tsx` (ega va omborchi — yon menyu), `app/StoreShell.tsx` (sotuvchi — do'kon qurilmasi: tepada do'kon va sotuvchi ismi, qulf tugmasi, avto-qulflash, pastki menyu).

## Kim ishlatadi
Hamma rollar

## Bog'liqliklar
- **Bog'liq:** —
- **Bunga bog'liq:** Barcha modullar

## Batafsil
`docs/03-details/00-umumiy.md`

## Kod
- `backend/app/core/` — sozlamalar (`config`), baza (`db`: `tenant_session`, `system_session`), RLS yordamchilari (`rls`), himoya (`deps`: `Auth`, `OwnerAuth`, `require_roles`), parol/token/PIN (`security`), jurnalga yozish (`audit.log_event`), urinishlar cheklovi (`ratelimit`), xatolar (`errors.AppError`), sozlamalar va jurnal API'si (`router`, `schemas`)
- `backend/app/modules/auth/` — foydalanuvchilar, sessiyalar, qurilmalar: `models`, `schemas`, `service` (kirish), `device_service` (qurilma va PIN), `router`
- `backend/app/modules/structure/` — `models` (joylar) va faqat o'qish uchun ro'yxatlar (`router`); qolgani 02-modulda
- `backend/alembic/versions/0001_core.py` — 1-migratsiya
- `backend/tests/` — 82 ta test
- `frontend/src/shared/` — API mijoz, tarjima, formatlar, rejim (kunduzgi/tungi), umumiy komponentlar (`ui/`)
- `frontend/src/modules/auth/`, `frontend/src/modules/core/`, `frontend/src/app/`

## Qurish rejasi
| # | Qadam | Holat |
|---|-------|-------|
| 1 | Loyiha asosi: Docker (PostgreSQL, Redis), backend va frontend ishga tushadi | ✅ |
| 2 | 1-migratsiya: 10 jadval, ilova roli, RLS, jurnal himoyasi + testlar | ✅ |
| 3 | Backend — kirish, sessiyalar, rol tekshiruvi, parolni almashtirish, profil, urinishlar cheklovi | ✅ |
| 4 | Backend — do'kon qurilmasi va PIN | ✅ |
| 5 | Backend — biznes sozlamalari, harakatlar jurnali | ✅ |
| 6 | Frontend — dizayn asosi, kirish sahifasi, qobiq, profil | ✅ |
| 7 | Frontend — PIN ekrani, sotuvchi qobig'i (qulf, avto-qulflash), qurilmalar, sozlamalar, jurnal | ✅ |
| 8 | Tekshiruv va yakun | ✅ |

## API
| Yo'l | Kim | Nima qiladi |
|------|-----|-------------|
| `POST /api/auth/login` | — | Telefon + parol → qisqa muddatli token (javobda) + uzoq muddatli token (httpOnly cookie) |
| `POST /api/auth/pin` | qurilma | Sotuvchining 4 xonali PIN bilan kirishi; javobda do'kon ham qaytadi |
| `POST /api/auth/refresh` | — | Cookie bo'yicha yangi qisqa muddatli token |
| `POST /api/auth/logout` | — | Sessiyani darhol tugatadi; do'kon qurilmasida — qulflash |
| `GET /api/auth/device` | — | Bu brauzer do'kon qurilmasimi (PIN ekranini ko'rsatish uchun) |
| `GET /api/auth/me` · `PATCH /api/auth/me` | kirgan | Joriy foydalanuvchi, biznes, do'kon · interfeys tilini saqlash |
| `POST /api/auth/me/password` | kirgan | Parolni almashtirish |
| `GET /api/devices` · `POST /api/devices` | ega | Bog'langan qurilmalar · SHU brauzerni do'konga bog'lash |
| `POST /api/devices/{id}/revoke` | ega | Qurilmani uzish — undagi sessiyalar darhol tugaydi |
| `GET /api/settings` · `PUT /api/settings` | ega | Biznes sozlamalari (6 ta); o'zgarish jurnalga "eski → yangi" bilan yoziladi |
| `GET /api/audit-logs` | ega | Jurnal: filtrlar (davr, xodim, joy, kategoriya), kursor bilan sahifalash |
| `GET /api/locations` · `GET /api/users` | ega | Tanlov ro'yxatlari (qurilmani bog'lash va jurnal filtrlari uchun) |

Xato kodlari: `invalid_credentials`, `account_inactive`, `business_blocked`, `session_expired`, `not_authenticated`,
`password_change_required`, `wrong_password`, `same_password`, `forbidden`, `validation_error`,
`too_many_attempts`, `invalid_pin`, `pin_locked`, `device_not_bound`, `store_not_found`, `device_not_found`, `invalid_cursor`.
Matnlari — `frontend/src/locales/*/common.json` → `errors`.

Jurnal hodisalari (hozircha): `login.success`, `login.failed`, `login.locked`, `logout`, `password.changed`, `pin.locked`,
`device.bound`, `device.revoked`, `settings.changed`. Yangi hodisa qo'shilganda uning matni uch tilda
`locales/*/common.json` → `audit.events` ga yoziladi.

## Qoidalar (kodda qanday bajarilgan)
- **Bizneslarni ajratish:** har so'rov o'z biznesi ichida (`tenant_session` + RLS); testlar bilan tekshirilgan.
- **Darhol chiqarish:** har so'rovda sessiya bazadan tekshiriladi — xodim faolsizlantirilsa, biznes bloklansa yoki qurilma uzilsa, keyingi so'rovdayoq rad etiladi.
- **Kirish cheklovi:** bitta raqamga 15 daqiqada 10 ta xato → 15 daqiqa to'xtatiladi. **PIN:** 5 ta xato → qurilma 5 daqiqaga qulflanadi. Ikkalasi ham jurnalga yoziladi. Hisoblagichlar Redis'da.
- **PIN** faqat shu biznesning faol sotuvchisiniki va unga shu do'kon ruxsat etilgan bo'lsa ishlaydi; aks holda sabab aytilmaydi.
- **Qurilmani bog'lash** qurilmaning o'zida qilinadi; bog'langach egasining sessiyasi unda tugaydi.
- **Avto-qulflash:** interfeysda — sozlamadagi daqiqa (standart 30) harakatsizlikdan keyin; serverda — shu vaqt + 30 daqiqadan keyin sessiya o'zi tugaydi.
- **Jurnal:** faqat qo'shiladi; yangilash va o'chirish bazada taqiqlangan. Hodisa matn emas, kod — har kim o'z tilida o'qiydi.
- **Til:** uz, en, ru — uch fayldagi kalitlar bir xil (181 ta).

## Boshqa modullarga qoldirilgan
- PIN'ni o'rnatish va almashtirish, xodim parolini yangilash, xodim va joylarni boshqarish — **02-structure**. Hozir PIN faqat namuna skriptida (`backend/scripts/seed_dev.py`).
- Platforma egasining kirishi (2FA), biznes egasi parolini tiklash — **01-platform-admin**.
- Savat avto-qulflashda saqlanishi — **06-sales**.
- Tannarx va foydani rol bo'yicha yashirish — tegishli modullarda (04, 06, 08), server tomonida.

## Tekshirish
```bash
cd backend && pytest && ruff check app tests alembic scripts && alembic check
cd frontend && npm test && npm run lint && npm run build
```

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)

**Rejadagidek bo'lmagan joylar**
- Skeletdagi baza ulanishi RLS'ni aslida ishlatmas edi (ilova jadval egasi bo'lib ulanardi) — ikki rolga ajratildi.
- `users.pin_hash` o'rniga `pin_lookup` (HMAC): faqat PIN bilan kirishda sotuvchini PIN bo'yicha topish kerak.
- `locations` jadvali va ikkita ro'yxat API'si (do'konlar, xodimlar) 02-moduldan oldin kerak bo'ldi.
- Qadamlar tartibi o'zgardi: 6 → 4 → 5 → 7 (natijani ertaroq ko'rsatish uchun).

**Texnik qarz**
- PWA ikonkalari yo'q (brauzerda 404).
- Urinishlar cheklovi raqam bo'yicha — begona raqamni ataylab to'xtatib qo'yish mumkin.
- Ishlab chiqarishda `system_session` uchun alohida cheklangan baza roli kerak.
- Frontend testlari hozircha 3 ta fayl (formatlar, telefon maydoni, PIN ekrani); sahifalar brauzerda qo'lda tekshirilgan.
- "Bosh sahifa" vaqtinchalik (dashboard 08-modulda, sotuv ekrani 06-modulda).

**Keyingi modulda e'tibor berish kerak**
- 01-platform-admin: platforma egasi `system_session` bilan ishlaydi — har so'rovda biznes shartini qo'lda qo'yish kerak; biznes bloklanganda uning sessiyalarini ham tugatish.
- 02-structure: xodim faolsizlantirilganda yoki do'kon o'chirilganda sessiya va qurilmalarni tugatish; PIN o'rnatishda "band" xabarini faqat egaga ko'rsatish.
