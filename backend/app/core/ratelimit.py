"""Xato urinishlarni cheklash (parol va PIN'ni tanlab topishdan himoya).

Qoida: `window_seconds` ichida `max_failures` ta xato urinish → `block_seconds` ga to'xtatiladi.
Muvaffaqiyatli kirish hisoblagichni nolga tushiradi. Blok paytida to'g'ri parol/PIN ham qabul qilinmaydi.
"""
from dataclasses import dataclass

from app.core.redis import get_redis


@dataclass(frozen=True)
class Limit:
    name: str
    max_failures: int
    window_seconds: int
    block_seconds: int


# Telefon + parol: bitta raqamga 15 daqiqada 10 ta xato urinish → 15 daqiqa to'xtatiladi
LOGIN = Limit("login", max_failures=10, window_seconds=15 * 60, block_seconds=15 * 60)
# PIN: bitta qurilmada 5 ta xato → 5 daqiqa (docs/03-details/00-umumiy.md, "Chekka holatlar")
PIN = Limit("pin", max_failures=5, window_seconds=15 * 60, block_seconds=5 * 60)
# Ikki bosqichli tasdiqlash kodi (platforma egasi): 5 ta xato → 15 daqiqa
TWO_FACTOR = Limit("2fa", max_failures=5, window_seconds=15 * 60, block_seconds=15 * 60)


def _fails_key(limit: Limit, subject: str) -> str:
    return f"rl:{limit.name}:fails:{subject}"


def _block_key(limit: Limit, subject: str) -> str:
    return f"rl:{limit.name}:block:{subject}"


async def blocked_for(limit: Limit, subject: str) -> int:
    """Blok tugashiga necha soniya qolgani; bloklanmagan bo'lsa 0."""
    ttl = await get_redis().ttl(_block_key(limit, subject))
    return max(ttl, 0)


async def record_failure(limit: Limit, subject: str) -> bool:
    """Xato urinishni qayd etadi. Shu urinish bilan blok boshlangan bo'lsa True."""
    redis = get_redis()
    key = _fails_key(limit, subject)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, limit.window_seconds)
    if count < limit.max_failures:
        return False
    await redis.set(_block_key(limit, subject), 1, ex=limit.block_seconds)
    await redis.delete(key)
    return True


async def clear(limit: Limit, subject: str) -> None:
    await get_redis().delete(_fails_key(limit, subject))
