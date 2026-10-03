"""Platforma paneli: bizneslarni qo'shish, bloklash, egalarini boshqarish.

Bu yerdagi hamma so'rov RLS'dan tashqari (platforma egasi barcha bizneslarni ko'radi), shuning uchun
har so'rovda biznes sharti qo'lda qo'yiladi. Biznesning ichki ma'lumotlariga (sotuv, tovar) tegilmaydi.
"""
import asyncio
from typing import Literal

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.audit import log_event
from app.core.deps import PlatformContext
from app.core.errors import AppError
from app.core.security import hash_password, new_temp_password
from app.core.vault import seal, unseal
from app.modules.auth.models import User, UserSession
from app.modules.auth.schemas import normalize_phone
from app.modules.auth.service import now_utc
from app.modules.platform.models import Business, BusinessStatusEvent
from app.modules.platform.schemas import BusinessDetail, BusinessRow, OwnerBrief
from app.modules.structure.models import Location

_PrimaryOwner = aliased(User)

_stores_count = (
    select(func.count())
    .select_from(Location)
    .where(Location.business_id == Business.id, Location.type == "store", Location.is_active)
    .correlate(Business)
    .scalar_subquery()
)
_staff_count = (
    select(func.count())
    .select_from(User)
    .where(User.business_id == Business.id, User.is_active)
    .correlate(Business)
    .scalar_subquery()
)


def _rows_query():
    return select(Business, _PrimaryOwner, _stores_count, _staff_count).outerjoin(
        _PrimaryOwner,
        and_(_PrimaryOwner.business_id == Business.id, _PrimaryOwner.is_primary_owner),
    )


def _to_row(business: Business, owner: User | None, stores: int, staff: int) -> BusinessRow:
    return BusinessRow(
        id=business.id,
        name=business.name,
        status=business.status,
        created_at=business.created_at,
        last_activity_at=business.last_activity_at,
        stores_count=stores,
        staff_count=staff,
        owner=OwnerBrief(full_name=owner.full_name, phone=owner.phone) if owner else None,
    )


async def _revoke_sessions(db: AsyncSession, *conditions) -> None:
    await db.execute(
        update(UserSession)
        .where(UserSession.revoked_at.is_(None), *conditions)
        .values(revoked_at=now_utc())
    )


async def _business(db: AsyncSession, business_id: int) -> Business:
    business = await db.get(Business, business_id, with_for_update=True)
    if business is None:
        raise AppError(404, "business_not_found")
    return business


async def _owner(db: AsyncSession, business_id: int, user_id: int) -> User:
    user = await db.scalar(
        select(User).where(
            User.id == user_id, User.business_id == business_id, User.role == "owner"
        )
    )
    if user is None:
        raise AppError(404, "owner_not_found")
    return user


# ---------- Ro'yxat va kartochka ----------


async def list_businesses(
    db: AsyncSession,
    *,
    search: str | None,
    status: Literal["active", "blocked"] | None,
    sort: Literal["created_at", "last_activity_at"],
) -> list[BusinessRow]:
    query = _rows_query()
    if search and search.strip():
        text = search.strip()
        escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        matches = [Business.name.ilike(f"%{escaped}%", escape="\\")]
        digits = "".join(ch for ch in text if ch.isdigit())
        if len(digits) >= 3:  # egasining telefoni bo'yicha: "90 111" ham, "+99890111" ham topadi
            matches.append(_PrimaryOwner.phone.like(f"%{digits}%"))
        query = query.where(or_(*matches))
    if status is not None:
        query = query.where(Business.status == status)
    column = Business.last_activity_at if sort == "last_activity_at" else Business.created_at
    query = query.order_by(column.desc().nulls_last(), Business.id.desc())
    return [_to_row(*row) for row in await db.execute(query)]


async def get_business(db: AsyncSession, business_id: int) -> BusinessDetail:
    row = (await db.execute(_rows_query().where(Business.id == business_id))).first()
    if row is None:
        raise AppError(404, "business_not_found")
    owners = await db.scalars(
        select(User)
        .where(User.business_id == business_id, User.role == "owner")
        .order_by(User.is_primary_owner.desc(), User.full_name)
    )
    events = await db.scalars(
        select(BusinessStatusEvent)
        .where(BusinessStatusEvent.business_id == business_id)
        .order_by(BusinessStatusEvent.id.desc())
    )
    return BusinessDetail(
        **_to_row(*row).model_dump(), owners=list(owners), events=list(events)
    )


# ---------- Amallar ----------


