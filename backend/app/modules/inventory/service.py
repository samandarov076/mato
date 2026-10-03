"""Ombor mantiqi: joylar bo'yicha qoldiq, partiya kartochkasi, partiyani yopish va metr farqi.

Qoldiq har (partiya, joy) bo'yicha metrda yuritiladi; rulonlar soni — taxminiy (qoldiq ÷ o'rtacha rulon
uzunligi). Qoldiqni faqat `stock.move_stock` o'zgartiradi. Ko'chirishlar — `transfers.py` da.
"""
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import func, literal, or_, select
from sqlalchemy.sql import Select

from app.core.audit import log_event
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.catalog.service import sku_code
from app.modules.inventory.models import (
    BatchClosure,
    BatchStock,
    StockMovement,
    Transfer,
    TransferLine,
)
from app.modules.inventory.schemas import (
    BatchCard,
    BatchPlace,
    ClosureDiff,
    ClosureOut,
    Differences,
    DifferenceTotals,
    MovementOut,
    Place,
    PlaceTotal,
    ReceiptBrief,
    Ref,
    SkuBrief,
    StockBatch,
    StockCell,
    StockPage,
    StockSku,
    TransferDiff,
    TransitOut,
)
from app.modules.inventory.stock import lock_stock, move_stock
from app.modules.notifications import service as notifications
from app.modules.receiving.models import Batch, Receipt
from app.modules.sales.models import Sale
from app.modules.structure.access import can_act_at, visible_location_ids
from app.modules.structure.models import Location

MOVEMENTS_LIMIT = 200
# Partiya yopilganda farq kirgan metrning shu ulushidan katta bo'lsa — egalarga xabar boradi
BIG_DIFFERENCE = Decimal("0.10")
DIFFERENCES_LIMIT = 500
ZERO = Decimal(0)


def sku_brief(sku: Sku, fabric: Fabric, color: Color, pattern: Pattern) -> SkuBrief:
    return SkuBrief(
        id=sku.id,
        code=sku_code(fabric, color, pattern),
        fabric_name=fabric.name,
        color_name=color.name,
        pattern_name=None if pattern.is_plain else pattern.name,
        hex=color.hex,
        image_url=pattern.image_url or color.image_url,
    )


