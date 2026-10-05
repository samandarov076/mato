#!/bin/bash
# Zaxiradan TO'LIQ tiklash: baza (o'chirib qayta yaratiladi!) + rollar + media.
#   docker compose -f docker-compose.prod.yml --env-file .env.prod stop backend worker
#   docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm restore \
#       /backups/daily/mato-2026-10-04.tar.age /keys/mato-backup-key.txt
#   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
# Yopiq kalit (age) faqat tiklash paytida serverga qo'yiladi (deploy/backup/keys/), keyin o'chiriladi.
set -euo pipefail

ARCHIVE="${1:-}"
KEY="${2:-}"
[ -f "$ARCHIVE" ] || { echo "Arxiv topilmadi: $ARCHIVE"; exit 1; }
[ -f "$KEY" ] || { echo "Yopiq kalit fayli topilmadi: $KEY"; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql -h db -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q)

echo "1/5 Shifr ochilmoqda: $ARCHIVE"
age -d -i "$KEY" "$ARCHIVE" | tar -C "$WORK" -xf -
[ -f "$WORK/db.dump" ] && [ -f "$WORK/roles.sql" ] && [ -f "$WORK/media.tar" ] || { echo "Arxiv to'liq emas"; exit 1; }

echo "2/5 Rollar (mavjudlari o'tkazib yuboriladi)"
# roles.sql da superuser (POSTGRES_USER) ham bor — u allaqachon mavjud, xatolar zararsiz
psql -h db -U "$POSTGRES_USER" -d postgres -q -f "$WORK/roles.sql" >/dev/null 2>&1 || true

echo "3/5 Baza qayta yaratilmoqda: $POSTGRES_DB (ochiq ulanishlar uziladi)"
"${PSQL[@]}" -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)"
"${PSQL[@]}" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""

echo "4/5 Baza tiklanmoqda"
pg_restore -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --single-transaction "$WORK/db.dump"

echo "5/5 Media tiklanmoqda"
mkdir -p /data/media
find /data/media -mindepth 1 -delete
tar -C /data -xf "$WORK/media.tar"
# Backend root bo'lmagan `app` (uid 1000) bilan ishlaydi — fayllar unga tegishli bo'lsin, aks holda yangi rasm yozilmaydi
chown -R 1000:1000 /data/media

echo "Tayyor. Endi: docker compose ... up -d  (backend va worker qayta ishga tushadi)"
