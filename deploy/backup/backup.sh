#!/bin/bash
# Kunlik zaxira: baza (pg_dump -Fc) + rollar (pg_dumpall --roles-only) + media → bitta tar → age bilan shifr →
# /backups/daily (yakshanba — /backups/weekly ham) → rclone bilan tashqi omborga. Saqlash: 7 kun / 4 hafta.
# Muvaffaqiyatsiz bo'lsa: jurnal, /backups/last-status = failed, platforma egasiga Telegram.
# Qo'lda: docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup /backup.sh
set -uo pipefail

STAMP="$(date +%F)"
NAME="mato-$STAMP.tar.age"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"
STATUS=/backups/last-status
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { echo "$(date '+%F %T') $*"; }

alert() { # Telegram (sozlangan bo'lsa); xato bo'lsa jim
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${PLATFORM_ALERT_CHAT_ID:-}" ] || return 0
  curl -fsS -m 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$PLATFORM_ALERT_CHAT_ID" --data-urlencode text="$1" >/dev/null 2>&1 || true
}

fail() {
  log "XATO: $1"
  echo "failed $(date '+%F %T') $1" >"$STATUS"
  alert "⚠️ mato-savdo: zaxira olinmadi ($STAMP) — $1. Tekshiring: docker compose logs backup"
  exit 1
}

[ -n "${BACKUP_AGE_RECIPIENT:-}" ] || fail "BACKUP_AGE_RECIPIENT bo'sh (age ochiq kaliti kerak)"
mkdir -p /backups/daily /backups/weekly || fail "/backups yozilmaydi"
export PGPASSWORD="$POSTGRES_PASSWORD"

log "Boshlandi: $NAME"
pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$WORK/db.dump" || fail "pg_dump"
pg_dumpall -h db -U "$POSTGRES_USER" --roles-only -f "$WORK/roles.sql" || fail "pg_dumpall (rollar)"
if [ -d /data/media ]; then
  tar -C /data -cf "$WORK/media.tar" media || fail "media arxivi"
else
  tar -cf "$WORK/media.tar" --files-from /dev/null
fi
tar -C "$WORK" -cf - db.dump roles.sql media.tar | age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/$NAME" \
  || fail "shifrlash (age)"

cp "$WORK/$NAME" "/backups/daily/$NAME" || fail "daily ga nusxalash"
[ "$(date +%u)" = 7 ] && { cp "$WORK/$NAME" "/backups/weekly/$NAME" || fail "weekly ga nusxalash"; }

# Eski nusxalar (lokal)
find /backups/daily -name 'mato-*.tar.age' -mtime +"$((KEEP_DAILY - 1))" -delete
find /backups/weekly -name 'mato-*.tar.age' -mtime +"$((KEEP_WEEKLY * 7 - 1))" -delete

# Tashqi ombor
if [ -n "$REMOTE" ]; then
  RC=(rclone --config /conf/rclone.conf --quiet)
  "${RC[@]}" copy /backups/daily "$REMOTE/daily" --include 'mato-*.tar.age' || fail "rclone (daily)"
  "${RC[@]}" copy /backups/weekly "$REMOTE/weekly" --include 'mato-*.tar.age' || fail "rclone (weekly)"
  "${RC[@]}" delete "$REMOTE/daily" --min-age "${KEEP_DAILY}d" || true
  "${RC[@]}" delete "$REMOTE/weekly" --min-age "$((KEEP_WEEKLY * 7))d" || true
else
  log "OGOHLANTIRISH: BACKUP_RCLONE_REMOTE bo'sh — nusxa faqat shu serverda (talab: serverdan tashqarida)"
fi

SIZE="$(du -h "/backups/daily/$NAME" | cut -f1)"
echo "ok $(date '+%F %T') $NAME $SIZE" >"$STATUS"
log "Tayyor: $NAME ($SIZE)"
