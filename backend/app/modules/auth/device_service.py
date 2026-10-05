"""Do'kon qurilmasi: bog'lash, uzish va sotuvchining PIN bilan kirishi.

Har do'konda bitta umumiy qurilma. Biznes egasi uni bir marta o'z paroli bilan ochib, do'konga
bog'laydi — brauzerga uzoq muddatli qurilma tokeni (httpOnly cookie) yoziladi. Shundan keyin
sotuvchilar shu qurilmada faqat 4 xonali PIN bilan kiradi; har amal o'sha sotuvchi nomidan yoziladi.
"""
import asyncio
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import exists, func, or_, select, update

from app.core import ratelimit
from app.core.audit import log_event
from app.core.config import get_settings
from app.core.db import system_session
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    hash_token,
    new_token,
    pin_lookup,
    verify_password,
)
from app.core.vault import seal
from app.modules.auth.models import Device, User, UserSession
from app.modules.auth.service import Issued, device_idle_limit
from app.modules.notifications import service as notifications
from app.modules.platform.models import Business
from app.modules.structure.models import Location, UserLocation

settings = get_settings()


def _now() -> datetime:
    return datetime.now(UTC)


async def _revoke_device(db, device: Device) -> None:
    """Qurilmani uzadi va undagi barcha sessiyalarni tugatadi — qurilma darhol ishlamay qoladi."""
    now = _now()
    device.revoked_at = now
    await db.execute(
        update(UserSession)
        .where(UserSession.device_id == device.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )


# ---------- Biznes egasi: bog'lash, ro'yxat, uzish ----------


async def bind_device(
    ctx: AuthContext, store_id: int, name: str, previous_token: str | None
) -> tuple[Device, Location, str]:
    """Joriy brauzerni do'konga bog'laydi. (qurilma, do'kon, qurilma tokeni) qaytaradi."""
    db = ctx.db
    store = await db.scalar(
        select(Location).where(
            Location.id == store_id, Location.type == "store", Location.is_active
        )
    )
    if store is None:  # boshqa biznes do'koni ham shu yerga tushadi — RLS uni ko'rsatmaydi
        raise AppError(404, "store_not_found")

    # Shu brauzer avval bog'langan bo'lsa — eski bog'lanish uziladi
    if previous_token:
        previous = await db.scalar(
            select(Device).where(
                Device.token_hash == hash_token(previous_token), Device.revoked_at.is_(None)
            )
        )
        if previous is not None:
            await _revoke_device(db, previous)

    token, token_hash = new_token()
    device = Device(
        business_id=ctx.business.id, store_id=store.id, name=name, token_hash=token_hash
    )
    db.add(device)
    await db.flush()

    # Qurilma endi do'konniki: egasining shaxsiy sessiyasi unda qolmaydi
    await db.execute(
        update(UserSession).where(UserSession.id == ctx.session_id).values(revoked_at=_now())
    )
    log_event(
        db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        location_id=store.id,
        category="staff",
        event_code="device.bound",
        data={"device_id": device.id, "name": name},
    )
    return device, store, token


async def list_devices(ctx: AuthContext) -> list[tuple[Device, Location]]:
    rows = await ctx.db.execute(
        select(Device, Location)
        .join(Location, Location.id == Device.store_id)
        .where(Device.revoked_at.is_(None))
        .order_by(Location.name, Device.created_at)
    )
    return [(device, store) for device, store in rows]


async def revoke_device(ctx: AuthContext, device_id: int) -> None:
    device = await ctx.db.scalar(
        select(Device).where(Device.id == device_id, Device.revoked_at.is_(None))
    )
    if device is None:
        raise AppError(404, "device_not_found")
    await _revoke_device(ctx.db, device)
    log_event(
        ctx.db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        location_id=device.store_id,
        category="staff",
        event_code="device.revoked",
        data={"device_id": device.id, "name": device.name},
    )


async def store_login(
    login: str, password: str, previous_token: str | None, ip: str | None = None
) -> tuple[Device, Location, Business, str]:
    """Do'konning o'z logini va paroli bilan SHU brauzerni do'kon qurilmasiga aylantiradi.

    Biznes egasi planshetga kirmaydi: login/parolni do'konga beradi, qurilma shu bilan ochiladi va PIN
    ekraniga o'tadi. Login faqat PIN ekranini ochadi — ma'lumotlar PIN'siz ko'rinmaydi. Har shunday
    qurilma "Qurilmalar" ro'yxatida turadi, ega uni uzishi mumkin. (qurilma, do'kon, biznes, token) qaytaradi.
    """
    login = login.strip().lower()
    await ratelimit.reject_if_ip_blocked(ip)
    subject = f"store:{login}"
    wait = await ratelimit.blocked_for(ratelimit.LOGIN, subject)
    if wait:
        raise AppError(429, "too_many_attempts", retry_after=wait)

    error: AppError | None = None
    async with system_session() as db:  # kirishda qidiruv: biznes hali noma'lum
        row = (
            await db.execute(
                select(Location, Business)
                .join(Business, Business.id == Location.business_id)
                .where(func.lower(Location.login) == login, Location.type == "store")
            )
        ).first()
        store, business = row if row else (None, None)
        password_ok = await asyncio.to_thread(
            verify_password, password, store.password_hash if store else None
        )
        if store is None or not password_ok:
            locked = await ratelimit.record_failure(ratelimit.LOGIN, subject)
            locked = await ratelimit.record_ip_failure(ip) or locked
            if locked:
                error = AppError(429, "too_many_attempts", retry_after=locked)
            else:
                error = AppError(401, "invalid_store_credentials")
        elif not store.is_active:
            error = AppError(403, "store_inactive")
        elif business.status != "active":
            error = AppError(403, "business_blocked")
        else:
            await ratelimit.clear(ratelimit.LOGIN, subject)
            if previous_token:  # shu brauzer avval boshqa do'konga bog'langan bo'lsa — eskisi uziladi
                previous = await db.scalar(
                    select(Device).where(
                        Device.token_hash == hash_token(previous_token), Device.revoked_at.is_(None)
                    )
                )
                if previous is not None:
                    await _revoke_device(db, previous)
            token, token_hash = new_token()
            name = f"{store.login} · {_now().astimezone(ZoneInfo(settings.app_timezone)):%d.%m.%Y %H:%M}"
            device = Device(
                business_id=business.id, store_id=store.id, name=name, token_hash=token_hash
            )
            db.add(device)
            await db.flush()
            log_event(
                db,
                business_id=business.id,
                location_id=store.id,
                category="staff",
                event_code="device.bound_by_login",
                data={"device_id": device.id, "name": name},
            )
    if error is not None:
        raise error
    return device, store, business, token


# ---------- Qurilmaning o'zi: holat va PIN bilan kirish ----------


async def _find_device(db, token: str | None) -> tuple[Device, Location, Business] | None:
    if not token:
        return None
    row = (
        await db.execute(
            select(Device, Location, Business)
            .join(Location, Location.id == Device.store_id)
            .join(Business, Business.id == Device.business_id)
            .where(
                Device.token_hash == hash_token(token),
                Device.revoked_at.is_(None),
                Location.is_active,
            )
        )
    ).first()
    return tuple(row) if row else None


async def device_status(token: str | None) -> tuple[Device, Location, Business] | None:
    """Bu brauzer do'kon qurilmasimi? (PIN ekranini ko'rsatish kerakmi — shuni interfeys so'raydi.)"""
    async with system_session() as db:
        return await _find_device(db, token)


async def pin_login(token: str | None, pin: str, ip: str | None = None) -> Issued:
    issued: Issued | None = None
    error: AppError | None = None

    await ratelimit.reject_if_ip_blocked(ip)
    async with system_session() as db:
        found = await _find_device(db, token)
        if found is None:
            error = AppError(401, "device_not_bound")
        else:
            device, store, business = found
            subject = str(device.id)
            wait = max(
                await ratelimit.blocked_for(ratelimit.PIN, subject),
                await ratelimit.blocked_for(ratelimit.PIN_STORE, str(store.id)),
            )
            if business.status != "active":
                error = AppError(403, "business_blocked")
            elif wait:
                error = AppError(429, "pin_locked", retry_after=wait)
            else:
                # PIN shu biznesning faol sotuvchisiniki va unga shu do'kon ruxsat etilgan bo'lishi kerak
                seller = await db.scalar(
                    select(User).where(
                        User.business_id == device.business_id,
                        User.role == "seller",
                        User.is_active,
                        User.pin_lookup == pin_lookup(device.business_id, pin),
                        or_(
                            User.all_locations,
                            exists().where(
                                UserLocation.user_id == User.id,
                                UserLocation.location_id == store.id,
                            ),
                        ),
                    )
                )
                if seller is None:
                    store_block = await ratelimit.record_failure(ratelimit.PIN_STORE, str(store.id))
                    device_block = await ratelimit.record_failure(ratelimit.PIN, subject)
                    ip_block = await ratelimit.record_ip_failure(ip)  # IP hisobi; bloki keyingi urinishda
                    if store_block or device_block:
                        log_event(
                            db,
                            business_id=device.business_id,
                            location_id=store.id,
                            category="login",
                            event_code="pin.locked",
                            data={"device_id": device.id},
                        )
                        if store_block:
                            # Do'kon bo'yicha blok — kimdir PIN'ni tanlab topmoqchi: egalar bilishi kerak
                            await notifications.notify_owners(
                                db,
                                device.business_id,
                                "pin.store_locked",
                                {"store": store.name, "store_id": store.id, "minutes": store_block // 60},
                            )
                        error = AppError(
                            429, "pin_locked", retry_after=max(store_block, device_block)
                        )
                    elif ip_block:
                        error = AppError(429, "too_many_attempts", retry_after=ip_block)
                    else:
                        error = AppError(401, "invalid_pin")
                else:
                    await ratelimit.clear(ratelimit.PIN, subject)
                    if seller.pin_enc is None:  # eski PIN — birinchi kirishda saqlab olinadi
                        seller.pin_enc = seal(pin)
                    now = _now()
                    idle = device_idle_limit(business)
                    refresh_token, refresh_hash = new_token()
                    row = UserSession(
                        business_id=device.business_id,
                        user_id=seller.id,
                        device_id=device.id,
                        refresh_token_hash=refresh_hash,
                        expires_at=now + idle,
                    )
                    db.add(row)
                    await db.flush()
                    device.last_seen_at = now
                    business.last_activity_at = now
                    log_event(
                        db,
                        business_id=device.business_id,
                        user_id=seller.id,
                        location_id=store.id,
                        category="login",
                        event_code="login.success",
                        data={"device_id": device.id},
                    )
                    issued = Issued(
                        user=seller,
                        business=business,
                        access_token=create_access_token(
                            user_id=seller.id,
                            session_id=row.id,
                            business_id=device.business_id,
                            role=seller.role,
                        ),
                        refresh_token=refresh_token,
                        refresh_max_age=int(idle.total_seconds()),
                        store=store,
                    )

    if error is not None:
        raise error
    return issued