def roll_length(batch: Batch) -> Decimal:
    """Partiyaning o'rtacha rulon uzunligi (metr)."""
    return (batch.meters_labeled / batch.rolls_count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rolls_estimate(batch: Batch, qty_m: Decimal) -> int:
    """Taxminiy rulonlar soni: qoldiq metr ÷ o'rtacha rulon uzunligi."""
    if qty_m <= 0:
        return 0
    return int((qty_m * batch.rolls_count / batch.meters_labeled).quantize(Decimal(1), ROUND_HALF_UP))


def amount(meters: Decimal, cost_per_m: int) -> int:
    return int((meters * cost_per_m).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _like(search: str) -> str:
    escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _place(location: Location) -> Place:
    return Place(id=location.id, name=location.name, type=location.type)


# Qoldiq qatorlari: partiya → kirim (bekor qilinmagan) → SKU → mato, rang, gul
def _stock_rows(*columns: Any) -> Select:
    return (
        select(*columns)
        .select_from(BatchStock)
        .join(Batch, Batch.id == BatchStock.batch_id)
        .join(Receipt, Receipt.id == Batch.receipt_id)
        .join(Sku, Sku.id == Batch.sku_id)
        .join(Fabric, Fabric.id == Sku.fabric_id)
        .join(Color, Color.id == Sku.color_id)
        .join(Pattern, Pattern.id == Sku.pattern_id)
        .where(BatchStock.status == "open", Receipt.status == "active")
    )


# ====================== Qoldiq ======================


async def list_stock(
    ctx: AuthContext,
    *,
    location_id: int | None = None,
    fabric_id: int | None = None,
    color_id: int | None = None,
    pattern_id: int | None = None,
    search: str | None = None,
    only: Literal["low", "negative", "in_transit"] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> StockPage:
    """Qoldiq: SKU bo'yicha → ichida partiyalar → har joydagi metr va taxminiy rulon."""
    visible = await visible_location_ids(ctx)
    in_scope = [] if visible is None else [BatchStock.location_id.in_(visible)]
    default = ctx.business.low_stock_default
    threshold = func.coalesce(Sku.low_stock_threshold, literal(default))

    conditions = list(in_scope)
    if location_id is not None:
        conditions.append(BatchStock.location_id == location_id)
    if fabric_id is not None:
        conditions.append(Sku.fabric_id == fabric_id)
    if color_id is not None:
        conditions.append(Sku.color_id == color_id)
    if pattern_id is not None:
        conditions.append(Sku.pattern_id == pattern_id)
    if search and search.strip():
        like = _like(search)
        conditions.append(
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
    if only == "negative":
        conditions.append(BatchStock.qty_m < 0)
    elif only == "in_transit":
        conditions.append(
            Batch.id.in_(
                select(TransferLine.batch_id)
                .join(Transfer, Transfer.id == TransferLine.transfer_id)
                .where(Transfer.status == "in_transit")
            )
        )
    elif only == "low":
        # SKU'ning biror joydagi jami qoldig'i chegaradan past
        low = (
            _stock_rows(Batch.sku_id)
            .where(*in_scope)
            .group_by(Batch.sku_id, BatchStock.location_id, Sku.low_stock_threshold)
            .having(func.sum(BatchStock.qty_m) < threshold)
        )
        if location_id is not None:
            low = low.where(BatchStock.location_id == location_id)
        conditions.append(Sku.id.in_(low))

    sku_ids = (
        await ctx.db.scalars(
            _stock_rows(Sku.id)
            .where(*conditions)
            .group_by(Sku.id, Fabric.code, Color.code, Pattern.is_plain, Pattern.code)
            .order_by(
                func.lower(Fabric.code),
                func.lower(Color.code),
                Pattern.is_plain.desc(),
                func.lower(Pattern.code),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = await ctx.db.scalar(
        select(func.count()).select_from(
            _stock_rows(Sku.id).where(*conditions).group_by(Sku.id).subquery()
        )
    )

    locations = (
        await ctx.db.scalars(
            select(Location)
            .where(*([] if visible is None else [Location.id.in_(visible)]))
            # Faol joylar va (faolsiz bo'lsa ham) qoldig'i bor joylar
            .where(
                or_(
                    Location.is_active,
                    Location.id.in_(select(BatchStock.location_id).where(BatchStock.qty_m != 0)),
                )
            )
            .order_by(Location.type.desc(), Location.name)
        )
    ).all()
    if not sku_ids:
        return StockPage(items=[], total=total or 0, locations=[_place(row) for row in locations])

    # Sahifadagi SKU'larning barcha ochiq qoldiq qatorlari (filtr faqat SKU tanlashga ta'sir qiladi)
    rows = (
        await ctx.db.execute(
            _stock_rows(BatchStock, Batch, Receipt.receipt_date)
            .where(*in_scope, Batch.sku_id.in_(sku_ids))
            .order_by(Batch.id)
        )
    ).all()
    skus = {
        row[0].id: row
        for row in await ctx.db.execute(
            select(Sku, Fabric, Color, Pattern)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
            .where(Sku.id.in_(sku_ids))
        )
    }
    transit = dict(
        (
            await ctx.db.execute(
                select(TransferLine.batch_id, func.sum(TransferLine.sent_m))
                .join(Transfer, Transfer.id == TransferLine.transfer_id)
                .join(Batch, Batch.id == TransferLine.batch_id)
                .where(Transfer.status == "in_transit", Batch.sku_id.in_(sku_ids))
                .group_by(TransferLine.batch_id)
            )
        ).all()
    )

    items = []
    for sku_id in sku_ids:
        sku, fabric, color, pattern = skus[sku_id]
        batches: dict[int, StockBatch] = {}
        per_place: dict[int, Decimal] = {}
        for stock, batch, receipt_date in rows:
            if batch.sku_id != sku_id:
                continue
            entry = batches.setdefault(
                batch.id,
                StockBatch(
                    id=batch.id,
                    number=batch.number,
                    receipt_date=receipt_date,
                    stocks=[],
                    in_transit_m=transit.get(batch.id, ZERO),
                ),
            )
            entry.stocks.append(
                StockCell(
                    location_id=stock.location_id,
                    qty_m=stock.qty_m,
                    rolls=rolls_estimate(batch, stock.qty_m),
                )
            )
            per_place[stock.location_id] = per_place.get(stock.location_id, ZERO) + stock.qty_m
        limit_m = sku.low_stock_threshold if sku.low_stock_threshold is not None else default
        items.append(
            StockSku(
                sku=sku_brief(sku, fabric, color, pattern),
                total_m=sum(per_place.values(), ZERO),
                in_transit_m=sum((b.in_transit_m for b in batches.values()), ZERO),
                threshold=limit_m,
                totals=[
                    PlaceTotal(
                        location_id=place_id,
                        qty_m=qty,
                        low=limit_m is not None and qty < limit_m,
                    )
                    for place_id, qty in per_place.items()
                ],
                batches=list(batches.values()),
            )
        )
    return StockPage(items=items, total=total or 0, locations=[_place(row) for row in locations])


async def low_stock_counts(ctx: AuthContext) -> tuple[dict[int, int], int]:
    """Kam qoldiqdagi SKU'lar soni: ({joy: soni}, biror joyda kam bo'lgan SKU'lar soni) — bitta so'rovda.
    `list_stock(only="low")` dagi qoida bilan bir xil: SKU'ning shu joydagi jami qoldig'i chegaradan past."""
    visible = await visible_location_ids(ctx)
    threshold = func.coalesce(Sku.low_stock_threshold, literal(ctx.business.low_stock_default))
    low = (
        _stock_rows(Batch.sku_id.label("sku_id"), BatchStock.location_id.label("location_id"))
        .where(*([] if visible is None else [BatchStock.location_id.in_(visible)]))
        .group_by(Batch.sku_id, BatchStock.location_id, Sku.low_stock_threshold)
        .having(func.sum(BatchStock.qty_m) < threshold)
        .subquery()
    )
    rows = (await ctx.db.execute(select(low.c.location_id, low.c.sku_id))).all()
    per_place: dict[int, int] = {}
    for location_id, _ in rows:
        per_place[location_id] = per_place.get(location_id, 0) + 1
    return per_place, len({sku_id for _, sku_id in rows})


# ====================== Partiya kartochkasi ======================


async def find_batch(ctx: AuthContext, number: str) -> int:
    """Skaner uchun: partiya raqami bo'yicha id."""
    batch_id = await ctx.db.scalar(
        select(Batch.id).where(func.upper(Batch.number) == number.strip().upper())
    )
    if batch_id is None:
        raise AppError(404, "batch_not_found")
    return batch_id


async def _batch(ctx: AuthContext, batch_id: int) -> Batch:
    batch = await ctx.db.get(Batch, batch_id)  # RLS: begona biznes partiyasi ko'rinmaydi
    if batch is None:
        raise AppError(404, "batch_not_found")
    return batch


async def get_batch(ctx: AuthContext, batch_id: int) -> BatchCard:
    batch = await _batch(ctx, batch_id)
    receipt = await ctx.db.get(Receipt, batch.receipt_id)
    sku, fabric, color, pattern = (
        await ctx.db.execute(
            select(Sku, Fabric, Color, Pattern)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
            .where(Sku.id == batch.sku_id)
        )
    ).one()
    visible = await visible_location_ids(ctx)
    is_owner = ctx.user.role == "owner"

    stocks = (
        await ctx.db.execute(
            select(BatchStock, Location)
            .join(Location, Location.id == BatchStock.location_id)
            .where(BatchStock.batch_id == batch.id)
            .where(*([] if visible is None else [BatchStock.location_id.in_(visible)]))
            .order_by(Location.type.desc(), Location.name)
        )
    ).all()
    # Har joydagi oxirgi (qayta ochilmagan) yopilish
    closures: dict[int, tuple[BatchClosure, str]] = {}
    for closure, closed_by in await ctx.db.execute(
        select(BatchClosure, User.full_name)
        .join(User, User.id == BatchClosure.closed_by)
        .where(BatchClosure.batch_id == batch.id, BatchClosure.reopened_at.is_(None))
        .order_by(BatchClosure.closed_at.desc(), BatchClosure.id.desc())
    ):
        closures.setdefault(closure.location_id, (closure, closed_by))

    places = []
    for stock, location in stocks:
        closed = stock.status == "closed"
        last = closures.get(location.id) if closed else None
        acts = receipt.status == "active" and await can_act_at(ctx, location)
        places.append(
            BatchPlace(
                location=_place(location),
                received_m=stock.received_m,
                qty_m=stock.qty_m,
                rolls=rolls_estimate(batch, stock.qty_m),
                status=stock.status,
                can_close=acts and not closed,
                # Xato yopilgan partiyani ega yoki omborchi qayta ochadi
                can_reopen=acts and closed and last is not None and ctx.user.role != "seller",
                closure=ClosureOut(
                    diff_m=last[0].diff_m,
                    diff_amount=last[0].diff_amount if is_owner else None,
                    note=last[0].note,
                    closed_by=last[1],
                    closed_at=last[0].closed_at,
                )
                if last
                else None,
            )
        )

    names = dict((await ctx.db.execute(select(Location.id, Location.name))).all())
    in_transit = [
        TransitOut(
            transfer_id=transfer.id,
            number=transfer.number,
            source=Ref(id=transfer.from_location_id, name=names[transfer.from_location_id]),
            target=Ref(id=transfer.to_location_id, name=names[transfer.to_location_id]),
            sent_m=sent_m,
        )
        for transfer, sent_m in await ctx.db.execute(
            select(Transfer, TransferLine.sent_m)
            .join(TransferLine, TransferLine.transfer_id == Transfer.id)
            .where(TransferLine.batch_id == batch.id, Transfer.status == "in_transit")
            .order_by(Transfer.id)
        )
    ]

    movement_rows = (
        await ctx.db.execute(
            select(StockMovement, User.full_name)
            .outerjoin(User, User.id == StockMovement.user_id)
            .where(StockMovement.batch_id == batch.id)
            .where(*([] if visible is None else [StockMovement.location_id.in_(visible)]))
            .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
            .limit(MOVEMENTS_LIMIT)
        )
    ).all()
    transfer_ids = {m.ref_id for m, _ in movement_rows if m.ref_type == "transfer"}
    transfer_numbers = (
        dict(
            (
                await ctx.db.execute(
                    select(Transfer.id, Transfer.number).where(Transfer.id.in_(transfer_ids))
                )
            ).all()
        )
        if transfer_ids
        else {}
    )

    sale_ids = {m.ref_id for m, _ in movement_rows if m.ref_type == "sale"}
    sale_numbers = (
        dict((await ctx.db.execute(select(Sale.id, Sale.number).where(Sale.id.in_(sale_ids)))).all())
        if sale_ids
        else {}
    )

    def ref_number(movement: StockMovement) -> str | None:
        if movement.ref_type == "receipt":
            return receipt.number
        if movement.ref_type == "transfer":
            return transfer_numbers.get(movement.ref_id)
        if movement.ref_type == "sale":
            return sale_numbers.get(movement.ref_id)
        return None

    return BatchCard(
        id=batch.id,
        number=batch.number,
        sku=sku_brief(sku, fabric, color, pattern),
        receipt=ReceiptBrief(id=receipt.id, number=receipt.number, receipt_date=receipt.receipt_date),
        rolls_count=batch.rolls_count,
        meters_labeled=batch.meters_labeled,
        kg=batch.kg,
        m_per_kg=batch.m_per_kg,
        cost_per_m=batch.cost_per_m if is_owner else None,  # tannarx sotuvchi va omborchiga ko'rinmaydi
        places=places,
        in_transit=in_transit,
        movements=[
            MovementOut(
                id=movement.id,
                created_at=movement.created_at,
                type=movement.type,
                location=Ref(id=movement.location_id, name=names[movement.location_id]),
                qty_m=movement.qty_m,
                user=user_name,
                ref_type=movement.ref_type,
                ref_id=movement.ref_id,
                ref_number=ref_number(movement),
                note=movement.note,
            )
            for movement, user_name in movement_rows
        ],
    )


# ====================== Yopish va qayta ochish ======================


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


async def _acting_location(ctx: AuthContext, location_id: int) -> Location:
    location = await ctx.db.get(Location, location_id)
    if location is None:
        raise AppError(422, "validation_error", fields={"location_id": "invalid"})
    if not await can_act_at(ctx, location):
        raise AppError(403, "location_forbidden")
    return location


async def close_batch(ctx: AuthContext, batch_id: int, location_id: int, note: str | None) -> None:
    """Partiya shu joyda tugadi: tizimda qolgan metr — metr farqi (+ kam chiqdi, − ortiq chiqdi)."""
    batch = await _batch(ctx, batch_id)
    location = await _acting_location(ctx, location_id)
    stock = await lock_stock(ctx.db, batch.id, location.id)
    if stock is None or stock.status != "open":
        raise AppError(409, "batch_not_open")
    on_the_way = await ctx.db.scalar(
        select(func.coalesce(func.sum(TransferLine.sent_m), 0))
        .join(Transfer, Transfer.id == TransferLine.transfer_id)
        .where(
            TransferLine.batch_id == batch.id,
            Transfer.to_location_id == location.id,
            Transfer.status == "in_transit",
        )
    )
    if on_the_way:
        raise AppError(409, "batch_in_transit", meters=str(on_the_way))

    diff = stock.qty_m
    closure = BatchClosure(
        business_id=ctx.business.id,
        batch_id=batch.id,
        location_id=location.id,
        received_m=stock.received_m,
        out_m=stock.received_m - diff,
        diff_m=diff,
        diff_amount=amount(diff, batch.cost_per_m),
        note=note or None,
        closed_by=ctx.user.id,
    )
    ctx.db.add(closure)
    await ctx.db.flush()
    await move_stock(
        ctx.db,
        business_id=ctx.business.id,
        batch_id=batch.id,
        location_id=location.id,
        qty_m=-diff,  # qoldiq 0 ga keltiriladi
        type="close",
        status="closed",
        ref_type="closure",
        ref_id=closure.id,
        user_id=ctx.user.id,
        note=note or None,
    )
    _log(ctx, "batch.closed", location.id, name=batch.number, diff=str(diff))
    received = closure.received_m
    if received > 0 and abs(diff) / received >= BIG_DIFFERENCE:
        await notifications.notify_owners(
            ctx.db,
            ctx.business.id,
            "batch.big_diff",
            {
                "batch_id": batch.id,
                "number": batch.number,
                "location": location.name,
                "diff": str(diff),
                "percent": int((abs(diff) * 100 / received).quantize(Decimal(1), ROUND_HALF_UP)),
                "by": ctx.user.full_name,
            },
            exclude=ctx.user.id,
        )


async def reopen_batch(ctx: AuthContext, batch_id: int, location_id: int) -> None:
    """Xato yopilgan partiyani qayta ochadi: qoldiq qaytadi, metr farqi yozuvi bekor bo'ladi."""
    batch = await _batch(ctx, batch_id)
    location = await _acting_location(ctx, location_id)
    stock = await lock_stock(ctx.db, batch.id, location.id)
    closure = await ctx.db.scalar(
        select(BatchClosure)
        .where(
            BatchClosure.batch_id == batch.id,
            BatchClosure.location_id == location.id,
            BatchClosure.reopened_at.is_(None),
        )
        .order_by(BatchClosure.closed_at.desc(), BatchClosure.id.desc())
        .limit(1)
    )
    if stock is None or stock.status != "closed" or closure is None:
        raise AppError(409, "batch_not_closed")
    await move_stock(
        ctx.db,
        business_id=ctx.business.id,
        batch_id=batch.id,
        location_id=location.id,
        qty_m=closure.diff_m,
        type="reopen",
        status="open",
        ref_type="closure",
        ref_id=closure.id,
        user_id=ctx.user.id,
    )
    closure.reopened_by = ctx.user.id
    closure.reopened_at = datetime.now(UTC)
    _log(ctx, "batch.reopened", location.id, name=batch.number)


# ====================== Metr farqi hisoboti ======================


def _day_range(ctx: AuthContext, date_from: date | None, date_to: date | None, column: Any) -> list:
    """Davr biznes vaqt mintaqasi bo'yicha: [date_from 00:00, date_to keyingi kun 00:00)."""
    zone = ZoneInfo(ctx.business.timezone)
    conditions = []
    if date_from is not None:
        conditions.append(column >= datetime.combine(date_from, time.min, zone))
    if date_to is not None:
        conditions.append(column < datetime.combine(date_to + timedelta(days=1), time.min, zone))
    return conditions


_GAP = TransferLine.sent_m - TransferLine.received_m  # ko'chirishda yo'qolgan metr (manfiy — ortiq kelgan)


def _closure_conditions(
    ctx: AuthContext,
    date_from: date | None,
    date_to: date | None,
    location_id: int | None,
    user_id: int | None,
    kind: Literal["shortage", "surplus"] | None,
) -> list:
    """Farq bilan yopilgan partiyalar (qayta ochilganlari hisobga kirmaydi)."""
    conditions = [
        BatchClosure.reopened_at.is_(None),
        BatchClosure.diff_m != 0,
        *_day_range(ctx, date_from, date_to, BatchClosure.closed_at),
    ]
    if location_id is not None:
        conditions.append(BatchClosure.location_id == location_id)
    if user_id is not None:
        conditions.append(BatchClosure.closed_by == user_id)
    if kind == "shortage":
        conditions.append(BatchClosure.diff_m > 0)
    elif kind == "surplus":
        conditions.append(BatchClosure.diff_m < 0)
    return conditions


def _transfer_conditions(
    ctx: AuthContext,
    date_from: date | None,
    date_to: date | None,
    location_id: int | None,
    user_id: int | None,
    kind: Literal["shortage", "surplus"] | None,
) -> list:
    """Ko'chirish farqlari: jo'natilgan − kelgan."""
    conditions = [
        Transfer.status == "received",
        _GAP != 0,
        *_day_range(ctx, date_from, date_to, Transfer.received_at),
    ]
    if location_id is not None:
        conditions.append(
            or_(Transfer.from_location_id == location_id, Transfer.to_location_id == location_id)
        )
    if user_id is not None:
        conditions.append(Transfer.received_by == user_id)
    if kind == "shortage":
        conditions.append(_GAP > 0)
    elif kind == "surplus":
        conditions.append(_GAP < 0)
    return conditions


async def difference_totals(
    ctx: AuthContext,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    location_id: int | None = None,
    user_id: int | None = None,
    kind: Literal["shortage", "surplus"] | None = None,
) -> DifferenceTotals:
    """Metr farqi jami — bazada, filtrga mos BARCHA qatorlar bo'yicha (ro'yxat chegarasiga bog'liq emas)."""
    filters = (ctx, date_from, date_to, location_id, user_id, kind)
    short, over = BatchClosure.diff_m > 0, BatchClosure.diff_m < 0

    def total(column: Any, condition: Any) -> Any:
        return func.coalesce(func.sum(column).filter(condition), 0)

    count, shortage_m, shortage_amount, surplus_m, surplus_amount = (
        await ctx.db.execute(
            select(
                func.count(),
                total(BatchClosure.diff_m, short),
                total(BatchClosure.diff_amount, short),
                total(BatchClosure.diff_m, over),
                total(BatchClosure.diff_amount, over),
            ).where(*_closure_conditions(*filters))
        )
    ).one()
    # Qator summasi `amount()` dagidek: metr × tannarx, butun so'mgacha (yarim — yuqoriga)
    moved_count, transfer_m, transfer_amount = (
        await ctx.db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(_GAP), 0),
                func.coalesce(func.sum(func.round(_GAP * Batch.cost_per_m)), 0),
            )
            .select_from(TransferLine)
            .join(Transfer, Transfer.id == TransferLine.transfer_id)
            .join(Batch, Batch.id == TransferLine.batch_id)
            .where(*_transfer_conditions(*filters))
        )
    ).one()
    return DifferenceTotals(
        closures_total=count,
        transfers_total=moved_count,
        shortage_m=Decimal(shortage_m),
        shortage_amount=int(shortage_amount),
        surplus_m=abs(Decimal(surplus_m)),
        surplus_amount=-int(surplus_amount),
        transfer_m=Decimal(transfer_m),
        transfer_amount=int(transfer_amount),
    )


async def differences(
    ctx: AuthContext,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    location_id: int | None = None,
    user_id: int | None = None,
    kind: Literal["shortage", "surplus"] | None = None,
    limit: int = DIFFERENCES_LIMIT,
    offset: int = 0,
) -> Differences:
    """Metr farqi: yopilgan partiyalardagi farq va ko'chirish farqlari — alohida bo'limlarda.
    Ro'yxatlar sahifalanadi (`limit`, `offset` — ikkala bo'limga bir xil); jami — hamma qatorlar bo'yicha."""
    filters = (ctx, date_from, date_to, location_id, user_id, kind)
    names = dict((await ctx.db.execute(select(Location.id, Location.name))).all())
    users = dict((await ctx.db.execute(select(User.id, User.full_name))).all())

    def with_sku(query: Select) -> Select:
        """Partiya ulangan so'rovga tovarni (SKU, mato, rang, gul) qo'shadi."""
        return (
            query.add_columns(Batch, Sku, Fabric, Color, Pattern)
            .join(Sku, Sku.id == Batch.sku_id)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
        )

    closed = with_sku(select(BatchClosure).join(Batch, Batch.id == BatchClosure.batch_id)).where(
        *_closure_conditions(*filters)
    )
    closures = [
        ClosureDiff(
            id=closure.id,
            batch_id=batch.id,
            batch_number=batch.number,
            sku=sku_brief(sku, fabric, color, pattern),
            location=Ref(id=closure.location_id, name=names[closure.location_id]),
            received_m=closure.received_m,
            out_m=closure.out_m,
            diff_m=closure.diff_m,
            diff_percent=(closure.diff_m * 100 / closure.received_m).quantize(Decimal("0.1"))
            if closure.received_m
            else None,
            diff_amount=closure.diff_amount,
            closed_by=Ref(id=closure.closed_by, name=users[closure.closed_by]),
            closed_at=closure.closed_at,
            note=closure.note,
        )
        for closure, batch, sku, fabric, color, pattern in await ctx.db.execute(
            closed.order_by(BatchClosure.closed_at.desc(), BatchClosure.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ]

    moved = with_sku(
        select(Transfer, TransferLine)
        .select_from(TransferLine)
        .join(Transfer, Transfer.id == TransferLine.transfer_id)
        .join(Batch, Batch.id == TransferLine.batch_id)
    ).where(*_transfer_conditions(*filters))
    transfers = [
        TransferDiff(
            transfer_id=transfer.id,
            number=transfer.number,
            batch_id=batch.id,
            batch_number=batch.number,
            sku=sku_brief(sku, fabric, color, pattern),
            source=Ref(id=transfer.from_location_id, name=names[transfer.from_location_id]),
            target=Ref(id=transfer.to_location_id, name=names[transfer.to_location_id]),
            sent_m=line.sent_m,
            received_m=line.received_m,
            diff_m=line.sent_m - line.received_m,
            diff_amount=amount(line.sent_m - line.received_m, batch.cost_per_m),
            received_by=Ref(id=transfer.received_by, name=users[transfer.received_by]),
            received_at=transfer.received_at,
            note=transfer.receive_note,
        )
        for transfer, line, batch, sku, fabric, color, pattern in await ctx.db.execute(
            moved.order_by(Transfer.received_at.desc(), TransferLine.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ]

    totals = await difference_totals(
        ctx, date_from=date_from, date_to=date_to, location_id=location_id, user_id=user_id, kind=kind
    )
    return Differences(closures=closures, transfers=transfers, **totals.model_dump())
