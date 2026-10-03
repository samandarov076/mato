#!/usr/bin/env bash
# mato-savdo — lokal serverlarni bitta buyruq bilan boshqarish (terminal yopilsa ham ishlayveradi).
#
#   ./dev.sh start            backend, fon ishchisi, frontend — faqat shu kompyuterda (http://localhost)
#   ./dev.sh start --phone    + telefon uchun https (shu Wi-Fi'dan, keyingi portda)
#   ./dev.sh start --tunnel   + Cloudflare tunnel (telefon istalgan internetdan; manzil internetga ochiq!)
#   ./dev.sh stop             hammasini to'xtatish
#   ./dev.sh status           nima ishlayapti, manzillar
#   ./dev.sh logs <nom>       jurnal: backend | worker | frontend | phone | tunnel
#
# Jarayonlar nohup bilan ishga tushadi va `.dev/` papkasiga pid va jurnal yozadi. Ishlab turganda
# Mac uxlab qolmaydi (caffeinate) — aks holda serverlar to'xtab, tunnel uzilib qoladi.
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN="$ROOT/.dev"
mkdir -p "$RUN"

port() { grep -E "^$1=" "$ROOT/.env" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]'; }
BACKEND_PORT="$(port BACKEND_PORT)"; BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="$(port FRONTEND_PORT)"; FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PHONE_PORT=$((FRONTEND_PORT + 1))
SERVICES=(backend worker frontend phone tunnel awake)

alive() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }

launch() { # nom, papka, buyruq — `exec` bilan: pid aynan dasturning o'zi bo'ladi (to'xtatish oson)
  local name="$1" dir="$2" cmd="$3"
  if alive "$name"; then echo "  $name — allaqachon ishlayapti"; return; fi
  (
    cd "$dir" || exit 1
    nohup bash -c "exec $cmd" >"$RUN/$name.log" 2>&1 &
    echo $! >"$RUN/$name.pid"
  )
  echo "  $name — ishga tushdi"
}

lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null; }
tunnel_url() { grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$RUN/tunnel.log" 2>/dev/null | head -1; }

start() {
  local tunnel=0 phone=0 frontend_env=""
  for option in "$@"; do
    case "$option" in
      --tunnel) tunnel=1 ;;
      --phone) phone=1 ;;
    esac
  done
  # Tunnel bo'lsa — frontend trycloudflare domeniga ham javob beradi (vite.config.ts, MATO_TUNNEL)
  [ "$tunnel" = 1 ] && frontend_env="env MATO_TUNNEL=1 "
  echo "Ishga tushirilmoqda:"
  launch backend "$ROOT/backend" \
    ".venv/bin/uvicorn app.main:app --port $BACKEND_PORT --reload --reload-dir app"
  launch worker "$ROOT/backend" ".venv/bin/arq app.worker.WorkerSettings"
  launch frontend "$ROOT/frontend" "${frontend_env}./node_modules/.bin/vite"
  [ "$phone" = 1 ] && launch phone "$ROOT/frontend" "./node_modules/.bin/vite --mode phone"
  if [ "$tunnel" = 1 ]; then
    if command -v cloudflared >/dev/null; then
      launch tunnel "$ROOT" "cloudflared tunnel --no-autoupdate --url http://localhost:$FRONTEND_PORT"
    else
      echo "  tunnel — cloudflared o'rnatilmagan: brew install cloudflared"
    fi
  fi
  launch awake "$ROOT" "caffeinate -i"
  sleep 8
  status
}

stop() {
  echo "To'xtatilmoqda:"
  for name in "${SERVICES[@]}"; do
    if alive "$name"; then
      local pid; pid="$(cat "$RUN/$name.pid")"
      pkill -TERM -P "$pid" 2>/dev/null # bola jarayonlar (uvicorn reload ishchisi)
      kill -TERM "$pid" 2>/dev/null
      echo "  $name — to'xtatildi"
    fi
    rm -f "$RUN/$name.pid"
  done
}

status() {
  echo "Holat:"
  for name in "${SERVICES[@]}"; do
    if alive "$name"; then echo "  ✓ $name"; else echo "  · $name — ishlamayapti"; fi
  done
  echo "Manzillar:"
  echo "  Kompyuter:          http://localhost:$FRONTEND_PORT"
  local ip; ip="$(lan_ip)"
  alive phone && [ -n "$ip" ] && echo "  Telefon (Wi-Fi):    https://$ip:$PHONE_PORT   (ogohlantirishda — Davom etish)"
  local url; url="$(tunnel_url)"
  alive tunnel && [ -n "$url" ] && echo "  Telefon (tunnel):   $url   (internetga ochiq!)"
  return 0
}

case "${1:-}" in
  start) shift; start "$@" ;;
  stop) stop ;;
  restart) shift; stop; sleep 1; start "$@" ;;
  status) status ;;
  logs) tail -n 60 -f "$RUN/${2:-backend}.log" ;;
  *) sed -n '2,10p' "$0" ;;
esac
