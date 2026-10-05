"""Tizim ichidagi xabarlar: yuborish, ro'yxat, o'qilgan qilish va real vaqt signali.

Xabar amal bilan bitta tranzaksiyada yoziladi (amal bekor bo'lsa — xabar ham). Saqlangandan keyin
qabul qiluvchiga Redis orqali "yangi xabar bor" signali ketadi; brauzer ochiq bo'lsa, sahifani
yangilamasdan ko'radi (`stream`). Telegram — 10-modulda, navbat orqali.

Hodisalar (docs/03-details/09-bildirishnomalar.md):
- transfer.arrived  — ko'chirish keldi, qabul qiling (qabul qiluvchi joy xodimlariga)
- transfer.diff     — ko'chirish farq bilan qabul qilindi (egalarga)
- transfer.waiting  — ko'chirish 24 soatdan beri qabul qilinmagan (egalarga)
- batch.big_diff    — partiya katta farq bilan yopildi, 10%+ (egalarga)
- stock.low         — kam qoldiq (egalarga)
"""
import asyncio
from collections.abc import AsyncIterator, Iterable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import after_commit
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.core.queue import enqueue
from app.core.redis import get_redis
from app.modules.auth.models import User
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationOut, NotificationPage
from app.modules.structure.models import Location, UserLocation

# Telegram'ga ham darhol boradigan hodisalar (10-telegram); qolganlari — faqat tizim ichida
TELEGRAM_INSTANT = frozenset({"transfer.diff", "batch.big_diff"})

# Oqim shuncha soniyadan keyin o'zi yopiladi — brauzer qayta ulanadi va sessiya yana tekshiriladi
STREAM_SECONDS = 600
HEARTBEAT_SECONDS = 20


def _channel(business_id: int, user_id: int) -> str:
    return f"notify:{business_id}:{user_id}"


# Xabarlar sahifasidagi tur filtri: hodisa kodi boshiga qarab (qolgan hammasi — "boshqa")
KIND_PREFIXES = {"low_stock": "stock", "transfers": "transfer", "credit": "debt"}


# ====================== Yuborish ======================


async def notify(
    db: AsyncSession,
    *,
    business_id: int,
    user_ids: Iterable[int],
    event_code: str,
    data: dict[str, Any],
    dedup_key: str | None = None,
) -> None:
    """Xodimlarga xabar yozadi. `dedup_key` berilsa — shu kalit bilan xabari bor xodimga qayta yozilmaydi."""
    rows = [
        {
            "business_id": business_id,
            "user_id": user_id,
            "event_code": event_code,
            "data": data,
            "dedup_key": dedup_key,
        }
        for user_id in set(user_ids)
    ]
    if not rows:
        return
    statement = pg_insert(Notification).values(rows)
    if dedup_key is not None:
        statement = statement.on_conflict_do_nothing(
            index_elements=["user_id", "dedup_key"], index_where=Notification.dedup_key.is_not(None)
        )
    created = (await db.execute(statement.returning(Notification.user_id))).scalars().all()

    async def announce() -> None:
        to_telegram = event_code in TELEGRAM_INSTANT and bool(get_settings().telegram_bot_token)
        for user_id in created:
            await get_redis().publish(_channel(business_id, user_id), "new")
            if to_telegram:  # fonda yuboriladi — so'rov Telegram javobini kutmaydi
                await enqueue("deliver_telegram", business_id, user_id, event_code, data)

    if created:
        after_commit(db, announce)


async def owner_ids(db: AsyncSession, business_id: int) -> list[int]:
    """Biznesning faol egalari (asosiy ega va sherik-egalar)."""
    rows = await db.scalars(
        select(User.id).where(User.business_id == business_id, User.role == "owner", User.is_active)
    )
    return list(rows.all())


async def notify_owners(
    db: AsyncSession,
    business_id: int,
    event_code: str,
    data: dict[str, Any],
    dedup_key: str | None = None,
    exclude: int | None = None,
) -> None:
    """Egalarga xabar. `exclude` — amalni bajargan xodim: ega o'zi qilgan ish haqida o'ziga xabar olmaydi."""
    await notify(
        db,
        business_id=business_id,
        user_ids=[uid for uid in await owner_ids(db, business_id) if uid != exclude],
        event_code=event_code,
        data=data,
        dedup_key=dedup_key,
    )


