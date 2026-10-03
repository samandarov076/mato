"""Fon navbati (Redis — arq): so'rov ichidan vazifa qo'yish. Vazifani `app/worker.py` dagi ishchi bajaradi.

Sekin yoki tashqi xizmatga bog'liq ishlar (Telegram xabari) shu orqali yuboriladi — foydalanuvchi so'rovi
ularni kutib qolmaydi; xizmat vaqtincha ishlamasa, ishchi keyinroq qayta urinadi.
"""
import logging
from typing import Any

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings

log = logging.getLogger(__name__)

_pool: ArqRedis | None = None


async def enqueue(function: str, *args: Any) -> None:
    """Vazifani navbatga qo'yadi. Navbat ishlamasa — so'rov buzilmaydi (xato jurnalga yoziladi)."""
    global _pool
    try:
        if _pool is None:
            _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        await _pool.enqueue_job(function, *args)
    except Exception:
        log.exception("Fon vazifasi navbatga qo'yilmadi: %s", function)


async def close_queue() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
