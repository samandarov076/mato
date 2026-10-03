"""Platforma egasining ikki bosqichli kirishi: parol + tasdiqlash ilovasidagi kod (TOTP).

1. `POST /auth/login` parol to'g'ri bo'lsa sessiya emas, qisqa muddatli "challenge" token beradi.
2. Ilova hali ulanmagan bo'lsa: `setup` (maxfiy kalit, QR) → `confirm` (birinchi kod) →
   10 ta bir martalik zaxira kod beriladi va sessiya ochiladi.
3. Keyingi kirishlarda: `verify` — ilovadagi kod yoki zaxira kod (telefon yo'qolgan bo'lsa).
"""
import pyotp
from sqlalchemy import select
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


async def begin_setup(challenge_token: str) -> tuple[str, str]:
    """Yangi maxfiy kalit yaratadi. (kalit, QR uchun otpauth manzili) qaytaradi."""
    async with system_session() as db:
        user = await _challenged_user(db, challenge_token)
        if user.totp_secret is not None:
            raise AppError(409, "two_factor_already_set")
        phone = user.phone
    # Kalit birinchi kod bilan tasdiqlanmaguncha bazaga yozilmaydi. Sahifa qayta so'rasa ham
    # (yangilash, ikki marta bosish) o'sha kalit qaytadi — skanerlangan QR eskirib qolmaydi.
    redis = get_redis()
    await redis.set(_setup_key(user.id), pyotp.random_base32(), ex=_SETUP_TTL, nx=True)
    secret = await redis.get(_setup_key(user.id))
    return secret, pyotp.TOTP(secret).provisioning_uri(name=phone, issuer_name=_ISSUER)


async def confirm_setup(challenge_token: str, code: str) -> tuple[Issued, list[str]]:
    """Birinchi kodni tekshirib, ikki bosqichli tasdiqlashni yoqadi. (sessiya, zaxira kodlar) qaytaradi."""
    error: AppError | None = None
    async with system_session() as db:
        user = await _challenged_user(db, challenge_token)
        if user.totp_secret is not None:
            raise AppError(409, "two_factor_already_set")
        await _reject_if_blocked(user.id)
        secret = await get_redis().get(_setup_key(user.id))
        if secret is None:
            raise AppError(400, "setup_expired")
        if not _totp_ok(secret, code.strip()):
            error = await _wrong_code(user.id)
        else:
            user.totp_secret = secret
            codes = new_recovery_codes()
            db.add_all(
                RecoveryCode(user_id=user.id, code_hash=hash_token(normalize_recovery_code(c)))
                for c in codes
            )
            issued = await issue_platform_session(db, user)
            await get_redis().delete(_setup_key(user.id))
            await ratelimit.clear(ratelimit.TWO_FACTOR, str(user.id))
    if error is not None:
        raise error
    return issued, codes


async def verify(challenge_token: str, code: str) -> Issued:
    """Ilovadagi 6 xonali kod yoki bir martalik zaxira kod bilan kirish."""
    error: AppError | None = None
    async with system_session() as db:
        user = await _challenged_user(db, challenge_token)
        if user.totp_secret is None:
            raise AppError(409, "two_factor_setup_required")
        await _reject_if_blocked(user.id)

        code = code.strip()
        accepted = _totp_ok(user.totp_secret, code)
        if not accepted:
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
            if recovery is not None:
                recovery.used_at = now_utc()
                accepted = True

        if accepted:
            await ratelimit.clear(ratelimit.TWO_FACTOR, str(user.id))
            issued = await issue_platform_session(db, user)
        else:
            error = await _wrong_code(user.id)
    if error is not None:
        raise error
    return issued
