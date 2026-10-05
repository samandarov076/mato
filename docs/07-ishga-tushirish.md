# 07 — Ishga tushirish (prod) va xavfsizlik

Maqsad: ilovani **bitta VPS**da (Ubuntu 22.04/24.04, Docker Compose) xavfsiz, hujjatlangan va qayta tiklanadigan
holda ishga tushirish. Kubernetes, CI/CD, bir nechta server — yo'q; soddalik muhim. Server, domen va Telegram
tokeni hali yo'q — matnda o'rinbosarlar: `SIZNING-DOMEN.uz`, `SIZNING-SERVER-IP`.

Bu hujjat — qarorlar daftari ham: kodga tegishdan oldin qaror shu yerga yoziladi.

## 1. Arxitektura

```
Internet ──443/80──▶ caddy (HTTPS avtomatik, statik frontend, /api proxy)
                        │ /api/*
                        ▼
                     backend (uvicorn, 2 ishchi, root emas) ──▶ db (PostgreSQL 16, faqat ichki tarmoq)
                     worker  (arq: Telegram, eslatmalar,    ──▶ redis (faqat ichki tarmoq)
                              tozalash, kechki solishtiruv)
                     backup  (cron 03:00: pg_dump + media → age → rclone)
```

Hammasi `docker-compose.prod.yml` dagi oltita xizmat, bitta ichki tarmoq. Tashqariga faqat Caddy'ning 80 va 443
portlari ochiq. `db` va `redis` portlari serverda ham ochilmaydi (faqat konteynerlar orasida).

