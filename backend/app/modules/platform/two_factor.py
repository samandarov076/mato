"""Platforma egasining ikki bosqichli kirishi: parol + tasdiqlash ilovasidagi kod (TOTP).

Ixtiyoriy (`PLATFORM_2FA_REQUIRED=false`, standart): ilova ulanmagan bo'lsa — faqat parol bilan kiriladi;
profil sahifasida o'zi yoqadi yoki o'chiradi. Majburiy (`true`) bo'lsa — ulanmagan egadan birinchi kirishda
ulash talab qilinadi.

Kirish oqimi:
1. `POST /auth/login` ilova ulangan bo'lsa sessiya emas, qisqa muddatli "challenge" token beradi.
2. Ulash majburiy va hali ulanmagan: `setup` (maxfiy kalit, QR) → `confirm` (birinchi kod) →
   10 ta bir martalik zaxira kod beriladi va sessiya ochiladi.
3. Ulangan bo'lsa: `verify` — ilovadagi kod yoki zaxira kod (telefon yo'qolgan bo'lsa).

Profildan (kirgan holda): `status` → `profile_setup` → `profile_enable` (zaxira kodlar) / `profile_disable`.
"""
import pyotp
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.db import system_session
from app.core.errors import AppError
from app.core.redis import get_redis
from app.core.security import (
    decode_challenge_token,
    hash_token,
    new_recovery_codes,
    normalize_recovery_code,
)
from app.core.vault import seal, unseal
from app.modules.auth.models import RecoveryCode, User
from app.modules.auth.service import Issued, issue_platform_session, now_utc

_ISSUER = "mato-savdo"
_SETUP_TTL = 10 * 60  # ulash boshlanganidan keyin kalit shuncha soniya kutadi


def _setup_key(user_id: int) -> str:
    return f"2fa:setup:{user_id}"


async def _challenged_user(db: AsyncSession, challenge_token: str) -> User:
    user_id = decode_challenge_token(challenge_token)
    user = await db.get(User, user_id) if user_id is not None else None
    if user is None or user.role != "platform_owner" or not user.is_active:
        raise AppError(401, "challenge_expired")  # parolni qaytadan kiritish kerak
    return user


def _totp_ok(secret: str, code: str) -> bool:
    # valid_window=1: telefon soati ±30 soniya farq qilsa ham qabul qilinadi
    return code.isdigit() and len(code) == 6 and pyotp.TOTP(secret).verify(code, valid_window=1)


async def _reject_if_blocked(user_id: int) -> None:
    wait = await ratelimit.blocked_for(ratelimit.TWO_FACTOR, str(user_id))
    if wait:
        raise AppError(429, "too_many_attempts", retry_after=wait)


async def _wrong_code(user_id: int) -> AppError:
    if await ratelimit.record_failure(ratelimit.TWO_FACTOR, str(user_id)):
        return AppError(429, "too_many_attempts", retry_after=ratelimit.TWO_FACTOR.block_seconds)
    return AppError(401, "invalid_code")


async def _new_setup(user: User) -> tuple[str, str]:
    """Yangi maxfiy kalit (Redis'da, tasdiqlanguncha). (kalit, QR uchun otpauth manzili) qaytaradi."""
    if user.totp_secret is not None:
        raise AppError(409, "two_factor_already_set")
    # Kalit birinchi kod bilan tasdiqlanmaguncha bazaga yozilmaydi. Sahifa qayta so'rasa ham
    # (yangilash, ikki marta bosish) o'sha kalit qaytadi — skanerlangan QR eskirib qolmaydi.
    redis = get_redis()
    await redis.set(_setup_key(user.id), pyotp.random_base32(), ex=_SETUP_TTL, nx=True)
    secret = await redis.get(_setup_key(user.id))
    return secret, pyotp.TOTP(secret).provisioning_uri(name=user.phone, issuer_name=_ISSUER)


