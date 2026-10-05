#!/usr/bin/env bash
# mato-savdo — serverda yangilash: git pull → build → migratsiya → qayta ishga tushirish → health.
#   ./deploy.sh              # oddiy yangilash
#   ./deploy.sh --no-pull    # git'ga tegmasdan (lokal mashq yoki qo'lda olingan kod)
# Migratsiya xato bersa skript to'xtaydi: eski konteynerlar ishlayveradi, baza oldingi holatda qoladi
# (Alembic har migratsiyani tranzaksiyada bajaradi). Tafsilot: docs/07-ishga-tushirish.md, 4-bo'lim.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="${ENV_FILE:-.env.prod}"
[ -f "$ENV_FILE" ] || { echo "Sozlamalar fayli yo'q: $ENV_FILE (cp .env.prod.example .env.prod)"; exit 1; }
compose() { docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }

if [ "${1:-}" != "--no-pull" ]; then
  echo "== 1/5 Kod"
  git pull --ff-only
fi

echo "== 2/5 Tasvirlar"
compose build --pull

echo "== 3/5 Baza va migratsiya"
compose up -d db redis
compose run --rm --no-deps backend alembic upgrade head

echo "== 4/5 Qayta ishga tushirish"
compose up -d --remove-orphans

echo "== 5/5 Tekshiruv"
for _ in $(seq 1 30); do
  if compose exec -T backend python -c \
      "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" 2>/dev/null; then
    compose ps
    echo "Tayyor: /api/health ok"
    exit 0
  fi
  sleep 2
done
echo "XATO: backend 60 soniyada javob bermadi — docker compose -f docker-compose.prod.yml --env-file $ENV_FILE logs backend"
exit 1
