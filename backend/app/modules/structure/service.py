"""Tuzilma mantiqi: do'konlar, skladlar, xodimlar. Hamma amal biznes ichida (RLS) va jurnalga yoziladi.

Hech narsa o'chirilmaydi — faqat faolsizlantiriladi. Faolsizlantirilgan xodim darhol chiqariladi,
faolsizlantirilgan do'konning qurilmalari uziladi.
"""
import asyncio
from datetime import UTC, datetime

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.core.audit import log_event
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.core.security import hash_password, pin_lookup
from app.core.vault import seal, unseal
from app.modules.auth.models import Device, User, UserSession
from app.modules.auth.schemas import normalize_phone
from app.modules.inventory.models import BatchStock, Transfer
from app.modules.structure.models import Location, UserLocation
from app.modules.structure.schemas import (
    LocationCreate,
    LocationOut,
    LocationUpdate,
    StaffCreate,
    StaffOut,
    StaffSecretOut,
    StaffUpdate,
    StoreAccessIn,
    StoreSecretOut,
)

# Rolga mos joy turi: sotuvchi — do'konlar, omborchi — skladlar
_LOCATION_TYPE = {"seller": "store", "warehouse": "warehouse"}


def _now() -> datetime:
    return datetime.now(UTC)


def _field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields={field: problem})


def _log(ctx: AuthContext, event_code: str, name: str, location_id: int | None = None) -> None:
    log_event(
        ctx.db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        location_id=location_id,
        category="staff",
        event_code=event_code,
        data={"name": name},
    )


async def _revoke_user_sessions(ctx: AuthContext, user_id: int) -> None:
    await ctx.db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


# ====================== Joylar ======================


async def list_locations(
    ctx: AuthContext, type: str | None = None, include_inactive: bool = False
) -> list[LocationOut]:
    query = select(Location).order_by(Location.type, Location.is_active.desc(), Location.name)
    if type is not None:
        query = query.where(Location.type == type)
    if not include_inactive:
        query = query.where(Location.is_active)
    locations = (await ctx.db.scalars(query)).all()

    devices = dict(
        (
            await ctx.db.execute(
                select(Device.store_id, func.count())
                .where(Device.revoked_at.is_(None))
                .group_by(Device.store_id)
            )
        ).all()
    )
    staff = (
        await ctx.db.scalars(
            select(User)
            .where(User.is_active, User.role.in_(_LOCATION_TYPE))
            .order_by(User.full_name)
        )
    ).all()
    assigned: dict[int, set[int]] = {}
    for user_id, location_id in await ctx.db.execute(
        select(UserLocation.user_id, UserLocation.location_id)
    ):
        assigned.setdefault(location_id, set()).add(user_id)

    return [
        LocationOut(
            id=location.id,
            type=location.type,
            name=location.name,
            address=location.address,
            phone=location.phone,
            is_active=location.is_active,
            devices_count=devices.get(location.id, 0),
            login=location.login,
            staff=[
                user.full_name
                for user in staff
                if _LOCATION_TYPE[user.role] == location.type
                and (user.all_locations or user.id in assigned.get(location.id, ()))
            ],
        )
        for location in locations
    ]


async def _location(ctx: AuthContext, location_id: int) -> Location:
    location = await ctx.db.get(Location, location_id)  # RLS: boshqa biznes joyi ko'rinmaydi
    if location is None:
        raise AppError(404, "location_not_found")
    return location


async def _check_location_fields(
    ctx: AuthContext, type: str, name: str, phone: str | None, exclude_id: int | None = None
) -> str | None:
    """Nom shu turdagi joylar orasida noyobligini tekshiradi; telefonni bir xil ko'rinishga keltiradi."""
    duplicate = select(Location.id).where(
        Location.type == type, func.lower(Location.name) == name.lower()
    )
    if exclude_id is not None:
        duplicate = duplicate.where(Location.id != exclude_id)
    if await ctx.db.scalar(duplicate):
        raise AppError(409, "name_taken")
    if type != "store" or not phone or not phone.strip():
        return None
    normalized = normalize_phone(phone)
    if normalized is None:
        raise _field_error("phone", "invalid_phone")
    return normalized


