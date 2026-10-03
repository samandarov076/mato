"""Ko'chirish mantiqi — ikki bosqichli: jo'natish → qabul.

Jo'natilganda metr jo'natuvchi joydan chiqadi ("yo'lda" — hech qaysi joy qoldig'ida emas), qabulda
haqiqatda kelgan metr qabul qiluvchi joyga kiradi. Farq (jo'natilgan − kelgan) faqat ko'chirish
qatorida turadi va "Metr farqi" hisobotida alohida ko'rinadi.

Kim nima qila oladi (docs/03-details/05-ombor.md):
- jo'natish — biznes egasi (istalgan joydan), omborchi (o'z skladidan);
- qabul — do'konga: shu do'kon sotuvchisi; skladga: shu sklad omborchisi; biznes egasi — har qanday;
- yo'ldagi ko'chirishni bekor qilish — jo'natuvchi yoki biznes egasi.
"""
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_, select

from app.core.audit import log_event
from app.core.counters import next_numbers
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.inventory.models import BatchStock, Transfer, TransferLine
from app.modules.inventory.schemas import (
    Place,
    ReceiveIn,
    Ref,
    Sendable,
    TransferCard,
    TransferCreate,
    TransferLineOut,
    TransferOptions,
    TransferPage,
    TransferRow,
)
from app.modules.inventory.service import _day_range, _like, roll_length, rolls_estimate, sku_brief
from app.modules.inventory.stock import lock_stock, move_stock
from app.modules.notifications import service as notifications
from app.modules.receiving.models import Batch, Receipt
from app.modules.structure.access import allowed_location_ids, can_act_at
from app.modules.structure.models import Location

SENDABLE_LIMIT = 200


def _field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields={field: problem})


def _place(location: Location) -> Place:
    return Place(id=location.id, name=location.name, type=location.type)


def _log(ctx: AuthContext, event_code: str, location_id: int, **data: Any) -> None:
    log_event(
        ctx.db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        location_id=location_id,
        category="stock",
        event_code=event_code,
        data=data,
    )


async def _can_send_from(ctx: AuthContext, location: Location) -> bool:
    """Ega — istalgan joydan; omborchi — o'z skladidan. Sotuvchi ko'chirish yaratmaydi."""
    return ctx.user.role != "seller" and await can_act_at(ctx, location)


# ====================== Forma uchun ======================


async def options(ctx: AuthContext) -> TransferOptions:
    locations = (
        await ctx.db.scalars(
            select(Location).where(Location.is_active).order_by(Location.type.desc(), Location.name)
        )
    ).all()
    return TransferOptions(
        sources=[_place(row) for row in locations if await _can_send_from(ctx, row)],
        targets=[_place(row) for row in locations],
    )


async def sendable(ctx: AuthContext, location_id: int, search: str | None = None) -> list[Sendable]:
    """Shu joydan jo'natsa bo'ladigan partiyalar: ochiq va qoldig'i bor. Eski partiya tepada."""
    location = await ctx.db.get(Location, location_id)
    if location is None:
        raise _field_error("location_id", "invalid")
    if not await _can_send_from(ctx, location):
        raise AppError(403, "location_forbidden")
    query = (
        select(BatchStock.qty_m, Batch, Sku, Fabric, Color, Pattern)
        .select_from(BatchStock)
        .join(Batch, Batch.id == BatchStock.batch_id)
        .join(Receipt, Receipt.id == Batch.receipt_id)
        .join(Sku, Sku.id == Batch.sku_id)
        .join(Fabric, Fabric.id == Sku.fabric_id)
        .join(Color, Color.id == Sku.color_id)
        .join(Pattern, Pattern.id == Sku.pattern_id)
        .where(
            BatchStock.location_id == location.id,
            BatchStock.status == "open",
            BatchStock.qty_m > 0,
            Receipt.status == "active",
        )
    )
    if search and search.strip():
        like = _like(search)
        query = query.where(
            or_(
                *(
                    column.ilike(like, escape="\\")
                    for column in (
                        Batch.number, Fabric.code, Fabric.name,
                        Color.code, Color.name, Pattern.code, Pattern.name,
                    )
                )
            )
        )  # fmt: skip
    return [
        Sendable(
            batch_id=batch.id,
            number=batch.number,
            sku=sku_brief(sku, fabric, color, pattern),
            qty_m=qty_m,
            rolls=rolls_estimate(batch, qty_m),
            roll_m=roll_length(batch),
        )
        for qty_m, batch, sku, fabric, color, pattern in await ctx.db.execute(
            query.order_by(Batch.id).limit(SENDABLE_LIMIT)
        )
    ]


