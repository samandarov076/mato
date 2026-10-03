"""FastAPI uchun umumiy bog'liqliklar: joriy foydalanuvchi, rol tekshiruvi, biznes ichidagi baza sessiyasi.

Har himoyalangan so'rov:
1. tokendan biznesni oladi va shu biznes ichida tranzaksiya ochadi (RLS);
2. sessiya bazada tirikligini tekshiradi — xodim faolsizlantirilgan, biznes bloklangan,
   qurilma uzilgan yoki sessiya tugatilgan bo'lsa, token muddati tugashini kutmasdan DARHOL rad etiladi;
3. so'rov tugagach tranzaksiya saqlanadi (xato bo'lsa — bekor qilinadi).
"""
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import system_session, tenant_session
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.modules.auth.models import Device, User, UserSession
from app.modules.platform.models import Business
from app.modules.structure.models import Location


@dataclass
class AuthContext:
    user: User
    business: Business
    session_id: int
    db: AsyncSession  # joriy biznes ichidagi tranzaksiya
    # Do'kon qurilmasidan (PIN bilan) kirilgan bo'lsa — qurilma bog'langan do'kon; shaxsiy kirishda None
    store: Location | None = None


_bearer = HTTPBearer(auto_error=False)


async def get_auth_basic(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AsyncIterator[AuthContext]:
    """Kirgan foydalanuvchi. Parolini hali almashtirmagan bo'lsa ham o'tkazadi (profil va chiqish uchun)."""
    payload = decode_access_token(credentials.credentials) if credentials else None
    if not payload or payload.get("bid") is None or payload.get("sid") is None:
        raise AppError(401, "not_authenticated")

    async with tenant_session(int(payload["bid"])) as db:
        row = (
            await db.execute(
                select(User, Business, Location)
                .join(UserSession, UserSession.user_id == User.id)
                .join(Business, Business.id == User.business_id)
                .outerjoin(Device, Device.id == UserSession.device_id)
                .outerjoin(Location, Location.id == Device.store_id)
                .where(
                    UserSession.id == int(payload["sid"]),
                    UserSession.revoked_at.is_(None),
                    UserSession.expires_at > func.now(),
                    User.is_active,
                    Business.status == "active",
                    or_(UserSession.device_id.is_(None), Device.revoked_at.is_(None)),
                )
            )
        ).first()
        if row is None:
            raise AppError(401, "session_expired")
        yield AuthContext(
            user=row[0], business=row[1], store=row[2], session_id=int(payload["sid"]), db=db
        )


# scope="function": tranzaksiya javob yuborilishidan OLDIN saqlanadi — mijoz "tayyor" javobini
# olgan bo'lsa, ma'lumot bazada aniq bor.
AuthBasic = Annotated[AuthContext, Depends(get_auth_basic, scope="function")]


async def get_auth(ctx: AuthBasic) -> AuthContext:
    """Asosiy himoya: vaqtinchalik parolini almashtirmagan foydalanuvchi ishlay olmaydi."""
    if ctx.user.must_change_password:
        raise AppError(403, "password_change_required")
    return ctx


Auth = Annotated[AuthContext, Depends(get_auth)]


def require_roles(*roles: str) -> Callable[..., AuthContext]:
    """Faqat ko'rsatilgan rollar uchun: `ctx: Annotated[AuthContext, Depends(require_roles("owner"))]`."""

    async def _dependency(ctx: Auth) -> AuthContext:
        if ctx.user.role not in roles:
            raise AppError(403, "forbidden")
        return ctx

    return _dependency


# Eng ko'p ishlatiladigan himoya: faqat biznes egalari (asosiy ega va sherik-egalar)
OwnerAuth = Annotated[AuthContext, Depends(require_roles("owner"))]


# ---------- Platforma egasi ----------


@dataclass
class PlatformContext:
    user: User
    session_id: int
    # RLS'dan tashqari tranzaksiya: platforma egasi bizneslarni boshqaradi, lekin ularning ichki
    # ma'lumotlariga (sotuv, tovar) kiradigan API yo'q. Har so'rovda biznes sharti qo'lda qo'yiladi.
    db: AsyncSession


async def get_platform_auth(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AsyncIterator[PlatformContext]:
    payload = decode_access_token(credentials.credentials) if credentials else None
    if not payload or payload.get("sid") is None:
        raise AppError(401, "not_authenticated")
    if payload.get("bid") is not None or payload.get("role") != "platform_owner":
        raise AppError(403, "forbidden")  # biznes xodimi platforma paneliga kira olmaydi

    async with system_session() as db:
        user = await db.scalar(
            select(User)
            .join(UserSession, UserSession.user_id == User.id)
            .where(
                UserSession.id == int(payload["sid"]),
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > func.now(),
                UserSession.business_id.is_(None),
                User.is_active,
                User.role == "platform_owner",
            )
        )
        if user is None:
            raise AppError(401, "session_expired")
        yield PlatformContext(user=user, session_id=int(payload["sid"]), db=db)


PlatformAuth = Annotated[PlatformContext, Depends(get_platform_auth, scope="function")]
