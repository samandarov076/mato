"""Kirish mantiqi: telefon + parol, sessiyalar, parolni almashtirish.

Kirish va sessiyani yangilashda biznes hali noma'lum — shuning uchun `system_session`
(RLS'dan tashqari). Qolgan hamma joyda so'rov o'z biznesi ichida (`tenant_session`) ishlaydi.

Xato tranzaksiya yopilgandan KEYIN ko'tariladi — muvaffaqiyatsiz urinish jurnalda qolishi uchun.
"""
import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.audit import log_event
from app.core.config import get_settings
from app.core.db import system_session
from app.core.errors import AppError
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_challenge_token,
    hash_password,
    hash_token,
    new_token,
    verify_password,
)
from app.core.vault import seal, unseal
from app.modules.auth.models import Device, User, UserSession
from app.modules.auth.schemas import normalize_phone
from app.modules.platform.models import Business
from app.modules.structure.models import Location

settings = get_settings()


@dataclass
class Issued:
    """Kirish yoki yangilash natijasi."""

    user: User
    business: Business | None  # platforma egasida None
    access_token: str
    refresh_token: str
    refresh_max_age: int  # cookie necha soniya yashaydi
    store: Location | None = None  # do'kon qurilmasidagi sessiyada — qaysi do'kon


@dataclass
class TwoFactorChallenge:
    """Platforma egasi parolni to'g'ri kiritdi — endi ikkinchi bosqich (kod) kerak."""

    token: str
    setup_required: bool  # tasdiqlash ilovasi hali ulanmagan — avval ulash kerak


def now_utc() -> datetime:
    return datetime.now(UTC)


_now = now_utc


def _personal_lifetime() -> timedelta:
    return timedelta(days=settings.refresh_token_days)


# Platforma egasining sessiyasi qisqa: 12 soat harakatsizlikdan keyin qayta kirish (parol + kod)
PLATFORM_LIFETIME = timedelta(hours=12)


async def issue_platform_session(db: AsyncSession, user: User) -> Issued:
    """Ikkinchi bosqich o'tilgach platforma egasiga sessiya ochadi."""
    refresh_token, refresh_hash = new_token()
    row = UserSession(
        business_id=None,
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        expires_at=_now() + PLATFORM_LIFETIME,
    )
    db.add(row)
    await db.flush()
    return Issued(
        user=user,
        business=None,
        access_token=_access_token(user, row.id),
        refresh_token=refresh_token,
        refresh_max_age=int(PLATFORM_LIFETIME.total_seconds()),
    )


def device_idle_limit(business: Business) -> timedelta:
    """Do'kon qurilmasidagi sessiya shuncha vaqt harakatsiz tursa, server uni tugatadi.

    Aniq avto-qulflash (autolock_minutes) interfeysda; bu — brauzer yopilib qolgan holat uchun yuqori chegara.
    """
    return timedelta(minutes=business.autolock_minutes + settings.access_token_minutes)


def _access_token(user: User, session_id: int) -> str:
    return create_access_token(
        user_id=user.id, session_id=session_id, business_id=user.business_id, role=user.role
    )