# ====================== Jo'natish ======================


async def create_transfer(ctx: AuthContext, body: TransferCreate) -> Transfer:
    source = await ctx.db.get(Location, body.from_location_id)
    target = await ctx.db.get(Location, body.to_location_id)
    if source is None or not source.is_active:
        raise _field_error("from_location_id", "invalid")
    if target is None or not target.is_active:
        raise _field_error("to_location_id", "invalid")
    if source.id == target.id:
        raise _field_error("to_location_id", "same")
    if not await _can_send_from(ctx, source):
        raise AppError(403, "location_forbidden")
    batch_ids = [line.batch_id for line in body.lines]
    if len(set(batch_ids)) != len(batch_ids):
        raise _field_error("lines", "duplicate")

    number = (await next_numbers(ctx.db, ctx.business.id, "transfer"))[0]
    transfer = Transfer(
        business_id=ctx.business.id,
        number=f"K-{number:05d}",
        from_location_id=source.id,
        to_location_id=target.id,
        note=body.note or None,
        sent_by=ctx.user.id,
    )
    ctx.db.add(transfer)
    await ctx.db.flush()

    total = Decimal(0)
    # Partiyalar doim bir xil tartibda qulflanadi — ikki ko'chirish bir-birini kutib qolmaydi
    for line in sorted(body.lines, key=lambda item: item.batch_id):
        batch = await ctx.db.get(Batch, line.batch_id)
        stock = await lock_stock(ctx.db, line.batch_id, source.id) if batch else None
        if batch is None or stock is None or stock.status != "open":
            raise AppError(409, "batch_not_open")
        if line.meters > stock.qty_m:
            raise AppError(
                409, "not_enough_stock", batch=batch.number, available=str(stock.qty_m)
            )
        ctx.db.add(
            TransferLine(
                business_id=ctx.business.id,
                transfer_id=transfer.id,
                batch_id=batch.id,
                sent_rolls=line.rolls,
                sent_m=line.meters,
            )
        )
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=batch.id,
            location_id=source.id,
            qty_m=-line.meters,
            type="transfer_out",
            ref_type="transfer",
            ref_id=transfer.id,
            user_id=ctx.user.id,
        )
        total += line.meters

    meters = str(total.quantize(Decimal("0.01")))
    _log(
        ctx,
        "transfer.sent",
        source.id,
        name=transfer.number,
        to=target.name,
        batches=len(body.lines),
        meters=meters,
    )
    # Qabul qiluvchi joy xodimlariga: "ko'chirish keldi — qabul qiling" (jo'natuvchining o'ziga emas)
    await notifications.notify(
        ctx.db,
        business_id=ctx.business.id,
        user_ids=[
            uid for uid in await notifications.location_staff_ids(ctx.db, target) if uid != ctx.user.id
        ],
        event_code="transfer.arrived",
        data={
            "transfer_id": transfer.id,
            "number": transfer.number,
            "source": source.name,
            "target": target.name,
            "batches": len(body.lines),
            "meters": meters,
        },
        dedup_key=_arrived_key(transfer.id),
    )
    return transfer


# ====================== Ro'yxat va kartochka ======================


async def _scope(ctx: AuthContext) -> list:
    """Xodim ko'ra oladigan ko'chirishlar: ega — hammasi; omborchi — o'z skladlariga tegishli;
    sotuvchi — o'z do'koniga tegishli."""
    if ctx.user.role == "seller":
        store_id = ctx.store.id if ctx.store else -1
        return [or_(Transfer.from_location_id == store_id, Transfer.to_location_id == store_id)]
    allowed = await allowed_location_ids(ctx, "warehouse")
    if allowed is None:
        return []
    return [or_(Transfer.from_location_id.in_(allowed), Transfer.to_location_id.in_(allowed))]


def _row(
    transfer: Transfer,
    places: dict[int, Location],
    users: dict[int, str],
    lines_count: int,
    sent_m: Decimal,
    received_m: Decimal | None,
    has_diff: bool,
) -> dict[str, Any]:
    def user(user_id: int | None) -> Ref | None:
        return Ref(id=user_id, name=users[user_id]) if user_id is not None else None

    return {
        "id": transfer.id,
        "number": transfer.number,
        "status": transfer.status,
        "source": _place(places[transfer.from_location_id]),
        "target": _place(places[transfer.to_location_id]),
        "lines_count": lines_count,
        "sent_m": sent_m,
        "received_m": received_m,
        "has_diff": has_diff,
        "sent_by": user(transfer.sent_by),
        "sent_at": transfer.sent_at,
        "received_by": user(transfer.received_by),
        "received_at": transfer.received_at,
    }