async def location_staff_ids(db: AsyncSession, location: Location) -> list[int]:
    """Shu joyda ishlaydigan faol xodimlar: do'konda — sotuvchilar, skladda — omborchilar."""
    role = "seller" if location.type == "store" else "warehouse"
    rows = await db.scalars(
        select(User.id)
        .outerjoin(
            UserLocation,
            and_(UserLocation.user_id == User.id, UserLocation.location_id == location.id),
        )
        .where(
            User.business_id == location.business_id,
            User.role == role,
            User.is_active,
            or_(User.all_locations, UserLocation.location_id.is_not(None)),
        )
    )
    return list(rows.all())


async def release(db: AsyncSession, business_id: int, dedup_key: str) -> None:
    """Hodisa tugadi (masalan, tovar to'ldirildi) — kalit bo'shatiladi: yana takrorlansa, yangi xabar keladi."""
    await db.execute(
        update(Notification)
        .where(Notification.business_id == business_id, Notification.dedup_key == dedup_key)
        .values(dedup_key=None)
    )


async def resolve(db: AsyncSession, business_id: int, dedup_key: str) -> None:
    """Ish bajarildi (masalan, ko'chirishni kimdir qabul qildi) — shu haqdagi xabarlar hammada o'qilgan bo'ladi."""
    await db.execute(
        update(Notification)
        .where(
            Notification.business_id == business_id,
            Notification.dedup_key == dedup_key,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )


# ====================== O'qish ======================


async def unread_count(ctx: AuthContext) -> int:
    count = await ctx.db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == ctx.user.id, Notification.read_at.is_(None))
    )
    return count or 0


async def list_notifications(
    ctx: AuthContext,
    *,
    event: str | None = None,
    kind: str | None = None,
    unread_only: bool = False,
    cursor: int | None = None,
    limit: int = 30,
) -> NotificationPage:
    query = select(Notification).where(Notification.user_id == ctx.user.id)
    if event:
        query = query.where(Notification.event_code == event)
    if kind in KIND_PREFIXES:
        query = query.where(Notification.event_code.like(f"{KIND_PREFIXES[kind]}.%"))
    elif kind == "other":
        query = query.where(
            and_(*(Notification.event_code.not_like(f"{prefix}.%") for prefix in KIND_PREFIXES.values()))
        )
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    if cursor is not None:
        query = query.where(Notification.id < cursor)
    rows = (await ctx.db.scalars(query.order_by(Notification.id.desc()).limit(limit + 1))).all()
    page = rows[:limit]
    return NotificationPage(
        items=[
            NotificationOut(
                id=row.id,
                event_code=row.event_code,
                data=row.data,
                created_at=row.created_at,
                read=row.read_at is not None,
            )
            for row in page
        ],
        next_cursor=page[-1].id if len(rows) > limit else None,
        unread=await unread_count(ctx),
    )


async def mark_read(ctx: AuthContext, notification_id: int) -> None:
    row = await ctx.db.get(Notification, notification_id)
    if row is None or row.user_id != ctx.user.id:  # begona xodimning xabari — "yo'q" bilan bir xil
        raise AppError(404, "notification_not_found")
    if row.read_at is None:
        row.read_at = datetime.now(UTC)


async def mark_all_read(ctx: AuthContext) -> None:
    await ctx.db.execute(
        update(Notification)
        .where(Notification.user_id == ctx.user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )


# ====================== Real vaqt ======================


async def stream(
    business_id: int, user_id: int, lifetime: float = STREAM_SECONDS
) -> AsyncIterator[str]:
    """Server-Sent Events: yangi xabar yozilganda "data: new" yuboradi; orada — ulanishni tirik tutadigan izoh.

    Bazaga tegmaydi — faqat Redis'dagi signalni tinglaydi; mazmunni brauzer oddiy so'rov bilan oladi.
    """
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(_channel(business_id, user_id))
    # Redis avval "obuna bo'ldingiz" degan xizmat xabarini yuboradi — uni o'qib tashlaymiz,
    # aks holda birinchi kutish darhol bo'sh qaytadi
    await pubsub.get_message(timeout=1.0)
    loop = asyncio.get_running_loop()
    deadline = loop.time() + lifetime
    try:
        yield ": connected\n\n"
        while loop.time() < deadline:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=min(HEARTBEAT_SECONDS, max(deadline - loop.time(), 0.01)),
            )
            yield "data: new\n\n" if message else ": ping\n\n"
    finally:
        await pubsub.aclose()
