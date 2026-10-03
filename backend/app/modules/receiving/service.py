"""Kirim mantiqi: skladga tovar qabul qilish. Har qator — yangi partiya, uning metri skladga qoldiq bo'lib tushadi.

Qoidalar (docs/03-details/04-kirim.md):
- kirim faqat skladga; omborchi — faqat o'ziga biriktirilgan skladga;
- partiyadan hali sotilmagan va ko'chirilmagan bo'lsa — kiritgan omborchi yoki biznes egasi tuzatadi;
  harakat bo'lgan bo'lsa — faqat biznes egasi (tovarni almashtirib bo'lmaydi);
- kirim o'chirilmaydi — harakatsiz kirimni biznes egasi bekor qiladi;
- hammasi jurnalga ("Ombor").
"""
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select

from app.core.audit import log_event
from app.core.counters import next_numbers
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.catalog import service as catalog
from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.inventory.models import BatchStock, StockMovement
from app.modules.inventory.stock import move_stock
from app.modules.receiving.models import Batch, Receipt
from app.modules.receiving.schemas import (
    BatchOut,
    BatchUpdate,
    LineIn,
    Options,
    ReceiptCard,
    ReceiptCreate,
    ReceiptPage,
    ReceiptRow,
    ReceiptUpdate,
    Ref,
)
from app.modules.structure.access import allowed_location_ids, require_location
from app.modules.structure.models import Location

# Bu turlar "harakat" hisoblanmaydi: kirimning o'zi va uning tuzatishlari
_OWN_TYPES = ("receipt", "correction")
_COEFFICIENT = Decimal("0.0001")
_METERS = Decimal("0.01")
_KG = Decimal("0.001")


def _field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields={field: problem})


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


