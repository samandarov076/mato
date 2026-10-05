"""Xato urinishlarni cheklash (parol va PIN'ni tanlab topishdan himoya).

Qoida: `window_seconds` ichida `max_failures` ta xato urinish → `block_seconds` ga to'xtatiladi.
Muvaffaqiyatli kirish hisoblagichni nolga tushiradi. Blok paytida to'g'ri parol/PIN ham qabul qilinmaydi.
"""
from dataclasses import dataclass

from fastapi import Request

from app.core.errors import AppError
from app.core.redis import get_redis

DAY = 24 * 3600


@dataclass(frozen=True)
class Limit:
    name: str
    max_failures: int
    window_seconds: int
    block_seconds: int
    # Takroriy bloklar muddati: ikkinchi blok, uchinchi va keyingilari ... (bo'sh — muddat o'smaydi).
    # Oxirgi blok tugaganidan keyin `strike_seconds` tinch o'tsa, hisob qaytadan boshlanadi.
    escalation: tuple[int, ...] = ()
    strike_seconds: int = DAY


# Telefon + parol: bitta raqamga 15 daqiqada 10 ta xato urinish → 15 daqiqa to'xtatiladi
LOGIN = Limit("login", max_failures=10, window_seconds=15 * 60, block_seconds=15 * 60)
# PIN: bitta qurilmada 5 ta xato → 5 daqiqa (docs/03-details/00-umumiy.md, "Chekka holatlar")
PIN = Limit("pin", max_failures=5, window_seconds=15 * 60, block_seconds=5 * 60)
# PIN: bitta do'konning barcha qurilmalari bo'yicha 20 ta xato → do'kon bloki. Do'kon logini bilan yangi
# qurilma ochib, har birida 5 tadan PIN sinash yo'li shu bilan yopiladi. Blok takrorlansa muddat o'sadi:
# 15 daqiqa → 1 soat → 24 soat (docs/03-details/02-tuzilma.md) — sutkasiga ~1900 emas, ko'pi bilan 60 urinish
PIN_STORE = Limit(
    "pin-store",
    max_failures=20,
    window_seconds=15 * 60,
    block_seconds=15 * 60,
    escalation=(60 * 60, DAY),
)
# Ikki bosqichli tasdiqlash kodi (platforma egasi): 5 ta xato → 15 daqiqa
TWO_FACTOR = Limit("2fa", max_failures=5, window_seconds=15 * 60, block_seconds=15 * 60)
# IP bo'yicha (raqam/qurilma hisobidan tashqari): login, do'kon logini va PIN bo'yicha jami 30 ta xato →
# 15 daqiqa. Raqamni ataylab bloklab qo'yish mumkin edi — endi buzg'unchining o'z manzili ham to'xtaydi.
# Muvaffaqiyatli kirish bu hisobni nolga tushirmaydi (docs/07-ishga-tushirish.md, 6.4).
IP = Limit("ip", max_failures=30, window_seconds=15 * 60, block_seconds=15 * 60)


def client_ip(request: Request) -> str | None:
    """So'rov kelgan manzil. Caddy ortida uvicorn `--proxy-headers` bilan X-Forwarded-For'ni shu yerga qo'yadi."""
    return request.client.host if request.client else None


async def reject_if_ip_blocked(ip: str | None) -> None:
    """IP vaqtincha to'xtatilgan bo'lsa — 429 (kirish yo'llari boshida chaqiriladi)."""
    if ip and (wait := await blocked_for(IP, ip)):
        raise AppError(429, "too_many_attempts", retry_after=wait)


async def record_ip_failure(ip: str | None) -> int:
    """Xato kirishni IP hisobiga yozadi; shu urinish bilan blok boshlangan bo'lsa — blok muddati."""
    return await record_failure(IP, ip) if ip else 0


def _fails_key(limit: Limit, subject: str) -> str:
    return f"rl:{limit.name}:fails:{subject}"


def _block_key(limit: Limit, subject: str) -> str:
    return f"rl:{limit.name}:block:{subject}"


async def blocked_for(limit: Limit, subject: str) -> int:
    """Blok tugashiga necha soniya qolgani; bloklanmagan bo'lsa 0."""
    ttl = await get_redis().ttl(_block_key(limit, subject))
    return max(ttl, 0)


async def record_failure(limit: Limit, subject: str) -> int:
    """Xato urinishni qayd etadi. Shu urinish bilan blok boshlangan bo'lsa — blok muddati (soniya), aks holda 0."""
    redis = get_redis()
    key = _fails_key(limit, subject)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, limit.window_seconds)
    if count < limit.max_failures:
        return 0
    seconds = limit.block_seconds
    if limit.escalation:
        # Nechanchi blok ekani eslab qolinadi; muvaffaqiyatli kirish buni nolga tushirmaydi
        strikes_key = f"rl:{limit.name}:strikes:{subject}"
        strikes = await redis.incr(strikes_key)
        steps = (limit.block_seconds, *limit.escalation)
        seconds = steps[min(strikes, len(steps)) - 1]
        await redis.expire(strikes_key, seconds + limit.strike_seconds)
    await redis.set(_block_key(limit, subject), 1, ex=seconds)
    await redis.delete(key)
    return seconds


async def clear(limit: Limit, subject: str) -> None:
    await get_redis().delete(_fails_key(limit, subject))
