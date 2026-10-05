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
| Do'kon (planshet) | login `chorsu` | `dokon1234` — kirish sahifasining **Do'kon** varag'i, keyin PIN ekrani |
| Sotuvchi | — | do'kon qurilmasida PIN `1234` |
| Platforma egasi | +998 90 000 00 00 | `platforma1` (ikki bosqichli kirish ixtiyoriy — **Xavfsizlik** sahifasida yoqiladi) |

Namuna biznesda tayyor katalog ham bor: 3 mato, 6 rang, 2 gul, 11 SKU (ikkitasi narxsiz) — **Katalog** bo'limida ko'rinadi. Asosiy skladga bitta namuna kirim ham qilingan (3 partiya) — **Ombor** bo'limida. Sotish uchun tovarni do'konga ko'chiring (**Ombor → Ko'chirishlar**) va qabul qiling.

Yuklangan rasmlar (mato, rang, gul) loyiha ildizidagi `media/` papkasiga tushadi (`.env` dagi `MEDIA_DIR` bilan o'zgartiriladi; git'ga kirmaydi).

PIN ekranini ko'rish: biznes egasi bo'lib kiring → **Tuzilma → Qurilmalar** → do'konni tanlab **Bog'lash**. Shundan keyin shu brauzerda PIN ekrani ochiladi; PIN `1234` bilan kirsangiz — sotuv ekrani. Skaner o'rniga partiya raqamini (masalan `P-000001`) yozib Enter bosing. Biznes egasi qurilmasiz ham sota oladi: **Sotuv → Yangi sotuv**. Asliga qaytarish: PIN ekranida "Biznes egasi sifatida kirish" → tepada chiqadigan bannerdagi **Qurilmani uzish** (yoki **Tuzilma → Qurilmalar** → **Uzish**); shu bannerdagi **PIN ekraniga qaytish** — uzmasdan ortga qaytaradi.

### Hammasini bitta buyruq bilan (`dev.sh`)

```bash
./dev.sh start            # backend, fon ishchisi, frontend — faqat shu kompyuterda (http://localhost:5190)
./dev.sh start --phone    # + telefon uchun https (shu Wi-Fi'dan, port 5191)
./dev.sh start --tunnel   # + Cloudflare tunnel (telefon istalgan internetdan; manzil internetga ochiq)
./dev.sh status           # nima ishlayapti va manzillar
./dev.sh logs backend     # jurnal: backend | worker | frontend | phone | tunnel
./dev.sh stop             # hammasini to'xtatish
```

Serverlar terminal yopilsa ham ishlayveradi (pid va jurnallar `.dev/` da); ishlab turganda Mac uxlab qolmaydi.
Kompyuter qayta yoqilsa — `./dev.sh start` ni qayta bering. Baza va Redis (Postgres.app / Docker) yoqilgan bo'lishi kerak.

### Ilova sifatida o'rnatish (PWA)

Kirish sahifasidagi **Ilovani o'rnatish** tugmasi (kompyuterda — yuqori paneldagi ↓ belgisi ham):
Chrome / Edge / Android — brauzerning o'z oynasi ochiladi; iPhone / iPad — "Ulashish → Bosh ekranga qo'shish"
yo'riqnomasi; brauzer taklif bermasa — shu brauzer uchun qisqa yo'riqnoma. O'rnatilgach tugma yashiriladi.
Ilova o'z oynasida, bosh ekran / Dock / ish stoli belgisidan ochiladi. O'rnatish uchun sahifa `localhost`
yoki `https` da ochilgan bo'lishi kerak.

### Telefonda sinash (kamera skaneri bilan)

Brauzer kamerani faqat `https` da beradi, shuning uchun telefon uchun alohida rejim bor:

```bash
./dev.sh start --phone      # yoki: cd frontend && npm run dev:phone
```

1. Telefon va kompyuter bitta Wi-Fi'da (yoki kompyuter telefonning hotspot'iga ulangan) bo'lsin.
2. Terminalda chiqqan `Network: https://<kompyuter-manzili>:5191` ni telefonda oching — **https** va port **5191** (kompyuterdagi oddiy `npm run dev` — `http://localhost:5190` — bilan bir vaqtda ishlaydi).
3. "Ulanish xavfsiz emas" ogohlantirishi chiqadi (sertifikat lokal, o'z-o'zidan imzolangan): Chrome — **Qo'shimcha → Davom etish**; Safari — **Tafsilotlar → Saytga kirish**.
4. Kirish → **Do'kon** varag'i (`chorsu` / `dokon1234`) → PIN `1234` → skaner maydonidagi **kamera** belgisi → kameraga ruxsat bering.
5. Etiketkani skanerlash: kompyuterda Ombor → Kirimlar → kirim → **Etiketkalar** sahifasini ochib, ekrandagi shtrix-kodga telefonni tuting (yoki chop eting).

**Tarmoq orqali ochilmasa — Cloudflare tunnel** (haqiqiy https, ogohlantirishsiz, mobil internetdan ham):

```bash
brew install cloudflared                                  # bir marta
cd frontend && npm run dev:tunnel                         # http://localhost:5190, tunnel domeniga ruxsat bilan
cloudflared tunnel --no-autoupdate --url http://localhost:5190   # chiqqan https://....trycloudflare.com ni telefonda oching
```

Diqqat: tunnel ishlab turganda manzil internetga ochiq (manzilni bilgan kishi kirish sahifasini ko'radi, namuna parollar bilan kira oladi). Sinov tugagach `cloudflared` ni to'xtating (Ctrl+C). Har ishga tushirishda manzil yangi bo'ladi.

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

## Bazaga ulanish — uch rol

| Rol | `.env` kaliti | Nima uchun |
|-----|---------------|------------|
| `mato_app` | `DATABASE_URL` | Biznes ichidagi barcha so'rovlar. Row-Level Security ta'sir qiladi: faqat joriy biznes qatorlari ko'rinadi. Kodda `tenant_session(business_id)`. |
| `mato_system` | `DATABASE_SYSTEM_URL` | RLS'dan tashqari, lekin DDL va biznes ma'lumotini o'chirish huquqi yo'q: kirishda foydalanuvchini topish (biznes hali noma'lum), platforma paneli, fon vazifalari. Kodda `system_session()`. 15-migratsiya yaratadi. |
| `mato` (jadvallar egasi) | `DATABASE_OWNER_URL` | Faqat migratsiyalar (`alembic`). |

## Ishga tushirish (ishlab chiqarish)

Bitta VPS, Docker Compose, Caddy (HTTPS avtomatik), kunlik shifrlangan zaxira — to'liq yo'riqnoma, `.env.prod`
maydonlari, tiklash va avariya holatlari: `docs/07-ishga-tushirish.md`. Qisqacha: `cp .env.prod.example .env.prod`,
to'ldiring, `./deploy.sh`, so'ng `python -m app.manage create-platform-owner` (backend konteynerida).