def _amount(meters: Decimal, cost_per_m: int) -> int:
    """Summa so'mda: metr × tannarx, butun so'mgacha yaxlitlangan."""
    return int((meters * cost_per_m).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _coefficient(
    meters: Decimal, kg: Decimal | None, given: Decimal | None, fabric: Fabric
) -> Decimal | None:
    """1 kg = X metr: metr va kg ikkalasi bor — metr ÷ kg; aks holda kiritilgani yoki matoning standarti."""
    if kg is not None:
        return (meters / kg).quantize(_COEFFICIENT, rounding=ROUND_HALF_UP)
    return given if given is not None else fabric.default_m_per_kg


def _check_date(ctx: AuthContext, receipt_date: date) -> None:
    today = datetime.now(ZoneInfo(ctx.business.timezone)).date()
    if receipt_date > today:
        raise _field_error("receipt_date", "future")


# ====================== Ro'yxat ======================


async def options(ctx: AuthContext) -> Options:
    allowed = await allowed_location_ids(ctx, "warehouse")
    warehouses = select(Location).where(Location.type == "warehouse", Location.is_active)
    creators = select(User.id, User.full_name).where(
        User.id.in_(select(Receipt.created_by).distinct())
    )
    if allowed is not None:
        warehouses = warehouses.where(Location.id.in_(allowed))
        creators = select(User.id, User.full_name).where(
            User.id.in_(
                select(Receipt.created_by).where(Receipt.warehouse_id.in_(allowed)).distinct()
            )
        )
    return Options(
        warehouses=[
            Ref(id=w.id, name=w.name)
            for w in (await ctx.db.scalars(warehouses.order_by(Location.name))).all()
        ],
        creators=[
            Ref(id=user_id, name=name)
            for user_id, name in await ctx.db.execute(creators.order_by(User.full_name))
        ],
    )


async def list_receipts(
    ctx: AuthContext,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    warehouse_id: int | None = None,
    created_by: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> ReceiptPage:
    conditions = []
    allowed = await allowed_location_ids(ctx, "warehouse")
    if allowed is not None:  # omborchi faqat o'z skladlarining kirimlarini ko'radi
        conditions.append(Receipt.warehouse_id.in_(allowed))
    if date_from is not None:
        conditions.append(Receipt.receipt_date >= date_from)
    if date_to is not None:
        conditions.append(Receipt.receipt_date <= date_to)
    if warehouse_id is not None:
        conditions.append(Receipt.warehouse_id == warehouse_id)
    if created_by is not None:
        conditions.append(Receipt.created_by == created_by)

    totals = (
        select(
            Batch.receipt_id,
            func.count().label("batches"),
            func.sum(Batch.meters_labeled).label("meters"),
            func.sum(Batch.meters_labeled * Batch.cost_per_m).label("amount"),
        )
        .group_by(Batch.receipt_id)
        .subquery()
    )
    rows = (
        await ctx.db.execute(
            select(
                Receipt,
                Location.name,
                User.full_name,
                totals.c.batches,
                totals.c.meters,
                totals.c.amount,
            )
            .join(Location, Location.id == Receipt.warehouse_id)
            .join(User, User.id == Receipt.created_by)
            .outerjoin(totals, totals.c.receipt_id == Receipt.id)
            .where(*conditions)
            .order_by(Receipt.receipt_date.desc(), Receipt.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = await ctx.db.scalar(select(func.count()).select_from(Receipt).where(*conditions))
    return ReceiptPage(
        items=[
            ReceiptRow(
                id=receipt.id,
                number=receipt.number,
                receipt_date=receipt.receipt_date,
                status=receipt.status,
                warehouse=Ref(id=receipt.warehouse_id, name=warehouse_name),
                created_by=Ref(id=receipt.created_by, name=creator_name),
                batches_count=batches or 0,
                total_m=meters or Decimal(0),
                total_amount=_amount(amount or Decimal(0), 1),
            )
            for receipt, warehouse_name, creator_name, batches, meters, amount in rows
        ],
        total=total or 0,
    )


# ====================== Kartochka ======================


async def _receipt(ctx: AuthContext, receipt_id: int) -> Receipt:
    receipt = await ctx.db.get(Receipt, receipt_id)  # RLS: begona biznes kirimi ko'rinmaydi
    allowed = await allowed_location_ids(ctx, "warehouse")
    if receipt is None or (allowed is not None and receipt.warehouse_id not in allowed):
        raise AppError(404, "receipt_not_found")
    return receipt


async def _moved(ctx: AuthContext, batch_ids: list[int]) -> set[int]:
    """Sotilgan yoki ko'chirilgan partiyalar (kirimning o'zi va tuzatishlar hisobga olinmaydi)."""
    if not batch_ids:
        return set()
    rows = await ctx.db.scalars(
        select(StockMovement.batch_id)
        .where(StockMovement.batch_id.in_(batch_ids), StockMovement.type.not_in(_OWN_TYPES))
        .distinct()
    )
    return set(rows.all())


def _may_edit(ctx: AuthContext, receipt: Receipt, moved: bool) -> bool:
    if receipt.status != "active":
        return False
    if ctx.user.role == "owner":
        return True
    return receipt.created_by == ctx.user.id and not moved


async def get_receipt(ctx: AuthContext, receipt_id: int) -> ReceiptCard:
    receipt = await _receipt(ctx, receipt_id)
    rows = (
        await ctx.db.execute(
            select(Batch, Sku, Fabric, Color, Pattern, BatchStock.qty_m)
            .join(Sku, Sku.id == Batch.sku_id)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
            .outerjoin(
                BatchStock,
                and_(
                    BatchStock.batch_id == Batch.id,
                    BatchStock.location_id == receipt.warehouse_id,
                ),
            )
            .where(Batch.receipt_id == receipt.id)
            .order_by(Batch.id)
        )
    ).all()
    moved = await _moved(ctx, [row[0].id for row in rows])

    async def user_ref(user_id: int | None) -> Ref | None:
        user = await ctx.db.get(User, user_id) if user_id is not None else None
        return Ref(id=user.id, name=user.full_name) if user else None

    warehouse = await ctx.db.get(Location, receipt.warehouse_id)
    lines = [
        BatchOut(
            id=batch.id,
            number=batch.number,
            sku=catalog.sku_out(sku, fabric, color, pattern),
            rolls_count=batch.rolls_count,
            meters_labeled=batch.meters_labeled,
            kg=batch.kg,
            m_per_kg=batch.m_per_kg,
            cost_per_m=batch.cost_per_m,
            amount=_amount(batch.meters_labeled, batch.cost_per_m),
            qty_m=qty_m if qty_m is not None else Decimal(0),
            has_movement=batch.id in moved,
            can_edit=_may_edit(ctx, receipt, batch.id in moved),
        )
        for batch, sku, fabric, color, pattern, qty_m in rows
    ]
    return ReceiptCard(
        id=receipt.id,
        number=receipt.number,
        receipt_date=receipt.receipt_date,
        note=receipt.note,
        status=receipt.status,
        warehouse=Ref(id=warehouse.id, name=warehouse.name),
        created_by=await user_ref(receipt.created_by),
        created_at=receipt.created_at,
        cancelled_by=await user_ref(receipt.cancelled_by),
        cancelled_at=receipt.cancelled_at,
        lines=lines,
        total_m=sum((line.meters_labeled for line in lines), Decimal(0)),
        total_amount=sum(line.amount for line in lines),
        can_edit=_may_edit(ctx, receipt, bool(moved)),
        can_cancel=ctx.user.role == "owner" and receipt.status == "active" and not moved,
    )


# ====================== Yaratish ======================


async def _apply_line_price(ctx: AuthContext, line: LineIn, sku, fabric, color, pattern) -> None:
    """Qatorda tavsiya narx berilgan bo'lsa — SKU narxi yangilanadi (tarix va jurnal bilan)."""
    if line.price is not None:
        catalog.set_price(
            ctx, sku, fabric, color, pattern, line.price, line.price_unit or sku.price_unit
        )


async def create_receipt(ctx: AuthContext, body: ReceiptCreate) -> Receipt:
    warehouse = await require_location(ctx, body.warehouse_id, "warehouse", field="warehouse_id")
    _check_date(ctx, body.receipt_date)

    receipt_number = (await next_numbers(ctx.db, ctx.business.id, "receipt"))[0]
    batch_numbers = await next_numbers(ctx.db, ctx.business.id, "batch", len(body.lines))
    receipt = Receipt(
        business_id=ctx.business.id,
        warehouse_id=warehouse.id,
        number=f"KR-{receipt_number:05d}",
        receipt_date=body.receipt_date,
        note=body.note or None,
        created_by=ctx.user.id,
    )
    ctx.db.add(receipt)
    await ctx.db.flush()

    total_m = Decimal(0)
    for line, number in zip(body.lines, batch_numbers, strict=True):
        sku, fabric, color, pattern = await catalog.ensure_sku(
            ctx, line.fabric_id, line.color_id, line.pattern_id
        )
        batch = Batch(
            business_id=ctx.business.id,
            receipt_id=receipt.id,
            sku_id=sku.id,
            number=f"P-{number:06d}",
            rolls_count=line.rolls_count,
            meters_labeled=line.meters,
            kg=line.kg,
            m_per_kg=_coefficient(line.meters, line.kg, line.m_per_kg, fabric),
            cost_per_m=line.cost_per_m,
        )
        ctx.db.add(batch)
        await ctx.db.flush()
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=batch.id,
            location_id=warehouse.id,
            qty_m=line.meters,
            received_m=line.meters,
            type="receipt",
            ref_type="receipt",
            ref_id=receipt.id,
            user_id=ctx.user.id,
        )
        await _apply_line_price(ctx, line, sku, fabric, color, pattern)
        total_m += line.meters

    _log(
        ctx,
        "receipt.created",
        warehouse.id,
        name=receipt.number,
        batches=len(body.lines),
        meters=str(total_m.quantize(_METERS)),
    )
    return receipt


# ====================== Tuzatish va bekor qilish ======================


async def update_receipt(ctx: AuthContext, receipt_id: int, body: ReceiptUpdate) -> None:
    """Hujjat sanasi va izohi."""
    receipt = await _receipt(ctx, receipt_id)
    batch_ids = (
        await ctx.db.scalars(select(Batch.id).where(Batch.receipt_id == receipt.id))
    ).all()
    if receipt.status != "active":
        raise AppError(409, "receipt_cancelled")
    if not _may_edit(ctx, receipt, bool(await _moved(ctx, list(batch_ids)))):
        raise AppError(403, "receipt_locked")
    _check_date(ctx, body.receipt_date)
    note = body.note or None
    if (receipt.receipt_date, receipt.note) == (body.receipt_date, note):
        return
    receipt.receipt_date, receipt.note = body.receipt_date, note
    _log(ctx, "receipt.updated", receipt.warehouse_id, name=receipt.number)


def _plain(value: Any) -> Any:
    """Jurnal uchun: aniq sonlar matn ko'rinishida (JSON'da aniqlik yo'qolmasin)."""
    return str(value) if isinstance(value, Decimal) else value


def _scaled(value: Decimal | None, scale: Decimal) -> Decimal | None:
    """Sonni bazadagi aniqlikka keltiradi ("500" → "500.00") — jurnalda eski va yangi bir xil ko'rinadi."""
    return None if value is None else value.quantize(scale)


async def update_batch(ctx: AuthContext, batch_id: int, body: BatchUpdate) -> None:
    batch = await ctx.db.get(Batch, batch_id)
    if batch is None:
        raise AppError(404, "batch_not_found")
    receipt = await _receipt(ctx, batch.receipt_id)
    if receipt.status != "active":
        raise AppError(409, "receipt_cancelled")
    moved = bool(await _moved(ctx, [batch.id]))
    if not _may_edit(ctx, receipt, moved):
        # Omborchi: begona kirim yoki partiyadan sotilgan / ko'chirilgan — faqat biznes egasi tuzatadi
        raise AppError(403, "receipt_locked")

    sku = await ctx.db.get(Sku, batch.sku_id)
    fabric = await ctx.db.get(Fabric, sku.fabric_id)
    changes: dict[str, dict[str, Any]] = {}

    if body.sku is not None:
        new_sku, new_fabric, color, pattern = await catalog.ensure_sku(
            ctx, body.sku.fabric_id, body.sku.color_id, body.sku.pattern_id
        )
        if new_sku.id != sku.id:
            if moved:  # sotilgan tovarning nomini almashtirib bo'lmaydi — tarix buziladi
                raise AppError(409, "batch_has_movement")
            old_color = await ctx.db.get(Color, sku.color_id)
            old_pattern = await ctx.db.get(Pattern, sku.pattern_id)
            changes["sku"] = {
                "old": catalog.sku_code(fabric, old_color, old_pattern),
                "new": catalog.sku_code(new_fabric, color, pattern),
            }
            batch.sku_id, fabric = new_sku.id, new_fabric

    coefficient = _coefficient(body.meters, body.kg, body.m_per_kg, fabric)
    new_values = {
        "rolls_count": body.rolls_count,
        "meters_labeled": _scaled(body.meters, _METERS),
        "kg": _scaled(body.kg, _KG),
        "m_per_kg": _scaled(coefficient, _COEFFICIENT),
        "cost_per_m": body.cost_per_m,
    }
    delta = body.meters - batch.meters_labeled
    for field, new in new_values.items():
        old = getattr(batch, field)
        if old != new:
            changes[field] = {"old": _plain(old), "new": _plain(new)}
            setattr(batch, field, new)
    if not changes:
        return

    if delta != 0:
        # Yozilgan metr o'zgardi — skladdagi qoldiq ham shuncha o'zgaradi
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=batch.id,
            location_id=receipt.warehouse_id,
            qty_m=delta,
            received_m=delta,
            type="correction",
            ref_type="receipt",
            ref_id=receipt.id,
            user_id=ctx.user.id,
        )
    _log(ctx, "batch.updated", receipt.warehouse_id, name=batch.number, changes=changes)


async def cancel_receipt(ctx: AuthContext, receipt_id: int) -> None:
    """Harakatsiz kirimni bekor qiladi: partiyalar metri skladdan chiqariladi. Faqat biznes egasi."""
    receipt = await _receipt(ctx, receipt_id)
    if receipt.status != "active":
        raise AppError(409, "receipt_cancelled")
    batch_ids = list(
        (await ctx.db.scalars(select(Batch.id).where(Batch.receipt_id == receipt.id))).all()
    )
    if await _moved(ctx, batch_ids):
        raise AppError(409, "batch_has_movement")

    for batch_id in batch_ids:
        stock = await ctx.db.get(BatchStock, (batch_id, receipt.warehouse_id))
        if stock is None:
            continue
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=batch_id,
            location_id=receipt.warehouse_id,
            qty_m=-stock.qty_m,
            received_m=-stock.received_m,
            type="receipt_cancel",
            ref_type="receipt",
            ref_id=receipt.id,
            user_id=ctx.user.id,
        )
    receipt.status = "cancelled"
    receipt.cancelled_by = ctx.user.id
    receipt.cancelled_at = datetime.now(UTC)
    _log(ctx, "receipt.cancelled", receipt.warehouse_id, name=receipt.number)
