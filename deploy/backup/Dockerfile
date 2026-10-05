# Zaxira konteyneri: cron (03:00) → pg_dump + media → age (shifr) → rclone (tashqi ombor).
# Skriptlar: backup.sh (cron), restore.sh (qo'lda, `docker compose run --rm restore ...`).
FROM alpine:3.20
RUN apk add --no-cache bash postgresql16-client age rclone curl tar tzdata coreutils findutils
COPY backup.sh restore.sh /
COPY crontab /etc/crontabs/root
RUN chmod +x /backup.sh /restore.sh && mkdir -p /backups
# crond oldingi planda; `-l 8` — faqat xatolar jurnalga
CMD ["crond", "-f", "-l", "8"]