async def create_business(
    ctx: PlatformContext, name: str, owner_full_name: str, owner_phone: str
) -> tuple[Business, str, str]:
    """Biznes va uning asosiy egasini yaratadi. (biznes, egasining telefoni, vaqtinchalik parol)."""
    phone = normalize_phone(owner_phone)
    if phone is None:
        raise AppError(422, "validation_error", fields={"owner_phone": "invalid_phone"})
    if await ctx.db.scalar(select(User.id).where(User.phone == phone)):
        raise AppError(409, "phone_taken")

    temp_password = new_temp_password()
    business = Business(name=name)
    ctx.db.add(business)
    await ctx.db.flush()
    ctx.db.add(
        User(
            business_id=business.id,
            full_name=owner_full_name,
            phone=phone,
            password_hash=await asyncio.to_thread(hash_password, temp_password),
            password_enc=seal(temp_password),
            role="owner",
            is_primary_owner=True,
            all_locations=True,
            must_change_password=True,  # birinchi kirishda o'z parolini o'rnatadi
        )
    )
    log_event(ctx.db, business_id=business.id, category="staff", event_code="business.created")
    return business, phone, temp_password


async def set_blocked(ctx: PlatformContext, business_id: int, *, blocked: bool, reason: str) -> None:
    business = await _business(ctx.db, business_id)
    target = "blocked" if blocked else "active"
    if business.status == target:
        raise AppError(409, "status_unchanged")
    business.status = target
    ctx.db.add(
        BusinessStatusEvent(
            business_id=business.id,
            action="block" if blocked else "unblock",
            reason=reason,
            user_id=ctx.user.id,
        )
    )
    if blocked:
        # Barcha xodimlar darhol chiqariladi; ma'lumotlar to'liq saqlanadi
        await _revoke_sessions(ctx.db, UserSession.business_id == business.id)


async def reset_owner_password(ctx: PlatformContext, business_id: int, user_id: int) -> str:
    """Biznes egasiga yangi vaqtinchalik parol beradi (u parolni unutganda)."""
    owner = await _owner(ctx.db, business_id, user_id)
    temp_password = new_temp_password()
    owner.password_hash = await asyncio.to_thread(hash_password, temp_password)
    owner.password_enc = seal(temp_password)
    owner.must_change_password = True
    await _revoke_sessions(ctx.db, UserSession.user_id == owner.id)
    log_event(
        ctx.db,
        business_id=business_id,
        category="staff",
        event_code="password.reset_by_platform",
        data={"name": owner.full_name},
    )
    return temp_password


async def reveal_owner_password(ctx: PlatformContext, business_id: int, user_id: int) -> str | None:
    """Biznes egasining hozirgi parolini ko'rsatadi. Biznesning o'z jurnaliga yoziladi — ega buni ko'radi.

    Saqlanmagan bo'lsa (parol bu imkoniyatdan oldin o'rnatilgan va ega hali qayta kirmagan) — None.
    """
    owner = await _owner(ctx.db, business_id, user_id)
    log_event(
        ctx.db,
        business_id=business_id,
        category="staff",
        event_code="password.viewed_by_platform",
        data={"name": owner.full_name},
    )
    return unseal(owner.password_enc)


async def change_primary_owner(
    ctx: PlatformContext, business_id: int, user_id: int, reason: str
) -> None:
    """Asosiy egalikni sherik-egalardan biriga o'tkazadi."""
    await _business(ctx.db, business_id)  # qulf: bir vaqtda ikki marta almashtirib bo'lmaydi
    new_primary = await _owner(ctx.db, business_id, user_id)
    if new_primary.is_primary_owner or not new_primary.is_active:
        raise AppError(400, "invalid_owner")

    current = await ctx.db.scalar(
        select(User).where(User.business_id == business_id, User.is_primary_owner)
    )
    if current is not None:
        current.is_primary_owner = False
        await ctx.db.flush()  # avval eskisi bo'shatiladi — bazada "asosiy ega bitta" cheklovi bor
    new_primary.is_primary_owner = True
    ctx.db.add(
        BusinessStatusEvent(
            business_id=business_id, action="owner_change", reason=reason, user_id=ctx.user.id
        )
    )
    log_event(
        ctx.db,
        business_id=business_id,
        category="staff",
        event_code="owner.primary_changed",
        data={"name": new_primary.full_name},
    )


async def rename_business(ctx: PlatformContext, business_id: int, name: str) -> Business:
    business = await _business(ctx.db, business_id)
    if name != business.name:
        log_event(
            ctx.db,
            business_id=business_id,
            category="staff",
            event_code="business.renamed_by_platform",
            data={"old": business.name, "new": name},
        )
        business.name = name
    return business


async def update_owner_phone(
    ctx: PlatformContext, business_id: int, user_id: int, phone: str
) -> User:
    owner = await _owner(ctx.db, business_id, user_id)
    normalized = normalize_phone(phone)
    if normalized is None:
        raise AppError(422, "validation_error", fields={"phone": "invalid_phone"})
    if normalized != owner.phone:
        if await ctx.db.scalar(select(User.id).where(User.phone == normalized)):
            raise AppError(409, "phone_taken")
        owner.phone = normalized
        log_event(
            ctx.db,
            business_id=business_id,
            category="staff",
            event_code="owner.phone_changed",
            data={"name": owner.full_name},
        )
    return owner