async def _finish_setup(db: AsyncSession, user: User, code: str) -> list[str]:
    """Birinchi kodni tekshiradi va ilovani yoqadi. 10 ta zaxira kod qaytaradi (faqat bir marta)."""
    if user.totp_secret is not None:
        raise AppError(409, "two_factor_already_set")
    await _reject_if_blocked(user.id)
    secret = await get_redis().get(_setup_key(user.id))
    if secret is None:
        raise AppError(400, "setup_expired")
    if not _totp_ok(secret, code.strip()):
        # Xato urinish Redis'da hisoblanadi — bazada o'zgarish yo'q, orqaga qaytarish zarar qilmaydi
        raise await _wrong_code(user.id)
    user.totp_secret = seal(secret)  # bazada shifrlangan (CREDENTIALS_KEY), 14-migratsiya
    codes = new_recovery_codes()
    db.add_all(
        RecoveryCode(user_id=user.id, code_hash=hash_token(normalize_recovery_code(c))) for c in codes
    )
    await get_redis().delete(_setup_key(user.id))
    await ratelimit.clear(ratelimit.TWO_FACTOR, str(user.id))
    return codes


async def _code_accepted(db: AsyncSession, user: User, code: str) -> bool:
    """Ilovadagi kod yoki ishlatilmagan zaxira kod (zaxira kod shu bilan ishlatilgan bo'ladi)."""
    code = code.strip()
    # Kalit mos kelmasa (CREDENTIALS_KEY almashgan) — unseal None: faqat zaxira kod bilan kiriladi
    secret = unseal(user.totp_secret)
    if secret and _totp_ok(secret, code):
        return True
    # Zaxira kod: har biri faqat bir marta ishlaydi
    recovery = await db.scalar(
        select(RecoveryCode)
        .where(
            RecoveryCode.user_id == user.id,
            RecoveryCode.code_hash == hash_token(normalize_recovery_code(code)),
            RecoveryCode.used_at.is_(None),
        )
        .with_for_update()
    )
    if recovery is None:
        return False
    recovery.used_at = now_utc()
    return True


# ---------- Kirish oqimi (challenge token bilan) ----------


async def begin_setup(challenge_token: str) -> tuple[str, str]:
    """Yangi maxfiy kalit yaratadi. (kalit, QR uchun otpauth manzili) qaytaradi."""
    async with system_session() as db:
        user = await _challenged_user(db, challenge_token)
        return await _new_setup(user)


async def confirm_setup(challenge_token: str, code: str) -> tuple[Issued, list[str]]:
    """Birinchi kodni tekshirib, ikki bosqichli tasdiqlashni yoqadi. (sessiya, zaxira kodlar) qaytaradi."""
    async with system_session() as db:
        user = await _challenged_user(db, challenge_token)
        codes = await _finish_setup(db, user, code)
        issued = await issue_platform_session(db, user)
    return issued, codes


async def verify(challenge_token: str, code: str) -> Issued:
    """Ilovadagi 6 xonali kod yoki bir martalik zaxira kod bilan kirish."""
    error: AppError | None = None
    async with system_session() as db:
        user = await _challenged_user(db, challenge_token)
        if user.totp_secret is None:
            raise AppError(409, "two_factor_setup_required")
        await _reject_if_blocked(user.id)
        if await _code_accepted(db, user, code):
            await ratelimit.clear(ratelimit.TWO_FACTOR, str(user.id))
            issued = await issue_platform_session(db, user)
        else:
            error = await _wrong_code(user.id)
    if error is not None:
        raise error
    return issued


# ---------- Profil (kirgan platforma egasi; db — so'rov sessiyasi, oxirida o'zi saqlanadi) ----------


async def status(db: AsyncSession, user: User) -> tuple[bool, int]:
    """(ilova ulanganmi, ishlatilmagan zaxira kodlar soni)."""
    left = await db.scalar(
        select(func.count())
        .select_from(RecoveryCode)
        .where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
    )
    return user.totp_secret is not None, left or 0


async def profile_setup(user: User) -> tuple[str, str]:
    return await _new_setup(user)


async def profile_enable(db: AsyncSession, user: User, code: str) -> list[str]:
    return await _finish_setup(db, user, code)


async def profile_disable(db: AsyncSession, user: User, code: str) -> None:
    """O'chirish uchun hozirgi kod (yoki zaxira kod) kerak — sessiyani o'g'irlagan odam o'chira olmasin."""
    if user.totp_secret is None:
        raise AppError(409, "two_factor_not_set")
    await _reject_if_blocked(user.id)
    if not await _code_accepted(db, user, code):
        raise await _wrong_code(user.id)
    user.totp_secret = None
    await db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    await ratelimit.clear(ratelimit.TWO_FACTOR, str(user.id))
