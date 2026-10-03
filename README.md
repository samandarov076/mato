# mato-savdo

Mato sotuvchilar uchun SaaS: sklad (partiyalar), sotuv, nasiya, hisobotlar. Web + PWA, 3 til (uz, en, ru).

## Stek
FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL (RLS) · Redis · SSE · React + TypeScript + Vite (PWA) · Tailwind · i18next · Docker Compose

## Tuzilma
- `docs/` — tasdiqlangan talablar, xarita, eskizlar, atamalar
- `modules/` — modullar xaritasi (har modulga README)
- `backend/` — FastAPI ilova
- `frontend/` — React ilova
- `PROGRESS.md` — loyiha holati va qarorlar
- `CLAUDE.md` — AI uchun ish qoidalari

## Modullar
| # | Modul | Holat |
|---|-------|-------|
| 00 | core | ✅ |
| 01 | platform-admin | ✅ |
| 02 | structure | ✅ |
| 03 | catalog | ✅ |
| 04 | receiving | ✅ |
| 05 | inventory | ✅ |
| 06 | sales | ✅ |
| 07 | credit | ✅ |
| 08 | reports | ✅ |
| 09 | notifications | ✅ (tizim ichida) |
| 10 | telegram | ✅ (kod va testlar; jonli sinov — bot tokeni bilan) |

## Ishga tushirish (ishlab chiqish)

Talablar: Docker, Python 3.12+, Node.js 20+.

```bash
cp .env.example .env                 # portlar band bo'lsa .env da o'zgartiring
docker compose up -d                 # PostgreSQL va Redis

cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"              # yoki: uv venv --python 3.13 .venv && uv pip install -e ".[dev]"
alembic upgrade head                 # jadvallar + ilova roli (mato_app) + RLS
uvicorn app.main:app --reload --port 8000   # .env dagi BACKEND_PORT bilan bir xil bo'lsin

cd ../frontend
npm install
npm run dev                          # port .env dagi FRONTEND_PORT dan olinadi
```

Fon vazifalari (alohida oynada): `cd backend && arq app.worker.WorkerSettings` — 24 soat qabul qilinmagan ko'chirishlar va muddati o'tgan qarzlar haqida xabar, Telegram (ulash, darhol xabarlar, kunlik xulosa).

Telegram (ixtiyoriy): @BotFather'dan token oling → `.env` ga `TELEGRAM_BOT_TOKEN=...` → backend va fon ishchisini qayta ishga tushiring → biznes egasi **Profil → Telegram** da ulaydi. Batafsil: `modules/10-telegram/README.md`.

Tekshirish: `http://localhost:<FRONTEND_PORT>` — kirish sahifasi ochiladi.

### Namuna biznes (faqat lokal sinov uchun)

```bash
cd backend && python scripts/seed_dev.py
```

| Rol | Telefon | Parol |
|-----|---------|-------|
| Biznes egasi | +998 90 111 22 33 | `demo1234` |
| Omborchi | +998 90 111 22 44 | `vaqtincha1` (vaqtinchalik — birinchi kirishda almashtirish so'raladi) |
| Sotuvchi | — | do'kon qurilmasida PIN `1234` |
| Platforma egasi | +998 90 000 00 00 | `platforma1` + tasdiqlash ilovasi (birinchi kirishda QR kod bilan ulanadi) |

Namuna biznesda tayyor katalog ham bor: 3 mato, 6 rang, 2 gul, 11 SKU (ikkitasi narxsiz) — **Katalog** bo'limida ko'rinadi. Asosiy skladga bitta namuna kirim ham qilingan (3 partiya) — **Ombor** bo'limida. Sotish uchun tovarni do'konga ko'chiring (**Ombor → Ko'chirishlar**) va qabul qiling.

Yuklangan rasmlar (mato, rang, gul) loyiha ildizidagi `media/` papkasiga tushadi (`.env` dagi `MEDIA_DIR` bilan o'zgartiriladi; git'ga kirmaydi).

PIN ekranini ko'rish: biznes egasi bo'lib kiring → **Tuzilma → Qurilmalar** → do'konni tanlab **Bog'lash**. Shundan keyin shu brauzerda PIN ekrani ochiladi; PIN `1234` bilan kirsangiz — sotuv ekrani. Skaner o'rniga partiya raqamini (masalan `P-000001`) yozib Enter bosing. Biznes egasi qurilmasiz ham sota oladi: **Sotuv → Yangi sotuv**. Asliga qaytarish: PIN ekranida "Biznes egasi sifatida kirish" → tepada chiqadigan bannerdagi **Qurilmani uzish** (yoki **Tuzilma → Qurilmalar** → **Uzish**); shu bannerdagi **PIN ekraniga qaytish** — uzmasdan ortga qaytaradi.

## Testlar va tekshiruvlar

```bash
cd backend
pytest               # alohida <baza>_test bazasida; har safar noldan yaratiladi
ruff check app tests alembic scripts
alembic check        # modellar va baza mosligini tekshiradi

cd ../frontend
npm test             # komponent testlari (Vitest)
npm run lint         # ESLint
npm run build        # tur tekshiruvi + yig'ish
```

## Bazaga ulanish — ikki rol

| Rol | `.env` kaliti | Nima uchun |
|-----|---------------|------------|
| `mato_app` | `DATABASE_URL` | Biznes ichidagi barcha so'rovlar. Row-Level Security ta'sir qiladi: faqat joriy biznes qatorlari ko'rinadi. Kodda `tenant_session(business_id)`. |
| `mato` (jadvallar egasi) | `DATABASE_OWNER_URL` | Migratsiyalar; kirishda foydalanuvchini topish (biznes hali noma'lum); platforma paneli. Kodda `system_session()`. |