async def _lookups(ctx: AuthContext) -> tuple[dict[int, Location], dict[int, str]]:
    places = {row.id: row for row in (await ctx.db.scalars(select(Location))).all()}
    users = dict((await ctx.db.execute(select(User.id, User.full_name))).all())
    return places, users


async def list_transfers(
    ctx: AuthContext,
    *,
    status: str | None = None,
    location_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TransferPage:
    conditions = await _scope(ctx)
    if status is not None:
        conditions.append(Transfer.status == status)
    if location_id is not None:
        conditions.append(
            or_(Transfer.from_location_id == location_id, Transfer.to_location_id == location_id)
        )
    conditions.extend(_day_range(ctx, date_from, date_to, Transfer.sent_at))

    differs = or_(
        TransferLine.received_m != TransferLine.sent_m,
        TransferLine.received_rolls != TransferLine.sent_rolls,
    )
    totals = (
        select(
            TransferLine.transfer_id,
            func.count().label("lines"),
            func.sum(TransferLine.sent_m).label("sent"),
            func.sum(TransferLine.received_m).label("received"),
            func.bool_or(and_(TransferLine.received_m.is_not(None), differs)).label("diff"),
        )
        .group_by(TransferLine.transfer_id)
        .subquery()
    )
    rows = (
        await ctx.db.execute(
            select(Transfer, totals.c.lines, totals.c.sent, totals.c.received, totals.c.diff)
            .join(totals, totals.c.transfer_id == Transfer.id)
            .where(*conditions)
            # Yo'ldagilar tepada — qabul kutayotgani darhol ko'rinadi
            .order_by((Transfer.status == "in_transit").desc(), Transfer.sent_at.desc(), Transfer.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = await ctx.db.scalar(select(func.count()).select_from(Transfer).where(*conditions))
    places, users = await _lookups(ctx)
    return TransferPage(
        items=[
            TransferRow(**_row(transfer, places, users, lines, sent, received, bool(diff)))
            for transfer, lines, sent, received, diff in rows
        ],
        total=total or 0,
    )


async def _transfer(ctx: AuthContext, transfer_id: int, *, lock: bool = False) -> Transfer:
    query = select(Transfer).where(Transfer.id == transfer_id, *await _scope(ctx))
    if lock:  # qabul va bekor qilish bir vaqtda kelsa — biri ikkinchisini kutadi
        query = query.with_for_update().execution_options(populate_existing=True)
    transfer = await ctx.db.scalar(query)
    if transfer is None:
        raise AppError(404, "transfer_not_found")
    return transfer


async def get_transfer(ctx: AuthContext, transfer_id: int) -> TransferCard:
    transfer = await _transfer(ctx, transfer_id)
    places, users = await _lookups(ctx)
    lines = [
        TransferLineOut(
            id=line.id,
            batch_id=batch.id,
            batch_number=batch.number,
            sku=sku_brief(sku, fabric, color, pattern),
            sent_rolls=line.sent_rolls,
            sent_m=line.sent_m,
            received_rolls=line.received_rolls,
            received_m=line.received_m,
            roll_m=roll_length(batch),
        )
        for line, batch, sku, fabric, color, pattern in await ctx.db.execute(
            select(TransferLine, Batch, Sku, Fabric, Color, Pattern)
            .join(Batch, Batch.id == TransferLine.batch_id)
            .join(Sku, Sku.id == Batch.sku_id)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
            .where(TransferLine.transfer_id == transfer.id)
            .order_by(TransferLine.id)
        )
    ]
    received = transfer.status == "received"
    in_transit = transfer.status == "in_transit"
    return TransferCard(
        **_row(
            transfer,
            places,
            users,
            len(lines),
            sum((line.sent_m for line in lines), Decimal(0)),
            sum((line.received_m or Decimal(0) for line in lines), Decimal(0)) if received else None,
            received
            and any(
                line.received_m != line.sent_m or line.received_rolls != line.sent_rolls
                for line in lines
            ),
        ),
        note=transfer.note,
        receive_note=transfer.receive_note,
        cancelled_by=Ref(id=transfer.cancelled_by, name=users[transfer.cancelled_by])
        if transfer.cancelled_by is not None
        else None,
        cancelled_at=transfer.cancelled_at,
        lines=lines,
        can_receive=in_transit and await can_act_at(ctx, places[transfer.to_location_id]),
        can_cancel=in_transit
        and (ctx.user.role == "owner" or transfer.sent_by == ctx.user.id),
    )


# ====================== Qabul qilish va bekor qilish ======================


def _arrived_key(transfer_id: int) -> str:
    return f"transfer_arrived:{transfer_id}"


def waiting_key(transfer_id: int) -> str:
    return f"transfer_waiting:{transfer_id}"


async def _settle(ctx: AuthContext, transfer_id: int) -> None:
    """Ko'chirish yo'ldan chiqdi (qabul qilindi yoki bekor bo'ldi) — "qabul qiling" va "kutyapti" xabarlari
    hammada o'qilgan bo'ladi."""
    for key in (_arrived_key(transfer_id), waiting_key(transfer_id)):
        await notifications.resolve(ctx.db, ctx.business.id, key)


async def receive_transfer(ctx: AuthContext, transfer_id: int, body: ReceiveIn) -> None:
    """Qabul qiluvchi har qator bo'yicha haqiqatda kelgan rulon va metrni tasdiqlaydi."""
    transfer = await _transfer(ctx, transfer_id, lock=True)
    if transfer.status != "in_transit":
        raise AppError(409, "transfer_not_in_transit")
    target = await ctx.db.get(Location, transfer.to_location_id)
    if not await can_act_at(ctx, target):
        raise AppError(403, "location_forbidden")

    lines = (
        await ctx.db.scalars(
            select(TransferLine)
            .where(TransferLine.transfer_id == transfer.id)
            .order_by(TransferLine.batch_id)
        )
    ).all()
    arrived = {line.line_id: line for line in body.lines}
    if set(arrived) != {line.id for line in lines} or len(arrived) != len(body.lines):
        raise _field_error("lines", "invalid")  # har qator bir marta tasdiqlanishi kerak
    differs = any(
        arrived[line.id].meters != line.sent_m or arrived[line.id].rolls != line.sent_rolls
        for line in lines
    )
    if differs and not body.note:
        raise _field_error("note", "required")  # farq bo'lsa izoh majburiy

    missing = Decimal(0)
    for line in lines:
        got = arrived[line.id]
        line.received_rolls, line.received_m = got.rolls, got.meters
        missing += line.sent_m - got.meters
        if got.meters > 0:
            await move_stock(
                ctx.db,
                business_id=ctx.business.id,
                batch_id=line.batch_id,
                location_id=target.id,
                qty_m=got.meters,
                received_m=got.meters,
                type="transfer_in",
                status="open",  # partiya bu joyda yopilgan bo'lsa — qayta ochiladi
                ref_type="transfer",
                ref_id=transfer.id,
                user_id=ctx.user.id,
            )
    transfer.status = "received"
    transfer.received_by = ctx.user.id
    transfer.received_at = datetime.now(UTC)
    transfer.receive_note = body.note or None
    _log(ctx, "transfer.received", target.id, name=transfer.number, diff=str(missing) if differs else None)
    await _settle(ctx, transfer.id)
    if differs:
        await notifications.notify_owners(
            ctx.db,
            ctx.business.id,
            "transfer.diff",
            {
                "transfer_id": transfer.id,
                "number": transfer.number,
                "target": target.name,
                "diff": str(missing),
                "by": ctx.user.full_name,
            },
            exclude=ctx.user.id,
        )


async def cancel_transfer(ctx: AuthContext, transfer_id: int) -> None:
    """Yo'ldagi ko'chirishni bekor qiladi — metr jo'natuvchi joyga qaytadi."""
    transfer = await _transfer(ctx, transfer_id, lock=True)
    if transfer.status != "in_transit":
        raise AppError(409, "transfer_not_in_transit")
    if ctx.user.role != "owner" and transfer.sent_by != ctx.user.id:
        raise AppError(403, "forbidden")

    lines = (
        await ctx.db.scalars(
            select(TransferLine)
            .where(TransferLine.transfer_id == transfer.id)
            .order_by(TransferLine.batch_id)
        )
    ).all()
    for line in lines:
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=line.batch_id,
            location_id=transfer.from_location_id,
            qty_m=line.sent_m,
            type="transfer_cancel",
            status="open",
            ref_type="transfer",
            ref_id=transfer.id,
            user_id=ctx.user.id,
        )
    transfer.status = "cancelled"
    transfer.cancelled_by = ctx.user.id
    transfer.cancelled_at = datetime.now(UTC)
    _log(ctx, "transfer.cancelled", transfer.from_location_id, name=transfer.number)
    await _settle(ctx, transfer.id)