async def login(phone: str, password: str) -> Issued | TwoFactorChallenge:
    normalized = normalize_phone(phone)
    # Cheklov raqam bo'yicha: bitta raqamga 15 daqiqada 10 ta xato → vaqtincha to'xtatiladi
    subject = normalized or phone.strip()
    wait = await ratelimit.blocked_for(ratelimit.LOGIN, subject)
    if wait:
        raise AppError(429, "too_many_attempts", retry_after=wait)

    issued: Issued | TwoFactorChallenge | None = None
    error: AppError | None = None

    async with system_session() as db:
        user = await db.scalar(select(User).where(User.phone == normalized)) if normalized else None
        # bcrypt ataylab sekin — alohida oqimda, boshqa so'rovlar kutib qolmasligi uchun
        password_ok = await asyncio.to_thread(
            verify_password, password, user.password_hash if user else None
        )

        # Parol "ko'rsatish" imkoniyati qo'shilishidan oldin o'rnatilgan bo'lsa — birinchi to'g'ri kirishda
        # saqlab olinadi (platforma egasiniki saqlanmaydi)
        if user and password_ok and user.business_id is not None and user.password_enc is None:
            user.password_enc = seal(password)

        if user is None or not password_ok:
            locked = await ratelimit.record_failure(ratelimit.LOGIN, subject)
            if user is not None and user.business_id is not None:
                log_event(
                    db,
                    business_id=user.business_id,
                    user_id=user.id,
                    category="login",
                    event_code="login.locked" if locked else "login.failed",
                )
            if locked:
                error = AppError(
                    429, "too_many_attempts", retry_after=ratelimit.LOGIN.block_seconds
                )
            else:
                # Telefonmi yoki parol xato — aytilmaydi
                error = AppError(401, "invalid_credentials")
        elif not user.is_active:
            error = AppError(403, "account_inactive")
        elif user.business_id is None:
            await ratelimit.clear(ratelimit.LOGIN, subject)
            if user.totp_secret is None and not settings.platform_2fa_required:
                # Platforma egasi tasdiqlash ilovasini ulamagan va u majburiy emas — parol yetarli
                issued = await issue_platform_session(db, user)
            else:
                # Ilova ulangan (yoki ulash majburiy) — sessiya faqat ikkinchi bosqichdan keyin ochiladi
                issued = TwoFactorChallenge(
                    token=create_challenge_token(user.id), setup_required=user.totp_secret is None
                )
        else:
            business = await db.get(Business, user.business_id)
            if business.status != "active":
                error = AppError(403, "business_blocked")
            else:
                await ratelimit.clear(ratelimit.LOGIN, subject)
                lifetime = _personal_lifetime()
                refresh_token, refresh_hash = new_token()
                row = UserSession(
                    business_id=user.business_id,
                    user_id=user.id,
                    refresh_token_hash=refresh_hash,
                    expires_at=_now() + lifetime,
                )
                db.add(row)
                await db.flush()
                business.last_activity_at = _now()
                log_event(
                    db,
                    business_id=user.business_id,
                    user_id=user.id,
                    category="login",
                    event_code="login.success",
                )
                issued = Issued(
                    user=user,
                    business=business,
                    access_token=_access_token(user, row.id),
                    refresh_token=refresh_token,
                    refresh_max_age=int(lifetime.total_seconds()),
                )

    if error is not None:
        raise error
    return issued


# Almashtirilgan (eski) uzoq muddatli token shuncha soniya davomida o'rnidagi yangisiga yo'llaydi —
# bir vaqtda yangilayotgan boshqa oynalar va yo'lda yo'qolgan javoblar uchun
ROTATION_GRACE_SECONDS = 60


def _successor_key(refresh_token: str) -> str:
    return f"rt:next:{hash_token(refresh_token)}"


