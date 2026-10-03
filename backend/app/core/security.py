"""Parol va tokenlar bilan ishlash."""
import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings

settings = get_settings()

_ALGORITHM = "HS256"


def _prepare(password: str) -> bytes:
    # bcrypt 72 baytdan uzun parolni qabul qilmaydi — avval SHA-256 (istalgan uzunlik va alifbo ishlaydi)
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.password_hash_rounds)
    return bcrypt.hashpw(_prepare(password), salt).decode()


# Foydalanuvchi topilmaganda ham bir xil vaqt sarflash uchun (telefon bor-yo'qligi vaqtdan bilinmasin)
_DUMMY_HASH = hash_password("mavjud-bo'lmagan-foydalanuvchi")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        bcrypt.checkpw(_prepare(password), _DUMMY_HASH.encode())
        return False
    return bcrypt.checkpw(_prepare(password), password_hash.encode())


def create_access_token(*, user_id: int, session_id: int, business_id: int | None, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sid": session_id,
        "bid": business_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None


def hash_token(token: str) -> str:
    """Uzun tasodifiy tokenlar uchun (refresh, qurilma) — bazada faqat xesh saqlanadi."""
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> tuple[str, str]:
    """(token, xesh) — token faqat foydalanuvchi brauzerida (cookie), xesh bazada."""
    token = secrets.token_urlsafe(48)
    return token, hash_token(token)


def pin_lookup(business_id: int, pin: str) -> str:
    """PIN'ning bazada saqlanadigan ko'rinishi: HMAC(SECRET_KEY, biznes + PIN).

    Bir xil PIN doim bir xil qiymat beradi — sotuvchini PIN bo'yicha topish va PIN noyobligini
    tekshirish uchun shu kerak. Biznes id qo'shilgani uchun turli bizneslarda natija har xil.
    """
    message = f"pin:{business_id}:{pin}".encode()
    return hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()


# ---------- Ikki bosqichli tasdiqlash (platforma egasi) ----------

_CHALLENGE_MINUTES = 10
# Chalkashtiradigan belgilarsiz (0/o, 1/l/i) — parolni telefonda aytib yoki yozib berish oson
_READABLE = "abcdefghjkmnpqrstuvwxyz23456789"


def create_challenge_token(user_id: int) -> str:
    """Parol to'g'ri kiritilgach beriladi; faqat ikkinchi bosqichni (kodni) o'tish uchun yaraydi."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "purpose": "2fa",
        "exp": now + timedelta(minutes=_CHALLENGE_MINUTES),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def decode_challenge_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return int(payload["sub"]) if payload.get("purpose") == "2fa" else None


def new_temp_password() -> str:
    """Vaqtinchalik parol — birinchi kirishda almashtiriladi."""
    return "".join(secrets.choice(_READABLE) for _ in range(10))


def new_recovery_codes(count: int = 10) -> list[str]:
    """Bir martalik zaxira kodlar (telefon yo'qolsa kirish uchun): 'abcd-efgh' ko'rinishida."""

    def part() -> str:
        return "".join(secrets.choice(_READABLE) for _ in range(4))

    return [f"{part()}-{part()}" for _ in range(count)]


def normalize_recovery_code(code: str) -> str:
    return code.strip().lower().replace("-", "").replace(" ", "")