async def create_location(ctx: AuthContext, body: LocationCreate) -> Location:
    phone = await _check_location_fields(ctx, body.type, body.name, body.phone)
    location = Location(
        business_id=ctx.business.id,
        type=body.type,
        name=body.name,
        address=body.address or None,
        phone=phone,
    )
    ctx.db.add(location)
    await ctx.db.flush()
    _log(ctx, "location.created", location.name, location.id)
    return location


async def update_location(ctx: AuthContext, location_id: int, body: LocationUpdate) -> Location:
    location = await _location(ctx, location_id)
    phone = await _check_location_fields(ctx, location.type, body.name, body.phone, location.id)
    location.name, location.address, location.phone = body.name, body.address or None, phone
    _log(ctx, "location.updated", location.name, location.id)
    return location


async def set_location_active(ctx: AuthContext, location_id: int, active: bool) -> None:
    location = await _location(ctx, location_id)
    if location.is_active == active:
        return
    if not active:
        # Qoldig'i bor yoki yo'lda tovari bor joy faolsizlantirilmaydi — avval tovar ko'chiriladi
        has_stock = await ctx.db.scalar(
            select(BatchStock.batch_id)
            .where(
                BatchStock.location_id == location.id,
                BatchStock.status == "open",
                BatchStock.qty_m != 0,
            )
            .limit(1)
        )
        on_the_way = await ctx.db.scalar(
            select(Transfer.id)
            .where(
                Transfer.status == "in_transit",
                or_(
                    Transfer.from_location_id == location.id,
                    Transfer.to_location_id == location.id,
                ),
            )
            .limit(1)
        )
        if has_stock is not None or on_the_way is not None:
            raise AppError(409, "location_has_stock")
    location.is_active = active
    if not active and location.type == "store":
        # Do'kon yopilsa, unga bog'langan qurilmalar uziladi va undagi sessiyalar tugaydi
        device_ids = (
            await ctx.db.scalars(
                select(Device.id).where(Device.store_id == location.id, Device.revoked_at.is_(None))
            )
        ).all()
        if device_ids:
            now = _now()
            await ctx.db.execute(
                update(Device).where(Device.id.in_(device_ids)).values(revoked_at=now)
            )
            await ctx.db.execute(
                update(UserSession)
                .where(UserSession.device_id.in_(device_ids), UserSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
    _log(ctx, "location.activated" if active else "location.deactivated", location.name, location.id)


async def _store(ctx: AuthContext, location_id: int) -> Location:
    location = await _location(ctx, location_id)
    if location.type != "store":
        raise AppError(400, "store_only")
    return location


async def set_store_access(ctx: AuthContext, location_id: int, body: StoreAccessIn) -> None:
    """Do'kon logini va parolini o'rnatadi yoki o'zgartiradi.

    Login butun tizimda noyob — boshqa bizneslarning loginlari RLS ortida, shuning uchun noyoblikni
    baza indeksi tekshiradi. Parol almashtirilsa, avval shu login bilan ochilgan qurilmalar ishlayveradi
    (ular o'z tokeni bilan bog'langan) — kerak bo'lsa ega ularni "Qurilmalar"da uzadi.
    """
    store = await _store(ctx, location_id)
    if body.password is None and store.password_hash is None:
        raise _field_error("password", "required")
    store.login = body.login
    if body.password is not None:
        store.password_hash = await asyncio.to_thread(hash_password, body.password)
        store.password_enc = seal(body.password)
    try:
        async with ctx.db.begin_nested():
            await ctx.db.flush()
    except IntegrityError as error:
        if "uq_locations_login" in str(error.orig):
            raise AppError(409, "login_taken") from None
        raise
    _log(ctx, "location.login_set", store.name, store.id)


async def clear_store_access(ctx: AuthContext, location_id: int) -> None:
    """Do'kon logini o'chiriladi: shu login bilan endi kirib bo'lmaydi (bog'langan qurilmalar qoladi)."""
    store = await _store(ctx, location_id)
    store.login = store.password_hash = store.password_enc = None
    _log(ctx, "location.login_cleared", store.name, store.id)


async def reveal_store_password(ctx: AuthContext, location_id: int) -> StoreSecretOut:
    store = await _store(ctx, location_id)
    _log(ctx, "location.password_viewed", store.name, store.id)
    return StoreSecretOut(password=unseal(store.password_enc))


# ====================== Xodimlar ======================


async def list_staff(ctx: AuthContext) -> list[StaffOut]:
    users = (
        await ctx.db.scalars(
            select(User).order_by(User.is_active.desc(), User.role, User.full_name)
        )
    ).all()
    assigned: dict[int, list[int]] = {}
    for user_id, location_id in await ctx.db.execute(
        select(UserLocation.user_id, UserLocation.location_id).order_by(UserLocation.location_id)
    ):
        assigned.setdefault(user_id, []).append(location_id)
    return [_staff_out(user, assigned.get(user.id, [])) for user in users]


def _staff_out(user: User, location_ids: list[int]) -> StaffOut:
    return StaffOut(
        id=user.id,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone,
        is_primary_owner=user.is_primary_owner,
        is_active=user.is_active,
        all_locations=user.all_locations,
        location_ids=location_ids,
        has_pin=user.pin_lookup is not None,
    )


async def _staff(ctx: AuthContext, user_id: int) -> User:
    user = await ctx.db.get(User, user_id)
    if user is None:
        raise AppError(404, "user_not_found")
    return user


def _require_manageable(ctx: AuthContext, target: User) -> None:
    """Egalarni faqat asosiy ega boshqaradi; asosiy eganing o'zi bu yerdan o'zgartirilmaydi."""
    if target.is_primary_owner:
        raise AppError(403, "primary_owner_protected")
    if target.role == "owner" and not ctx.user.is_primary_owner:
        raise AppError(403, "primary_owner_only")


async def _locations_for(
    ctx: AuthContext, role: str, all_locations: bool, location_ids: list[int]
) -> tuple[bool, list[int]]:
    """Xodimga joylarni tekshiradi: (hammasi, tanlanganlari). Ega — doim hamma joy."""
    if role == "owner":
        return True, []
    if all_locations:
        return True, []
    wanted = sorted(set(location_ids))
    if not wanted:
        raise _field_error("location_ids", "required")
    found = (
        await ctx.db.scalars(
            select(Location.id).where(
                Location.id.in_(wanted), Location.type == _LOCATION_TYPE[role], Location.is_active
            )
        )
    ).all()
    if set(found) != set(wanted):  # boshqa turdagi, faolsiz yoki begona joy
        raise _field_error("location_ids", "invalid")
    return False, wanted


def _phone_for(role: str, phone: str | None) -> str | None:
    if role == "seller":
        return None  # sotuvchi faqat PIN bilan kiradi — telefon kerak emas
    normalized = normalize_phone(phone or "")
    if normalized is None:
        raise _field_error("phone", "invalid_phone")
    return normalized


async def _flush_unique(ctx: AuthContext) -> None:
    """Bazadagi noyoblik cheklovlarini tushunarli xatoga aylantiradi.

    Telefon butun tizimda noyob, lekin boshqa bizneslar RLS ortida — oldindan so'rab bo'lmaydi.
    """
    try:
        async with ctx.db.begin_nested():
            await ctx.db.flush()
    except IntegrityError as error:
        message = str(error.orig)
        if "uq_users_phone" in message:
            raise AppError(409, "phone_taken") from None
        if "pin_lookup" in message:
            raise AppError(409, "pin_taken") from None
        raise


async def _replace_locations(ctx: AuthContext, user: User, location_ids: list[int]) -> None:
    await ctx.db.execute(delete(UserLocation).where(UserLocation.user_id == user.id))
    ctx.db.add_all(
        UserLocation(user_id=user.id, location_id=location_id, business_id=ctx.business.id)
        for location_id in location_ids
    )


async def create_staff(ctx: AuthContext, body: StaffCreate) -> StaffOut:
    if body.role == "owner" and not ctx.user.is_primary_owner:
        raise AppError(403, "primary_owner_only")
    phone = _phone_for(body.role, body.phone)
    all_locations, location_ids = await _locations_for(
        ctx, body.role, body.all_locations, body.location_ids
    )
    user = User(
        business_id=ctx.business.id,
        full_name=body.full_name,
        role=body.role,
        phone=phone,
        all_locations=all_locations,
    )
    if body.role == "seller":
        if body.pin is None:
            raise _field_error("pin", "required")
        user.pin_lookup = pin_lookup(ctx.business.id, body.pin)
        user.pin_enc = seal(body.pin)
    else:
        if body.password is None:
            raise _field_error("password", "required")
        user.password_hash = await asyncio.to_thread(hash_password, body.password)
        user.password_enc = seal(body.password)
        user.must_change_password = True  # parolni ega qo'ygan — xodim birinchi kirishda almashtiradi
    ctx.db.add(user)
    await _flush_unique(ctx)
    await _replace_locations(ctx, user, location_ids)
    _log(ctx, "user.created", user.full_name)
    return _staff_out(user, location_ids)


async def update_staff(ctx: AuthContext, user_id: int, body: StaffUpdate) -> StaffOut:
    user = await _staff(ctx, user_id)
    _require_manageable(ctx, user)
    all_locations, location_ids = await _locations_for(
        ctx, user.role, body.all_locations, body.location_ids
    )
    current = (
        await ctx.db.scalars(
            select(UserLocation.location_id).where(UserLocation.user_id == user.id)
        )
    ).all()
    access_changed = user.all_locations != all_locations or sorted(current) != location_ids

    user.full_name = body.full_name
    user.phone = _phone_for(user.role, body.phone)
    user.all_locations = all_locations
    await _flush_unique(ctx)
    if access_changed:
        await _replace_locations(ctx, user, location_ids)
        # Joy olib qo'yilgan bo'lsa, o'sha joydagi ochiq sessiya darhol yopilishi kerak
        await _revoke_user_sessions(ctx, user.id)
    _log(ctx, "user.updated", user.full_name)
    return _staff_out(user, location_ids)


async def reset_password(ctx: AuthContext, user_id: int, password: str) -> None:
    user = await _staff(ctx, user_id)
    _require_manageable(ctx, user)
    if user.role == "seller":
        raise AppError(400, "seller_has_no_password")
    user.password_hash = await asyncio.to_thread(hash_password, password)
    user.password_enc = seal(password)
    user.must_change_password = True
    await _revoke_user_sessions(ctx, user.id)
    _log(ctx, "user.password_reset", user.full_name)


async def set_pin(ctx: AuthContext, user_id: int, pin: str) -> None:
    """PIN'ni faqat biznes egasi o'rnatadi — "bu PIN band" xabarini ham faqat u ko'radi."""
    user = await _staff(ctx, user_id)
    if user.role != "seller":
        raise AppError(400, "pin_only_for_sellers")
    user.pin_lookup = pin_lookup(ctx.business.id, pin)
    user.pin_enc = seal(pin)
    await _flush_unique(ctx)
    await _revoke_user_sessions(ctx, user.id)  # eski PIN bilan ochilgan sessiyalar yopiladi
    _log(ctx, "user.pin_changed", user.full_name)


async def reveal_secret(ctx: AuthContext, user_id: int) -> StaffSecretOut:
    """Xodimning hozirgi paroli yoki PIN'ini ko'rsatadi — unutgan xodimga aytib berish uchun.

    Kim boshqara olsa, o'sha ko'ra oladi (egalarnikini — faqat asosiy ega; asosiy eganikini — hech kim).
    Har ko'rish jurnalga yoziladi. Qiymat saqlanmagan bo'lsa (parol bu imkoniyatdan oldin o'rnatilgan
    va xodim hali qayta kirmagan) — None qaytadi.
    """
    user = await _staff(ctx, user_id)
    _require_manageable(ctx, user)
    _log(ctx, "user.secret_viewed", user.full_name)
    return StaffSecretOut(password=unseal(user.password_enc), pin=unseal(user.pin_enc))


async def set_staff_active(ctx: AuthContext, user_id: int, active: bool) -> None:
    user = await _staff(ctx, user_id)
    if user.id == ctx.user.id:
        raise AppError(400, "cannot_deactivate_self")
    _require_manageable(ctx, user)
    if user.is_active == active:
        return
    user.is_active = active
    await _flush_unique(ctx)  # faollashtirishda PIN boshqa faol sotuvchida band bo'lishi mumkin
    if not active:
        await _revoke_user_sessions(ctx, user.id)  # barcha qurilmalarda darhol chiqariladi
    _log(ctx, "user.activated" if active else "user.deactivated", user.full_name)
