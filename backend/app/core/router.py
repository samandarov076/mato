"""Biznes sozlamalari (/api/settings) va harakatlar jurnali (/api/audit-logs). Faqat biznes egalari uchun."""
import json
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Response
from sqlalchemy import select, tuple_

from app.core.audit import Category, log_event
from app.core.deps import OwnerAuth
from app.core.errors import AppError
from app.core.models import AuditLog
from app.core.schemas import (
    AuditItem,
    AuditLocation,
    AuditPage,
    AuditUser,
    BusinessNameIn,
    SettingsBody,
)
from app.modules.auth.models import User
from app.modules.reports.export import EXPORT_ROWS, download, local_time
from app.modules.reports.labels import labels
from app.modules.structure.models import Location

settings_router = APIRouter(prefix="/settings", tags=["sozlamalar"])
audit_router = APIRouter(prefix="/audit-logs", tags=["jurnal"])

_SETTING_FIELDS = tuple(SettingsBody.model_fields)


def _plain(value):
    """Jurnalga (JSON) yoziladigan ko'rinish."""
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value) if isinstance(value, Decimal) else value


# ---------- Sozlamalar ----------


@settings_router.get("")
async def read_settings(ctx: OwnerAuth) -> SettingsBody:
    return SettingsBody.model_validate(ctx.business)


@settings_router.put("")
async def update_settings(body: SettingsBody, ctx: OwnerAuth) -> SettingsBody:
    changes = {}
    for field in _SETTING_FIELDS:
        old, new = getattr(ctx.business, field), getattr(body, field)
        if old != new:
            changes[field] = {"old": _plain(old), "new": _plain(new)}
            setattr(ctx.business, field, new)
    if changes:  # o'zgarish bo'lmasa jurnalga ham yozilmaydi
        log_event(
            ctx.db,
            business_id=ctx.business.id,
            user_id=ctx.user.id,
            category="staff",
            event_code="settings.changed",
            data={"changes": changes},
        )
    return SettingsBody.model_validate(ctx.business)


@settings_router.put("/name", status_code=204)
async def rename_business(body: BusinessNameIn, ctx: OwnerAuth) -> None:
    """Biznes nomi — yuqori panelda, cheklarda va platforma panelida ko'rinadi."""
    if body.name != ctx.business.name:
        log_event(
            ctx.db,
            business_id=ctx.business.id,
            user_id=ctx.user.id,
            category="staff",
            event_code="business.renamed",
            data={"old": ctx.business.name, "new": body.name},
        )
        ctx.business.name = body.name


# ---------- Jurnal ----------


def _encode_cursor(created_at: datetime, log_id: int) -> str:
    return f"{created_at.isoformat()}|{log_id}"


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        created_at, log_id = cursor.rsplit("|", 1)
        return datetime.fromisoformat(created_at), int(log_id)
    except ValueError:
        raise AppError(400, "invalid_cursor") from None


@audit_router.get("/export")
async def export_audit_logs(
    ctx: OwnerAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: int | None = None,
    location_id: int | None = None,
    category: Category | None = None,
    exclude_category: Category | None = None,
) -> Response:
    """Harakatlar jurnali Excel faylida — sahifadagi filtrlar bilan. Hodisa kodi va ma'lumoti chiqadi
    (matni interfeysda tarjima qilinadi)."""
    t = labels(ctx.user.language)
    rows: list[list] = []
    cursor: str | None = None
    while len(rows) < EXPORT_ROWS:
        page = await list_audit_logs(
            ctx,
            date_from=date_from,
            date_to=date_to,
            user_id=user_id,
            location_id=location_id,
            category=category,
            exclude_category=exclude_category,
            cursor=cursor,
            limit=200,
        )
        rows.extend(
            [
                local_time(item.created_at, ctx.business.timezone),
                item.user.full_name if item.user else t["system"],
                item.location.name if item.location else "",
                t[f"cat_{item.category}"],
                item.event_code,
                json.dumps(item.data, ensure_ascii=False) if item.data else "",
            ]
            for item in page.items
        )
        cursor = page.next_cursor
        if cursor is None:
            break
    keys = ("time", "user", "place", "category", "event", "details")
    return download("jurnal", [(t["journal"], [t[key] for key in keys], rows[:EXPORT_ROWS])])


@audit_router.get("")
async def list_audit_logs(
    ctx: OwnerAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    user_id: int | None = None,
    location_id: int | None = None,
    category: Category | None = None,
    # Shu kategoriyasiz: jurnal standart holatda kirish-chiqishsiz ochiladi (`exclude_category=login`)
    exclude_category: Category | None = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditPage:
    """Eng yangi yozuvlar birinchi. Sahifalash kursor bilan — jurnal qancha katta bo'lsa ham tez."""
    query = (
        select(AuditLog, User, Location)
        .outerjoin(User, User.id == AuditLog.user_id)
        .outerjoin(Location, Location.id == AuditLog.location_id)
        # (business_id, created_at) indeksi bo'yicha; id — bir tranzaksiyadagi yozuvlar tartibi uchun
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit + 1)
    )
    # Kun chegaralari biznes vaqti bo'yicha (Asia/Tashkent)
    zone = ZoneInfo(ctx.business.timezone)
    if date_from is not None:
        query = query.where(AuditLog.created_at >= datetime.combine(date_from, time.min, zone))
    if date_to is not None:
        end = datetime.combine(date_to + timedelta(days=1), time.min, zone)
        query = query.where(AuditLog.created_at < end)
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if location_id is not None:
        query = query.where(AuditLog.location_id == location_id)
    if category is not None:
        query = query.where(AuditLog.category == category)
    if exclude_category is not None:
        query = query.where(AuditLog.category != exclude_category)
    if cursor is not None:
        query = query.where(
            tuple_(AuditLog.created_at, AuditLog.id) < tuple_(*_decode_cursor(cursor))
        )

    rows = (await ctx.db.execute(query)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        AuditItem(
            id=log.id,
            created_at=log.created_at,
            category=log.category,
            event_code=log.event_code,
            data=log.data,
            user=AuditUser(id=user.id, full_name=user.full_name) if user else None,
            location=(
                AuditLocation(id=location.id, name=location.name, type=location.type)
                if location
                else None
            ),
        )
        for log, user, location in rows
    ]
    next_cursor = _encode_cursor(rows[-1][0].created_at, rows[-1][0].id) if has_more else None
    return AuditPage(items=items, next_cursor=next_cursor)