def _live_session(refresh_token: str) -> Select:
    return (
        select(UserSession)
        .where(
            UserSession.refresh_token_hash == hash_token(refresh_token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > _now(),
        )
        .with_for_update()
    )


async def refresh(refresh_token: str | None) -> Issued:
    """Yangi qisqa muddatli token beradi va uzoq muddatli tokenni almashtiradi. Xodim faolsizlantirilgan,
    biznes bloklangan yoki qurilma uzilgan bo'lsa — rad etadi."""
    if not refresh_token:
        raise AppError(401, "session_expired")
    issued: Issued | None = None

    async with system_session() as db:
        # Qator qulflanadi: bir nechta oyna bir vaqtda yangilasa, biri almashtirguncha qolganlari kutadi
        row = await db.scalar(_live_session(refresh_token))
        rotate = row is not None
        if row is None:
            # Token hozirgina boshqa oyna tomonidan almashtirilgan bo'lishi mumkin — o'sha yangi token beriladi
            # (hamma oynalar bitta cookie'ni bo'lishadi: har xil token berilsa, biri sessiyani uzib qo'yardi)
            successor = unseal(await get_redis().get(_successor_key(refresh_token)))
            if successor is not None:
                refresh_token = successor
                row = await db.scalar(_live_session(successor))
        if row is not None:
            user = await db.get(User, row.user_id)
            business = await db.get(Business, row.business_id) if row.business_id else None
            device = await db.get(Device, row.device_id) if row.device_id else None
            store = await db.get(Location, device.store_id) if device else None
            alive = (
                user.is_active
                # biznessiz sessiya faqat platforma egasida bo'ladi
                and (business.status == "active" if business else user.role == "platform_owner")
                and (device is None or (device.revoked_at is None and store.is_active))
            )
            if not alive:
                row.revoked_at = _now()
            else:
                now = _now()
                if business is None:
                    lifetime = PLATFORM_LIFETIME
                elif device is None:
                    lifetime = _personal_lifetime()
                else:
                    # Do'kon qurilmasida sessiya qisqa: harakatsiz qolsa PIN qayta so'raladi
                    lifetime = device_idle_limit(business)
                    device.last_seen_at = now
                row.expires_at = now + lifetime  # faol foydalanuvchi qayta-qayta kirib yurmaydi
                if rotate:
                    # Uzoq muddatli token har yangilashda almashadi: o'g'irlangan eski token tez yaroqsiz bo'ladi.
                    # Eskisi bilan kelgan oynalar qisqa muhlat ichida shu yangi tokenni oladi.
                    old_token, (refresh_token, row.refresh_token_hash) = refresh_token, new_token()
                    await get_redis().set(
                        _successor_key(old_token), seal(refresh_token), ex=ROTATION_GRACE_SECONDS
                    )
                if business is not None:
                    business.last_activity_at = now
                issued = Issued(
                    user=user,
                    business=business,
                    access_token=_access_token(user, row.id),
                    refresh_token=refresh_token,
                    refresh_max_age=int(lifetime.total_seconds()),
                    store=store,
                )

    if issued is None:
        raise AppError(401, "session_expired")
    return issued


async def logout(refresh_token: str | None) -> None:
    """Chiqish. Do'kon qurilmasida bu — "qulflash": sotuvchi sessiyasi tugaydi, qurilma bog'langanicha qoladi."""
    if not refresh_token:
        return
    async with system_session() as db:
        by_token = select(UserSession).where(UserSession.revoked_at.is_(None))
        row = await db.scalar(
            by_token.where(UserSession.refresh_token_hash == hash_token(refresh_token))
        )
        if row is None:
            # Token hozirgina almashtirilgan, yangisi brauzerga yetib kelmagan — sessiya baribir tugatiladi
            successor = unseal(await get_redis().get(_successor_key(refresh_token)))
            if successor is not None:
                row = await db.scalar(
                    by_token.where(UserSession.refresh_token_hash == hash_token(successor))
                )
        if row is None:
            return
        row.revoked_at = _now()
        if row.business_id is not None:
            device = await db.get(Device, row.device_id) if row.device_id else None
            log_event(
                db,
                business_id=row.business_id,
                user_id=row.user_id,
                location_id=device.store_id if device else None,  # do'kon qurilmasida — qaysi do'kon
                category="login",
                event_code="logout",
            )


async def change_password(
    db: AsyncSession, user: User, session_id: int, old_password: str, new_password: str
) -> None:
    if not await asyncio.to_thread(verify_password, old_password, user.password_hash):
        raise AppError(400, "wrong_password")
    if old_password == new_password:
        raise AppError(400, "same_password")

    user.password_hash = await asyncio.to_thread(hash_password, new_password)
    if user.business_id is not None:  # platforma egasining paroli hech kimga ko'rsatilmaydi
        user.password_enc = seal(new_password)
    user.must_change_password = False
    # Parol o'zgarsa, boshqa qurilmalardagi sessiyalar tugaydi (shu sessiya qoladi)
    await db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.id != session_id,
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=_now())
    )
    log_event(
        db,
        business_id=user.business_id,
        user_id=user.id,
        category="login",
        event_code="password.changed",
    )
