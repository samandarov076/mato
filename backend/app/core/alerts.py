"""Platforma egasiga texnik ogohlantirish (biznesga emas, tizimga oid): qoldiq solishtiruvida farq, zaxira xatosi.

Yo'l — Telegram, `PLATFORM_ALERT_CHAT_ID` suhbatiga (platforma egasi botga `/start` yuborib, o'z chat raqamini
.env ga yozadi — docs/07-ishga-tushirish.md, 3-bo'lim). Sozlanmagan bo'lsa — faqat jurnal (ERROR).
Zaxira skripti (deploy/backup/backup.sh) shu suhbatga `curl` bilan o'zi yozadi.
"""
import logging

from app.core.config import get_settings
from app.modules.telegram import bot

log = logging.getLogger(__name__)


async def alert_platform(text: str) -> None:
    """Matnni jurnalga (ERROR) va, sozlangan bo'lsa, platforma egasining Telegram'iga yuboradi."""
    log.error("Platforma ogohlantirishi: %s", text)
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.platform_alert_chat_id:
        return
    try:
        await bot.send(int(settings.platform_alert_chat_id), text)
    except Exception:
        log.exception("Platforma ogohlantirishi Telegram'ga yuborilmadi")