| Xizmat | Tasvir (image) | Vazifa | Doimiy ma'lumot |
|---|---|---|---|
| `db` | `postgres:16-alpine` | Baza | `pgdata` volume |
| `redis` | `redis:7-alpine` | Urinishlar hisobi, navbat, real vaqt signali | `redisdata` volume (yo'qolsa ham zarar yo'q) |
| `backend` | `backend/Dockerfile` (ko'p bosqichli, `app` foydalanuvchisi) | API | `media` volume (`/data/media`) |
| `worker` | o'sha tasvir, `arq app.worker.WorkerSettings` | Fon vazifalari | — |
| `caddy` | `deploy/caddy.Dockerfile` (frontend build + Caddy) | HTTPS, statik fayllar, proxy | `caddy_data` (sertifikatlar) |
| `backup` | `deploy/backup/Dockerfile` (alpine + pg_dump + age + rclone) | Kunlik zaxira | `backups` volume (so'nggi nusxalar) |

Qarorlar:
- **Caddy** (nginx emas): Let's Encrypt sertifikatini o'zi oladi va yangilaydi, sozlama 30 qator.
- **SSE** (`/api/notifications/stream`) Caddy orqali `flush_interval -1` bilan o'tadi — buferlanmaydi, aks holda
  "yangi xabar bor" signali brauzerga kechikib boradi.
- **Frontend** Caddy tasvirining ichida (`vite build` natijasi `/srv`). Alohida "frontend" konteyneri yo'q.
- **Baza egasi** — konteynerning `POSTGRES_USER` roli (`mato`, superuser). U faqat migratsiya va zaxirada ishlatiladi.
  Ilova ishlayotganda bazaga ikki cheklangan rol bilan kiradi: `mato_app` (RLS ta'sir qiladi) va `mato_system`
  (RLS'dan tashqari, lekin DDL va DELETE yo'q — 6.2-bo'lim).
- **Sirlar** faqat `.env.prod` da (git'da yo'q, `.gitignore` da). Zaxira kaliti (age) serverda **yo'q** — faqat
  ochiq kaliti (recipient) bor; yopiq kalit administratorning kompyuterida/parol menejerida.

## 2. Noldan serverga (yo'riqnoma)

Talab: VPS (2 vCPU, 4 GB RAM, 40 GB SSD yetarli), Ubuntu 22.04/24.04, domen DNS'da serverga qaratilgan
(`A` yozuv: `SIZNING-DOMEN.uz → SIZNING-SERVER-IP`). Hamma buyruqlar serverda, oddiy foydalanuvchi nomidan.

```bash
# 1. Tizim va xavfsizlik devori
sudo apt update && sudo apt -y upgrade
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
# SSH: faqat kalit bilan kirish (parolni o'chiring): /etc/ssh/sshd_config → PasswordAuthentication no

# 2. Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

# 3. Kod
git clone https://GIT-MANZIL/mato-savdo.git ~/mato && cd ~/mato

# 4. Sozlamalar
cp .env.prod.example .env.prod
openssl rand -base64 48     # → SECRET_KEY
openssl rand -base64 48     # → CREDENTIALS_KEY (boshqasi!)
openssl rand -base64 24     # → POSTGRES_PASSWORD, mato_app va mato_system parollari (har biriga alohida)
nano .env.prod              # domen, parollar, kalitlar — 3-bo'limdagi jadval
chmod 600 .env.prod

# 5. Zaxira kaliti — O'Z KOMPYUTERINGIZDA (serverda emas):
#    age-keygen -o mato-backup-key.txt   → "Public key: age1..." qatorini .env.prod → BACKUP_AGE_RECIPIENT
#    mato-backup-key.txt faylini parol menejeriga + qog'ozga. Serverga YUKLAMANG.
# 6. Tashqi ombor (rclone): o'z kompyuteringizda `rclone config` → S3-mos ombor (Backblaze B2, Hetzner Object
#    Storage, Yandex Object Storage ...). Hosil bo'lgan rclone.conf ni serverga: ~/mato/deploy/backup/rclone.conf
#    (chmod 600). .env.prod → BACKUP_RCLONE_REMOTE=nom:bucket/mato

# 7. Ishga tushirish (build + migratsiya + start + health)
./deploy.sh

# 8. Platforma egasi (birinchi foydalanuvchi)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python -m app.manage create-platform-owner
#    → telefon va ism so'raydi, vaqtinchalik parol chiqaradi. https://SIZNING-DOMEN.uz da kiring:
#    parol almashtiriladi, tasdiqlash ilovasi (2FA) ulanadi (PLATFORM_2FA_REQUIRED=true), zaxira kodlar saqlanadi.

# 9. Birinchi zaxirani qo'lda oling va tiklashni sinang (5-bo'lim)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup /backup.sh
```

Server vaqti: konteynerlar `TZ=Asia/Tashkent` bilan ishlaydi (zaxira va kechki vazifalar soati shu bo'yicha),
baza va ilova ichidagi vaqtlar UTC'da saqlanadi (avvalgidek).

## 3. `.env.prod` maydonlari

Namuna: `.env.prod.example` (har maydon izohli). Qisqa jadval:

| Maydon | Qiymat | Izoh |
|---|---|---|
| `SITE_ADDRESS` | `SIZNING-DOMEN.uz` | Caddy shu nomga sertifikat oladi. Lokal mashqda `mato.localhost` |
| `HTTP_PORT`, `HTTPS_PORT` | `80`, `443` | Serverda shunday qoladi; lokal mashqda `8090`/`8443` |
| `POSTGRES_USER/PASSWORD/DB` | `mato` / uzun parol / `mato_savdo` | Konteyner yaratadigan superuser — faqat migratsiya va zaxira |
| `DATABASE_OWNER_URL` | `postgresql+asyncpg://mato:…@db:5432/mato_savdo` | Faqat `alembic upgrade` (deploy.sh) |
| `DATABASE_URL` | `postgresql+asyncpg://mato_app:…@db:5432/mato_savdo` | Ilova roli, RLS. Rolni 1-migratsiya shu paroldan yaratadi |
| `DATABASE_SYSTEM_URL` | `postgresql+asyncpg://mato_system:…@db:5432/mato_savdo` | `system_session` roli (kirish, platforma, fon). 15-migratsiya yaratadi |
| `REDIS_URL` | `redis://redis:6379/0` | |
| `APP_ENV` | `prod` | Cookie faqat HTTPS; `CREDENTIALS_KEY` va `DATABASE_SYSTEM_URL` majburiy |
| `SECRET_KEY` | `openssl rand -base64 48` | Tokenlar va PIN qidiruv xeshi |
| `CREDENTIALS_KEY` | `openssl rand -base64 48` | Ko'rinadigan parol/PIN va tasdiqlash ilovasi kaliti shifri. SECRET_KEY'dan farqli! |
| `PLATFORM_2FA_REQUIRED` | `true` | Platforma egasiga tasdiqlash ilovasi majburiy |
| `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS` | `30`, `30` | |
| `MEDIA_DIR` | `/data/media` | Konteyner ichidagi yo'l — `media` volume |
| `CORS_ORIGINS` | `https://SIZNING-DOMEN.uz` | Faqat prod domen |
| `APP_TIMEZONE`, `TZ` | `Asia/Tashkent` | |
| `UVICORN_WORKERS` | `2` | 2 vCPU uchun; 4 vCPU → 4 |
| `FORWARDED_ALLOW_IPS` | `*` | Backend faqat Caddy'dan so'rov oladi (porti ochiq emas), shuning uchun Caddy yozgan `X-Forwarded-For` ga ishonadi — IP cheklovi shunga qaraydi |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` tokeni | Bo'sh — Telegram o'chiq |
| `PLATFORM_ALERT_CHAT_ID` | platforma egasining Telegram chat raqami | "Zaxira olinmadi", "qoldiq farqi" xabarlari shu suhbatga. Olish: botga `/start` yuboring, so'ng `@userinfobot` ga yozib o'z `Id` ingizni oling |
| `BACKUP_AGE_RECIPIENT` | `age1…` | Zaxira shifrining OCHIQ kaliti |
| `BACKUP_RCLONE_REMOTE` | `b2:mato-backups/prod` | Bo'sh — faqat `backups` volume (serverdan tashqariga chiqmaydi — bu talabga zid, vaqtinchalik) |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` | `7`, `4` | Saqlash muddati |

## 4. Yangilash (deploy) tartibi

```bash
cd ~/mato && ./deploy.sh
```

`deploy.sh` qadamlari:
1. `git pull --ff-only` (lokal o'zgarish bo'lsa to'xtaydi);
2. `docker compose build` — backend va caddy (frontend) tasvirlari;
3. `alembic upgrade head` — alohida vaqtinchalik konteynerda, **eski backend hali ishlab turganda**. Xato bersa skript
   shu yerda to'xtaydi: Alembic har migratsiyani tranzaksiyada bajaradi, baza oldingi holatda qoladi, eski kod
   ishlayveradi;
4. `docker compose up -d` — yangi konteynerlar (10–20 soniya uzilish);
5. `/api/health` 60 soniya ichida `ok` qaytarmasa — xato bilan chiqadi (`docker compose logs backend` ga qarang).

Orqaga qaytish: `git checkout <oldingi-commit> && ./deploy.sh` (migratsiya `downgrade` kerak bo'lsa qo'lda:
`... run --rm backend alembic downgrade -1`).

## 5. Zaxira va tiklash

Talab (01-platforma-admin): har kuni kechasi, serverdan tashqarida, shifrlangan, oyiga bir sinov tiklash.

**Nima olinadi:** `pg_dump -Fc` (baza), `pg_dumpall --roles-only` (rollar: `mato_app`, `mato_system` — restore'da
kerak), `media/` arxivi. Hammasi bitta `mato-YYYY-MM-DD.tar` ga, so'ng `age -r $BACKUP_AGE_RECIPIENT` bilan
shifrlanadi → `mato-YYYY-MM-DD.tar.age`.

**Qayerga:** `backups` volume (`/backups/daily`, `/backups/weekly`) va `rclone copy` bilan `BACKUP_RCLONE_REMOTE`.
Yakshanba nusxasi `weekly/` ga ham yoziladi. Saqlash: kunlik 7 kun, haftalik 4 hafta (lokalda ham, tashqarida ham).

**Qachon:** har kuni 03:00 (Asia/Tashkent), `backup` konteyneridagi cron.

**Muvaffaqiyatsiz bo'lsa:** `/backups/backup.log` ga yoziladi, `/backups/last-status` da `failed`, platforma egasiga
Telegram (`PLATFORM_ALERT_CHAT_ID`) xabar: "⚠️ Zaxira olinmadi: <bosqich>". Telegram sozlanmagan bo'lsa — faqat jurnal.
Tekshirish: `docker compose ... exec backup cat /backups/last-status`.

**Kalit:** `age` yopiq kaliti serverda yo'q. Zaxirani faqat kalit egasi ochadi. Kalit saqlanadigan joylar: parol
menejeri + qog'ozda seyfda. `.env.prod` ning nusxasi ham parol menejerida (undagi `CREDENTIALS_KEY` siz tiklangan
bazadagi ko'rinadigan parollar va 2FA kaliti ochilmaydi).

**Tiklash** (`restore.sh`): backend va worker to'xtatiladi, arxiv ochiladi, rollar tiklanadi, baza `DROP` → `CREATE`
→ `pg_restore`, media almashtiriladi, backend qayta ishga tushadi.

```bash
# Yopiq kalitni VAQTINCHA serverga: ~/mato/deploy/backup/keys/mato-backup-key.txt
docker compose -f docker-compose.prod.yml --env-file .env.prod stop backend worker
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm restore \
    /backups/daily/mato-2026-10-04.tar.age /keys/mato-backup-key.txt
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
shred -u ~/mato/deploy/backup/keys/mato-backup-key.txt     # kalitni serverdan o'chiring
```

Tashqaridagi nusxani olish: `rclone copy $BACKUP_RCLONE_REMOTE/daily/mato-2026-10-04.tar.age ./`.

**Sinov tiklash (oyiga bir marta, "tiklanmagan zaxira — yo'q zaxira"):** o'z kompyuteringizda
`docker compose -f docker-compose.prod.yml --env-file .env.local-prod` bilan bo'sh muhit ko'taring (9-bo'lim),
serverdan oxirgi `.tar.age` ni oling, `restore.sh` bilan tiklang, kiring, so'nggi sotuvlar va rasmlar bormi —
tekshiring. Natijani PROGRESS'ga sana bilan yozing.

**S3'ga (media) qachon o'tiladi:** media hajmi 20 GB dan oshsa yoki ikkinchi server/CDN kerak bo'lsa. Faqat
`app/core/media.py` dagi `_save` va `media_path` o'zgaradi (hujjatlangan). Ungacha — volume + zaxira.

## 6. Xavfsizlik qarorlari

### 6.1 Tasdiqlash ilovasi kaliti (`users.totp_secret`) shifrlangan
14-migratsiya mavjud qiymatlarni `vault.seal` bilan o'giradi; kod yozishda `seal`, o'qishda `unseal`. Kalit —
`CREDENTIALS_KEY`. Kalit yo'qolsa: kod tekshiruvi o'tmaydi, lekin **zaxira kodlar** (xeshlangan, kalitga bog'liq emas)
ishlaydi → kirib, "Xavfsizlik" sahifasida ilovani o'chirib, qayta ulanadi.

### 6.2 `system_session` uchun `mato_system` roli
Avval `system_session` jadvallar egasi (superuser) bilan ishlardi. Endi 15-migratsiya `mato_system` rolini yaratadi:
`LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`; `public` sxemadagi barcha jadvallarga `SELECT, INSERT, UPDATE`;
`DELETE` faqat `sessions`, `notifications`, `recovery_codes` (tozalash va 2FA o'chirish uchun). DDL yo'q — ilova
sirlari o'g'irlansa ham jadval o'chirilmaydi, `audit_logs` o'zgartirilmaydi. Kelajakdagi jadvallar uchun
`ALTER DEFAULT PRIVILEGES` — yangi migratsiyada alohida GRANT yozish shart emas.
`DATABASE_SYSTEM_URL` — shu rol; `DATABASE_OWNER_URL` faqat migratsiya uchun qoladi. Dev'da `DATABASE_SYSTEM_URL`
bo'sh qoldirilsa — egasi ishlatiladi (prod'da majburiy).

### 6.3 Caddy sarlavhalari va CSP
`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera — faqat o'zi), CSP:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
connect-src 'self'; worker-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self';
form-action 'self'; object-src 'none'`. Inline skript yo'q: `index.html` dagi mavzu (tungi rejim) skripti
`public/theme.js` ga chiqarildi. `style-src` da `'unsafe-inline'` — React/Three.js inline uslublari uchun
(skriptga nisbatan xavfi past). So'rov tanasi: 10 MB (rasm yuklash chegarasi 8 MB).
Statik: `/assets/*` — `immutable` 1 yil; `index.html`, `sw.js`, manifest — `no-cache`.

### 6.4 IP bo'yicha kirish cheklovi
Raqam/qurilma bo'yicha bloklar qoladi (00-umumiy). Qo'shimcha: bitta IP'dan `/auth/login`, `/auth/store-login`,
`/auth/pin` bo'yicha jami **15 daqiqada 30 ta xato → 15 daqiqa** (hisob Redis'da, `rl:ip:*`). Muvaffaqiyatli
kirish IP hisobini nolga tushirmaydi (aralashtirib tekshirish yo'li yopiq). Haqiqiy IP — Caddy yozgan
`X-Forwarded-For` (uvicorn `--proxy-headers`, `FORWARDED_ALLOW_IPS=*`; Caddy mijozdan kelgan `X-Forwarded-*` ni
olib tashlab, o'zinikini yozadi). Bir ofisdan 30 xato — kamdan-kam; bo'lsa 15 daqiqa kutiladi.

### 6.5 Jurnal gigienasi
- Parol, PIN, token faqat so'rov tanasida (POST JSON) — uvicorn access log'ida tana yo'q. Query string'da sir
  yo'q: SSE `Authorization` sarlavhasi bilan (`fetch`), Telegram havolasi tashqi (`t.me`).
- Xato javoblari kod + maydon nomi (`errors.py`), stacktrace'da so'rov tanasi chiqmaydi (FastAPI standart).
- Docker jurnallari: `json-file`, 10 MB × 5 fayl har konteynerga.

### 6.6 Fon tozalash va kechki solishtiruv (worker)
- `purge_expired_sessions` — haftada bir (dushanba 04:00): `expires_at < now()` sessiyalar o'chiriladi.
- `purge_read_notifications` — har kuni 04:10: 90 kundan eski o'qilgan xabarlar.
- `reconcile_stock` — har kuni 02:30: har `batch_stock.qty_m` ↔ `SUM(stock_movements.qty_m)`; farq topilsa
  `ERROR` jurnali + platforma egasiga Telegram (`PLATFORM_ALERT_CHAT_ID`). Hech narsa tuzatilmaydi — ledger
  kafolati buzilgan bo'lsa, sababini odam ko'radi.

### 6.7 Boshqaruv buyruqlari
`python -m app.manage create-platform-owner` — telefon + ism, vaqtinchalik parol (`must_change_password`), mavjud
bo'lsa xato. `seed_dev.py` `APP_ENV=dev` bo'lmasa ishlamaydi. Platforma egasi parolini `/auth/me/password` orqali
almashtiradi (endi platforma sessiyasi ham qabul qilinadi); parol almashtirilmaguncha platforma paneli yopiq.

### 6.8 Tezkor tekshiruvlar (natija 11-bo'limda)
`dangerouslySetInnerHTML`, `.env*` git'da yo'qligi, XLSX `Content-Disposition`, `/api/health` mazmuni,
CORS ro'yxati, `pip-audit`, `npm audit`.

## 7. Avariya holatlari

| Holat | Nima bo'ladi | Nima qilinadi |
|---|---|---|
| **Baza buzildi / volume yo'qoldi** | Ilova 500 beradi (`/api/health` db xato) | Oxirgi zaxiradan tiklash (5-bo'lim). Yo'qotish — oxirgi zaxiradan keyingi ≤ 24 soat |
| **Server butunlay o'chdi** | Sayt ochilmaydi | Yangi VPS → 2-bo'lim (1–3, 6) → `.env.prod` ni parol menejeridan → `./deploy.sh` → tashqaridan oxirgi `.tar.age` → `restore.sh` → DNS'ni yangi IP'ga |
| **`.env.prod` yo'qoldi, parol menejerida nusxasi bor** | — | Nusxadan tiklash, `./deploy.sh` |
| **`SECRET_KEY` yo'qoldi** (nusxasiz) | Barcha sessiyalar tugaydi; sotuvchilarning PIN qidiruv xeshi mos kelmaydi | Yangi kalit, hamma qayta kiradi; **egalar sotuvchilar PIN'ini qayta o'rnatadi** |
| **`CREDENTIALS_KEY` yo'qoldi** | Kirish ishlaydi; "parolni ko'rish" bo'sh; platforma egasi ilova kodi bilan kira olmaydi | Zaxira kod bilan kirish → 2FA'ni o'chirib qayta ulash; xodim parollari keyingi almashtirishda qayta saqlanadi |
| **age yopiq kaliti yo'qoldi** | Eski zaxiralar o'qilmaydi (baza o'zi sog') | Darhol yangi kalit (`age-keygen`), `BACKUP_AGE_RECIPIENT` yangilanadi, qo'lda zaxira olinadi |
| **Zaxira ketma-ket olinmayapti** | Telegram/`last-status: failed` | `docker compose logs backup`, `/backups/backup.log`; ko'pincha rclone/ombor paroli yoki disk to'lgan |
| **Redis yo'qoldi** | Bloklar va navbatdagi Telegram xabarlari yo'qoladi, real vaqt qayta ulanadi | Hech narsa; Redis qayta ko'tariladi |
| **Sertifikat olinmadi** | HTTPS ochilmaydi | DNS `A` yozuvi va 80/443 ochiqligini tekshirish; `docker compose logs caddy` |

## 8. Telegram jonli sinov (token qo'yilgach)

Holat: **token kutilmoqda** (bot yaratilmagan). Kod soxta Telegram serveri bilan testlangan (`tests/test_telegram.py`).
Token qo'yilgach qo'lda:

- [ ] `.env.prod` → `TELEGRAM_BOT_TOKEN`, `./deploy.sh`; `docker compose logs worker` da xato yo'q
- [ ] Ega profilida "Telegram'ni ulash" → havola → botda Start → profil "ulangan (@nom)" ko'rsatadi
- [ ] Ko'chirishda farq bilan qabul → egaga darhol Telegram xabari (ega tilida)
- [ ] Partiyani katta farq bilan yopish → darhol xabar
- [ ] Biznes sozlamasida kunlik xulosa vaqtini 5 daqiqa keyinga qo'yish → xulosa keladi (savdo bo'lmasa ham)
- [ ] Botni bloklash → profilda "uzilgan", tizim ichida "Telegram uzildi" xabari
- [ ] Platforma egasi: botga `/start`, `PLATFORM_ALERT_CHAT_ID` → `.env.prod`; `exec backup /backup.sh` ni noto'g'ri
      `BACKUP_RCLONE_REMOTE` bilan ishga tushirib, "Zaxira olinmadi" xabari kelganini ko'rish

## 9. Lokal prod mashqi (shu kompyuterda)

```bash
cp .env.prod.example .env.local-prod
# SITE_ADDRESS=mato.localhost  HTTP_PORT=8090  HTTPS_PORT=8443  (localhost emas: HSTS dev serverga tegib ketmasin; portlar band bo'lsa boshqasi)
# ENV_FILE=.env.local-prod   (compose ichidagi env_file shu faylga qarashi uchun)
# parollar/kalitlarni to'ldiring (oddiy bo'lsa ham), BACKUP_AGE_RECIPIENT=age1...
docker compose -f docker-compose.prod.yml --env-file .env.local-prod build
docker compose -f docker-compose.prod.yml --env-file .env.local-prod run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.local-prod up -d
open https://mato.localhost:8443      # Caddy ichki CA sertifikati — brauzer ogohlantiradi, "davom etish"
```

Natijalar — 11-bo'limda.

## 10. Serverga chiqishdan oldingi tekshiruv ro'yxati

- [ ] `.env.prod`: `APP_ENV=prod`, `SECRET_KEY` ≠ `CREDENTIALS_KEY`, ikkalasi ≥ 48 belgi, `PLATFORM_2FA_REQUIRED=true`
- [ ] `CORS_ORIGINS` va `SITE_ADDRESS` — faqat prod domen
- [ ] `DATABASE_URL` (`mato_app`), `DATABASE_SYSTEM_URL` (`mato_system`), `DATABASE_OWNER_URL` (`mato`) — uch xil parol
- [ ] `.env.prod` va age yopiq kaliti parol menejerida (ikki nusxa)
- [ ] DNS `A` yozuvi serverga; `ufw` faqat 22/80/443; SSH faqat kalit bilan
- [ ] `./deploy.sh` yashil; `https://SIZNING-DOMEN.uz/api/health` → `{"status":"ok"}`
- [ ] `create-platform-owner` → kirish → parol almashtirildi → 2FA ulandi → zaxira kodlar saqlandi
- [ ] `exec backup /backup.sh` → `last-status: ok`, tashqi omborda fayl ko'rindi (`rclone ls`)
- [ ] `restore.sh` bo'sh muhitda sinaldi (sana PROGRESS'da)
- [ ] `PLATFORM_ALERT_CHAT_ID` to'ldirilgan, sinov xabari keldi (token bo'lsa)
- [ ] Brauzerda: kirish, sotuv, xabar real vaqtda (ikki brauzer), rasm yuklash, PWA o'rnatish taklifi, Excel yuklash
- [ ] Konsolda CSP xatosi yo'q (`Refused to ...`)
- [ ] `docker compose ps` — hammasi `healthy`; `docker compose logs` da ERROR yo'q

## 11. Mashq va tekshiruv natijalari (2026-10-04)

Lokal prod mashqi shu kompyuterda (`.env.local-prod`, loyiha nomi `mato-prod`, `mato.localhost:8443`, HTTP 8090).
Ma'lumot — dev bazasidan olingan zaxira (shuning uchun `SECRET_KEY`/`CREDENTIALS_KEY` dev qiymatlariga teng qo'yildi).

| Tekshiruv | Natija |
|---|---|
| `docker compose build` (backend, caddy+frontend, backup) | ✅ uchala tasvir yig'ildi (backend `app` uid 1000, root emas) |
| `alembic upgrade head` prod tasvirida | ✅ 0001→0015, `mato_app` va `mato_system` rollari yaratildi |
| `docker compose ps` | ✅ 6 xizmat `healthy` (worker — `arq --check`) |
| `https://mato.localhost:8443/api/health` | ✅ `{"status":"ok","db":"ok","redis":"ok"}`, sir yo'q |
| Sarlavhalar | ✅ HSTS, nosniff, DENY, Referrer-Policy, Permissions-Policy, CSP, `Server` yo'q; HTTP→HTTPS 308 |
| CSP | ✅ konsolda `Refused…` yo'q (kirish, panel, sotuv, katalog). `theme.js` tashqi fayl ishlaydi |
| Haqiqiy IP Caddy ortida | ✅ access log va Redis kaliti `rl:ip:block:192.168.65.1` (Caddy konteyneri IP'si emas) |
| IP cheklovi | ✅ 30 ta xato login → 30-chisi 429, so'ng to'g'ri parol ham 429 (`retry_after` 900) |
| `create-platform-owner` | ✅ vaqtinchalik parol; takror raqam → "allaqachon mavjud", exit 1 |
| Platforma egasi oqimi (brauzer) | ✅ vaqtinchalik parol → 2FA ulash (QR/kalit) → zaxira kodlar → parol almashtirish (`/auth/me/password` 204) → bizneslar paneli |
| Kirish, sotuv (brauzer) | ✅ ega kirdi, M101-03 dan 2 m naqd — "S-000009 yozildi — 170 000 so'm" |
| SSE Caddy orqali | ✅ `: connected` darhol; Redis `publish` → `data: new` ~100 ms da (buferlanmaydi) |
| Rasm yuklash (brauzer) | ✅ `POST /api/uploads/image` 201, `/api/media/...webp` 200, PATCH 204. Birinchi urinishda 500 — tiklangan media fayllari boshqa egada edi → `restore.sh` endi `chown 1000:1000` qiladi (tuzatildi, qayta sinaldi) |
| Excel | ✅ `GET /api/reports/sales/export?date_from&date_to` 200, `Content-Disposition: attachment; filename="savdo_…xlsx"`, to'g'ri MIME |
| PWA | ✅ manifest 200, `beforeinstallprompt` keldi ("Ilovani o'rnatish" tugmasi). Service worker lokalda ro'yxatdan o'tmadi — Caddy ichki CA sertifikatiga brauzer ishonmaydi (serverda Let's Encrypt bilan muammo yo'q) |
| `backup.sh` | ✅ `mato-2026-10-04.tar.age` (172K), `last-status: ok`; rclone bo'sh — jurnalda ogohlantirish |
| Zaxira xatosi | ✅ noto'g'ri `BACKUP_RCLONE_REMOTE` → `XATO: rclone (daily)`, `last-status: failed`, exit 1 (Telegram sozlanmagan — faqat jurnal) |
| `restore.sh` | ✅ bo'sh bazaga dev zaxirasi: 5 biznes, 11 foydalanuvchi, 14 sotuv, `alembic_version=0015`, media papkalari; keyin kirish ishladi |
| `seed_dev.py` prod'da | ✅ `APP_ENV=prod` bilan: "Bu skript faqat APP_ENV=dev da ishlaydi", exit 1 |
| Fon vazifalari (worker konteynerida) | ✅ `reconcile_stock` → 0 farq; `purge_expired_sessions`, `purge_read_notifications` ishladi; cron'lar ro'yxatda |
| `pytest` | ✅ 343 passed |
| `ruff check` | ✅ All checks passed |
| `tsc -b`, `eslint` | ✅ 0 xato |
| `vitest` | ✅ 33 fayl, 187 test |
| `npm run build` | ✅ 3001 modul, 2.9 s |
| `pip-audit` (venv ro'yxati) | ✅ No known vulnerabilities found |
| `npm audit --omit=dev` | ⚠️ 2 moderate: `react-router(-dom)` 6.30.6 — GHSA-wrjc-x8rr-h8h6 (ochiq yo'naltirish, `<Link>`/`useNavigate` da `\` bilan), GHSA-337j-9hxr-rhxg (SSR `deserializeErrors`, bizda SSR yo'q). Tuzatish faqat 7.x da — katta versiya, alohida ish. Bizda havolalar faqat o'z yo'llarimiz, foydalanuvchi kiritgan manzilga `navigate` yo'q |
| `npm audit` (dev bog'liqliklar) | ⚠️ vite/vitest/esbuild/tailwind zanjiri — faqat ishlab chiqish serveriga oid, prod tasvirga tushmaydi; tuzatish katta versiyalar (vite 8, vitest 5, tailwind 4) — alohida ish |
| Tezkor tekshiruvlar | ✅ `dangerouslySetInnerHTML` yo'q; git'da faqat `.env.example` va `.env.prod.example`; `.env.prod`, `.env.local-prod`, rclone.conf, kalitlar `.gitignore` da; `/api/health` faqat holat; `CORS_ORIGINS` namunada faqat prod domen |
| Jurnal gigienasi | ✅ sirlar faqat POST tanasida; query string'da token yo'q (SSE `Authorization` bilan); uvicorn access log'ida tana yo'q |

Topilgan va tuzatilgan: (1) prod compose dev `docker-compose.yml` bilan bir xil loyiha nomini olib, dev
konteynerlarini qayta yaratib yuborgan edi → `name: mato-prod`; (2) tiklangan media egaligi (yuqorida).
