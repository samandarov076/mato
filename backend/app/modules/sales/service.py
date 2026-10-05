"""Sotuv mantiqi: sotuv ekrani, sotuvni yozish, ro'yxat, kartochka, bekor qilish va qaytarish.

Qoidalar (docs/03-details/06-sotuv.md):
- sotuv qurilma bog'langan do'konga va PIN bilan kirgan sotuvchiga yoziladi (biznes egasi do'konni tanlaydi);
- narx doim 1 metr uchun; chegarasi yo'q; qatorda tavsiya narx ham saqlanadi;
- yopilgan partiyadan sotib bo'lmaydi; qoldiqdan ko'p sotishda izoh majburiy;
- bir savat ikki marta yozilmaydi (`client_uuid`);
- sotuvchi o'z sotuvini 10 daqiqa ichida bekor qiladi, keyin — faqat biznes egasi; sabab majburiy;
- qaytarish faqat asl sotuv bo'yicha, sotilgandan ko'p emas; metr shu do'konga qaytadi;
- hammasi jurnalga ("Sotuv"); qaytarish va manfiy qoldiqdan sotuv — egalarga xabar.
"""
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.audit import log_event
from app.core.counters import next_numbers
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.modules.auth.models import Device, User, UserSession
from app.modules.catalog import service as catalog
from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.credit import service as credit
from app.modules.credit.models import Customer
from app.modules.inventory.models import BatchStock
from app.modules.inventory.service import _day_range, _like
from app.modules.inventory.stock import lock_stock, move_stock
from app.modules.notifications import service as notifications
from app.modules.receiving.models import Batch, Receipt
from app.modules.sales.models import ReturnLine, Sale, SaleLine, SaleReturn
from app.modules.sales.schemas import (
    DebtOut,
    Ref,
    ReturnCreated,
    ReturnIn,
    ReturnLineOut,
    ReturnOut,
    SaleCard,
    SaleContext,
    SaleCreate,
    SaleLineOut,
    SalePage,
    SaleRow,
    SellableBatch,
    SellableSku,
)
from app.modules.structure.models import Location

# Sotuvchi o'z sotuvini shu vaqt ichida bekor qila oladi; keyin — faqat biznes egasi
CANCEL_WINDOW = timedelta(minutes=10)


def _field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields={field: problem})


def line_amount(meters: Decimal, price_per_m: int) -> int:
    """Qator summasi: metr × narx, butun so'mgacha."""
    return int((meters * price_per_m).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def recommended_per_m(sku: Sku, m_per_kg: Decimal | None, rounding: int) -> int | None:
    """Tavsiya narx 1 metr uchun. SKU narxi kg da bo'lsa — partiya koeffitsienti bo'yicha metrga o'giriladi
    va biznes sozlamasidagi aniqlikda yaxlitlanadi. Narx yoki koeffitsient yo'q bo'lsa — None."""
    if sku.price is None:
        return None
    if sku.price_unit == "m":
        return sku.price
    if m_per_kg is None:
        return None
    steps = (Decimal(sku.price) / m_per_kg / rounding).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(steps) * rounding or None


def sale_status(sale: Sale) -> str:
    if sale.status == "cancelled":
        return "cancelled"
    if sale.returned_total == 0:
        return "completed"
    return "returned" if sale.returned_total >= sale.total else "partially_returned"


def _log(ctx: AuthContext, event_code: str, store_id: int, **data: Any) -> None:
    log_event(
        ctx.db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        location_id=store_id,
        category="sale",
        event_code=event_code,
        data=data,
    )


async def _store(ctx: AuthContext, store_id: int | None) -> Location:
    """Sotuv qaysi do'konda: sotuvchida — qurilma bog'langan do'kon; biznes egasi o'zi tanlaydi."""
    if ctx.user.role == "seller":
        if ctx.store is None:
            raise AppError(403, "store_required")
        return ctx.store
    if store_id is None:
        raise _field_error("store_id", "required")
    store = await ctx.db.get(Location, store_id)
    if store is None or store.type != "store" or not store.is_active:
        raise _field_error("store_id", "invalid")
    return store


def _scope(ctx: AuthContext) -> list:
    """Sotuvchi faqat o'z do'konining sotuvlarini ko'radi (qaytarish uchun asl sotuvni shu yerdan topadi)."""
    if ctx.user.role != "seller":
        return []
    return [Sale.store_id == ctx.store.id] if ctx.store else [false()]


# ====================== Sotuv ekrani ======================


async def context(ctx: AuthContext, store_id: int | None) -> SaleContext:
    """Do'kondagi sotiladigan tovarlar: SKU → ochiq partiyalar (eng eskisi birinchi), tavsiya narx bilan."""
    store = await _store(ctx, store_id)
    rows = (
        await ctx.db.execute(
            select(BatchStock.qty_m, Batch, Receipt.receipt_date, Sku, Fabric, Color, Pattern)
            .select_from(BatchStock)
            .join(Batch, Batch.id == BatchStock.batch_id)
            .join(Receipt, Receipt.id == Batch.receipt_id)
            .join(Sku, Sku.id == Batch.sku_id)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
            .where(
                BatchStock.location_id == store.id,
                BatchStock.status == "open",
                Receipt.status == "active",
            )
            .order_by(
                func.lower(Fabric.code),
                func.lower(Color.code),
                Pattern.is_plain.desc(),
                func.lower(Pattern.code),
                Batch.id,
            )
        )
    ).all()
    items: dict[int, SellableSku] = {}
    for qty_m, batch, receipt_date, sku, fabric, color, pattern in rows:
        item = items.setdefault(
            sku.id, SellableSku(sku=catalog.sku_out(sku, fabric, color, pattern), batches=[])
        )
        item.batches.append(
            SellableBatch(
                id=batch.id,
                number=batch.number,
                receipt_date=receipt_date,
                qty_m=qty_m,
                m_per_kg=batch.m_per_kg,
                recommended_price_per_m=recommended_per_m(
                    sku, batch.m_per_kg, ctx.business.price_rounding
                ),
            )
        )
    return SaleContext(
        store=Ref(id=store.id, name=store.name),
        sell_by_kg=ctx.business.sell_by_kg,
        credit_enabled=ctx.business.credit_enabled,
        items=list(items.values()),
    )


# ====================== Sotuvni yozish ======================


async def _device_id(ctx: AuthContext) -> int | None:
    """Sotuv qaysi qurilmadan yozilgani (PIN bilan kirilgan bo'lsa)."""
    return await ctx.db.scalar(
        select(Device.id)
        .join(UserSession, UserSession.device_id == Device.id)
        .where(UserSession.id == ctx.session_id)
    )


def _payment(body: SaleCreate, total: int) -> tuple[str, int | None, int, str | None]:
    """Sotuv qanday yoziladi: (to'lov turi, mijoz, boshlang'ich to'lov, uning turi).
    Boshlang'ich to'lov jamiga teng bo'lsa — bu nasiya emas, shu to'lov turidagi oddiy sotuv."""
    if body.payment_type != "credit":
        return body.payment_type, None, 0, None
    initial, method = body.initial_payment, body.initial_payment_method
    if initial == total and method is not None:
        return method, None, 0, None
    return "credit", body.customer_id, initial, method if initial > 0 else None


async def _same_basket(ctx: AuthContext, sale: Sale, body: SaleCreate) -> Sale:
    """Shu identifikator bilan avval yozilgan sotuv. Qayta kelgan savat mazmuni undan farq qilsa — rad etiladi:
    aks holda interfeys "yozildi" deb ko'rsatadi, qo'shilgan tovar esa hech qayerga yozilmaydi."""
    store_id = ctx.store.id if ctx.user.role == "seller" and ctx.store else body.store_id
    saved = (
        await ctx.db.execute(
            select(SaleLine.batch_id, SaleLine.meters, SaleLine.price_per_m)
            .where(SaleLine.sale_id == sale.id)
            .order_by(SaleLine.id)
        )
    ).all()
    sent = [(line.batch_id, line.meters, line.price_per_m) for line in body.lines]
    total = sum(line_amount(meters, price) for _, meters, price in sent)
    recorded = (sale.payment_type, sale.customer_id, sale.initial_payment, sale.initial_payment_method)
    if (
        store_id != sale.store_id
        or [tuple(row) for row in saved] != sent
        or _payment(body, total) != recorded
    ):
        raise AppError(409, "sale_basket_changed", number=sale.number)
    return sale


async def create_sale(ctx: AuthContext, body: SaleCreate) -> tuple[Sale, bool]:
    """Sotuvni yozadi. (sotuv, takrormi) qaytaradi: shu savat avval yozilgan bo'lsa — o'sha sotuv
    (mazmuni ham bir xil bo'lsa; o'zgargan savat — 409)."""
    by_uuid = select(Sale).where(Sale.client_uuid == body.client_uuid)
    existing = await ctx.db.scalar(by_uuid)
    if existing is not None:
        return await _same_basket(ctx, existing, body), True
    store = await _store(ctx, body.store_id)

    customer: Customer | None = None
    if body.payment_type == "credit":
        if not ctx.business.credit_enabled:
            raise AppError(409, "credit_disabled")
        if body.customer_id is None:
            raise _field_error("customer_id", "required")
        customer = await credit.require_customer(ctx, body.customer_id)

    # Partiyalar doim bir xil tartibda qulflanadi — ikki sotuv bir-birini kutib qolmaydi
    batches: dict[int, Batch] = {}
    available: dict[int, Decimal] = {}
    for batch_id in sorted({line.batch_id for line in body.lines}):
        batch = await ctx.db.get(Batch, batch_id)
        if batch is None:
            raise AppError(404, "batch_not_found")
        receipt = await ctx.db.get(Receipt, batch.receipt_id)
        stock = await lock_stock(ctx.db, batch.id, store.id)
        if stock is None or receipt.status != "active":
            raise AppError(409, "batch_not_here", batch=batch.number)
        if stock.status != "open":
            raise AppError(409, "batch_closed", batch=batch.number)
        batches[batch_id], available[batch_id] = batch, stock.qty_m

    prepared = []
    negative = []
    skus: dict[int, tuple[Sku, Fabric, Color, Pattern]] = {}
    for index, line in enumerate(body.lines):
        batch = batches[line.batch_id]
        left = available[batch.id]
        if line.meters > left:
            # Tizimda qoldiq tugagan, lekin haqiqatda mato bor — izoh bilan sotiladi
            if not line.negative_stock_note:
                raise AppError(
                    409,
                    "negative_stock_note_required",
                    batch=batch.number,
                    available=str(left),
                    line=index,
                )
            negative.append((batch, line))
        available[batch.id] = left - line.meters
        if batch.sku_id not in skus:
            skus[batch.sku_id] = (
                await ctx.db.execute(
                    select(Sku, Fabric, Color, Pattern)
                    .join(Fabric, Fabric.id == Sku.fabric_id)
                    .join(Color, Color.id == Sku.color_id)
                    .join(Pattern, Pattern.id == Sku.pattern_id)
                    .where(Sku.id == batch.sku_id)
                )
            ).one()
        sku, fabric, color, pattern = skus[batch.sku_id]
        names = [fabric.name, color.name] + ([] if pattern.is_plain else [pattern.name])
        kg = line.kg
        if kg is None and batch.m_per_kg is not None:
            kg = (line.meters / batch.m_per_kg).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        prepared.append(
            {
                "batch_id": batch.id,
                "sku_id": sku.id,
                "sku_label": " · ".join([catalog.sku_code(fabric, color, pattern), *names]),
                "meters": line.meters,
                "kg": kg,
                "price_per_m": line.price_per_m,
                "recommended_price_per_m": recommended_per_m(
                    sku, batch.m_per_kg, ctx.business.price_rounding
                ),
                "cost_per_m": batch.cost_per_m,
                "amount": line_amount(line.meters, line.price_per_m),
                "negative_stock_note": line.negative_stock_note if line.meters > left else None,
            }
        )
    total = sum(item["amount"] for item in prepared)

    payment_type, initial, method = body.payment_type, 0, None
    if payment_type == "credit":
        initial = body.initial_payment
        if initial > total:
            raise _field_error("initial_payment", "too_large")
        if initial > 0 and body.initial_payment_method is None:
            raise _field_error("initial_payment_method", "required")
        if initial == total:
            # Hammasi to'landi — bu nasiya emas, oddiy sotuv
            payment_type, customer, initial = body.initial_payment_method, None, 0
        elif initial > 0:
            method = body.initial_payment_method

    try:
        async with ctx.db.begin_nested():  # takror bo'lsa raqam ham qaytadi — bo'shliq qolmaydi
            number = (await next_numbers(ctx.db, ctx.business.id, "sale"))[0]
            sale = Sale(
                business_id=ctx.business.id,
                number=f"S-{number:06d}",
                client_uuid=body.client_uuid,
                store_id=store.id,
                seller_id=ctx.user.id,
                device_id=await _device_id(ctx),
                customer_id=customer.id if customer else None,
                total=total,
                payment_type=payment_type,
                initial_payment=initial,
                initial_payment_method=method,
            )
            ctx.db.add(sale)
            await ctx.db.flush()
    except IntegrityError:
        # Xuddi shu savat bir vaqtda ikki marta yuborilgan (internet uzilib qayta urinish)
        existing = await ctx.db.scalar(by_uuid)
        if existing is None:
            raise
        return await _same_basket(ctx, existing, body), True

    for item in prepared:
        ctx.db.add(SaleLine(business_id=ctx.business.id, sale_id=sale.id, **item))
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=item["batch_id"],
            location_id=store.id,
            qty_m=-item["meters"],
            type="sale",
            ref_type="sale",
            ref_id=sale.id,
            user_id=ctx.user.id,
            note=item["negative_stock_note"],
        )
    if customer is not None:
        credit.open_debt(ctx, customer, sale.id, total - initial)

    _log(ctx, "sale.created", store.id, name=sale.number, total=total, payment=payment_type)
    for batch, line in negative:
        await notifications.notify_owners(
            ctx.db,
            ctx.business.id,
            "sale.negative_stock",
            {
                "sale_id": sale.id,
                "number": sale.number,
                "batch": batch.number,
                "store": store.name,
                "note": line.negative_stock_note,
                "by": ctx.user.full_name,
            },
            exclude=ctx.user.id,
        )
    return sale, False


# ====================== Ro'yxat ======================

# Jadval sarlavhasidan saralash: vaqt yoki summa, ikki yo'nalishda (standart — eng yangisi tepada)
SALE_ORDER = {
    "-time": (Sale.created_at.desc(), Sale.id.desc()),
    "time": (Sale.created_at.asc(), Sale.id.asc()),
    "-amount": (Sale.total.desc(), Sale.id.desc()),
    "amount": (Sale.total.asc(), Sale.id.asc()),
}


async def list_sales(
    ctx: AuthContext,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    store_id: int | None = None,
    seller_id: int | None = None,
    mine: bool = False,
    payment_type: str | None = None,
    status: str | None = None,
    customer_id: int | None = None,
    search: str | None = None,
    sort: str = "-time",
    limit: int = 50,
    offset: int = 0,
) -> SalePage:
    conditions = _scope(ctx)
    conditions.extend(_day_range(ctx, date_from, date_to, Sale.created_at))
    if store_id is not None:
        conditions.append(Sale.store_id == store_id)
    if mine:
        conditions.append(Sale.seller_id == ctx.user.id)
    elif seller_id is not None:
        conditions.append(Sale.seller_id == seller_id)
    if payment_type is not None:
        conditions.append(Sale.payment_type == payment_type)
    if customer_id is not None:
        conditions.append(Sale.customer_id == customer_id)
    if status == "cancelled":
        conditions.append(Sale.status == "cancelled")
    elif status is not None:
        conditions.append(Sale.status == "completed")
        if status == "completed":
            conditions.append(Sale.returned_total == 0)
        elif status == "returned":
            conditions.append(and_(Sale.returned_total > 0, Sale.returned_total >= Sale.total))
        else:  # partially_returned
            conditions.append(and_(Sale.returned_total > 0, Sale.returned_total < Sale.total))
    if search and search.strip():
        like = _like(search)
        digits = "".join(ch for ch in search if ch.isdigit())
        found = [Sale.number.ilike(like, escape="\\"), Customer.name.ilike(like, escape="\\")]
        if digits:
            found.append(Customer.phone.like(f"%{digits}%"))
        conditions.append(or_(*found))

    def joined(*columns: Any):
        return (
            select(*columns)
            .select_from(Sale)
            .join(Location, Location.id == Sale.store_id)
            .join(User, User.id == Sale.seller_id)
            .outerjoin(Customer, Customer.id == Sale.customer_id)
            .where(*conditions)
        )

    rows = (
        await ctx.db.execute(
            joined(Sale, Location.name, User.full_name, Customer)
            .order_by(*SALE_ORDER.get(sort, SALE_ORDER["-time"]))
            .limit(limit)
            .offset(offset)
        )
    ).all()
    # Jami: bekor qilinganlar kirmaydi, qaytarilgan tovar summasi ayiriladi
    net = func.sum(Sale.total - Sale.returned_total).filter(Sale.status == "completed")
    total, amount = (await ctx.db.execute(joined(func.count(), func.coalesce(net, 0)))).one()
    return SalePage(
        items=[_row(sale, store, seller, customer) for sale, store, seller, customer in rows],
        total=total,
        amount=int(amount),
    )


def _row(sale: Sale, store: str, seller: str, customer: Customer | None) -> SaleRow:
    return SaleRow(
        id=sale.id,
        number=sale.number,
        created_at=sale.created_at,
        store=Ref(id=sale.store_id, name=store),
        seller=Ref(id=sale.seller_id, name=seller),
        customer=Ref(id=customer.id, name=customer.name) if customer else None,
        total=sale.total,
        returned_total=sale.returned_total,
        payment_type=sale.payment_type,
        status=sale_status(sale),
    )


# ====================== Kartochka ======================


async def _sale(ctx: AuthContext, sale_id: int, *, lock: bool = False) -> Sale:
    query = select(Sale).where(Sale.id == sale_id, *_scope(ctx))
    if lock:  # bekor qilish va qaytarish bir vaqtda kelsa — biri ikkinchisini kutadi
        query = query.with_for_update().execution_options(populate_existing=True)
    sale = await ctx.db.scalar(query)
    if sale is None:
        raise AppError(404, "sale_not_found")
    return sale


def _may_cancel(ctx: AuthContext, sale: Sale) -> bool:
    if sale.status != "completed" or sale.returned_total > 0:
        return False
    if ctx.user.role == "owner":
        return True
    return sale.seller_id == ctx.user.id and datetime.now(UTC) - sale.created_at <= CANCEL_WINDOW


async def get_sale(ctx: AuthContext, sale_id: int) -> SaleCard:
    sale = await _sale(ctx, sale_id)
    is_owner = ctx.user.role == "owner"
    store = await ctx.db.get(Location, sale.store_id)
    seller = await ctx.db.get(User, sale.seller_id)
    customer = await ctx.db.get(Customer, sale.customer_id) if sale.customer_id else None
    cancelled_by = await ctx.db.get(User, sale.cancelled_by) if sale.cancelled_by else None

    lines = (
        await ctx.db.execute(
            select(SaleLine, Batch.number)
            .join(Batch, Batch.id == SaleLine.batch_id)
            .where(SaleLine.sale_id == sale.id)
            .order_by(SaleLine.id)
        )
    ).all()
    labels = {line.id: line.sku_label for line, _ in lines}
    returned_amount: dict[int, int] = {}
    returns = []
    for item, user_name in await ctx.db.execute(
        select(SaleReturn, User.full_name)
        .join(User, User.id == SaleReturn.user_id)
        .where(SaleReturn.sale_id == sale.id)
        .order_by(SaleReturn.id)
    ):
        parts = (
            await ctx.db.scalars(
                select(ReturnLine).where(ReturnLine.return_id == item.id).order_by(ReturnLine.id)
            )
        ).all()
        for part in parts:
            returned_amount[part.sale_line_id] = returned_amount.get(part.sale_line_id, 0) + part.amount
        returns.append(
            ReturnOut(
                id=item.id,
                created_at=item.created_at,
                user=user_name,
                amount=item.amount,
                debt_amount=item.debt_amount,
                refund=item.amount - item.debt_amount,
                method=item.method,
                lines=[
                    ReturnLineOut(
                        sku_label=labels[part.sale_line_id], meters=part.meters, amount=part.amount
                    )
                    for part in parts
                ],
            )
        )
    debt = await credit.sale_debt(ctx, sale.id)
    profit = None
    if is_owner and sale.status == "completed":
        profit = sum(
            line_amount(line.meters - line.returned_m, line.price_per_m - line.cost_per_m)
            if line.price_per_m >= line.cost_per_m
            else -line_amount(line.meters - line.returned_m, line.cost_per_m - line.price_per_m)
            for line, _ in lines
        )
    returnable = any(line.returned_m < line.meters for line, _ in lines)
    return SaleCard(
        **_row(sale, store.name, seller.full_name, customer).model_dump(),
        initial_payment=sale.initial_payment,
        initial_payment_method=sale.initial_payment_method,
        lines=[
            SaleLineOut(
                id=line.id,
                sku_label=line.sku_label,
                batch_id=line.batch_id,
                batch_number=batch_number,
                meters=line.meters,
                kg=line.kg,
                price_per_m=line.price_per_m,
                recommended_price_per_m=line.recommended_price_per_m,
                amount=line.amount,
                returned_m=line.returned_m,
                returned_amount=returned_amount.get(line.id, 0),
                negative_stock_note=line.negative_stock_note,
                cost_per_m=line.cost_per_m if is_owner else None,  # tannarx sotuvchiga ko'rinmaydi
            )
            for line, batch_number in lines
        ],
        debt=DebtOut(
            amount=debt.amount, remaining=debt.remaining, due_date=debt.due_date, status=debt.status
        )
        if debt
        else None,
        returns=returns,
        profit=profit,
        cancelled_by=cancelled_by.full_name if cancelled_by else None,
        cancelled_at=sale.cancelled_at,
        cancel_reason=sale.cancel_reason,
        can_cancel=_may_cancel(ctx, sale),
        can_return=sale.status == "completed" and returnable,
    )


# ====================== Bekor qilish ======================


async def cancel_sale(ctx: AuthContext, sale_id: int, reason: str) -> None:
    """Xato kiritilgan sotuvni bekor qiladi: qoldiq va nasiya tiklanadi."""
    sale = await _sale(ctx, sale_id, lock=True)
    if sale.status != "completed":
        raise AppError(409, "sale_cancelled")
    if sale.returned_total > 0:
        raise AppError(409, "sale_has_returns")
    if not _may_cancel(ctx, sale):
        # Sotuvchi: begona sotuv yoki 10 daqiqa o'tgan — faqat biznes egasi bekor qiladi
        raise AppError(403, "cancel_window_passed")
    debt = await credit.sale_debt(ctx, sale.id, lock=True)
    credit.cancel_debt(debt)
    await credit.debt_closed(ctx, debt)

    lines = (
        await ctx.db.scalars(
            select(SaleLine).where(SaleLine.sale_id == sale.id).order_by(SaleLine.batch_id)
        )
    ).all()
    for line in lines:
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=line.batch_id,
            location_id=sale.store_id,
            qty_m=line.meters,
            type="sale_cancel",
            status="open",  # partiya shu orada yopilgan bo'lsa — qayta ochiladi
            ref_type="sale",
            ref_id=sale.id,
            user_id=ctx.user.id,
        )
    sale.status = "cancelled"
    sale.cancelled_by = ctx.user.id
    sale.cancelled_at = datetime.now(UTC)
    sale.cancel_reason = reason
    _log(ctx, "sale.cancelled", sale.store_id, name=sale.number, reason=reason, total=sale.total)


# ====================== Qaytarish ======================


async def return_sale(ctx: AuthContext, sale_id: int, body: ReturnIn) -> ReturnCreated:
    """Mijoz tovarni qaytardi: metr shu do'kondagi o'sha partiyaga qaytadi; pul qaytariladi yoki
    (nasiya bo'lsa) qarzdan ayriladi."""
    sale = await _sale(ctx, sale_id, lock=True)
    if sale.status != "completed":
        raise AppError(409, "sale_cancelled")
    lines = {
        line.id: line
        for line in (await ctx.db.scalars(select(SaleLine).where(SaleLine.sale_id == sale.id))).all()
    }
    wanted = {item.sale_line_id: item.meters for item in body.lines}
    if len(wanted) != len(body.lines) or not set(wanted) <= set(lines):
        raise _field_error("lines", "invalid")
    already = dict(
        (
            await ctx.db.execute(
                select(ReturnLine.sale_line_id, func.sum(ReturnLine.amount))
                .where(ReturnLine.sale_line_id.in_(wanted))
                .group_by(ReturnLine.sale_line_id)
            )
        ).all()
    )

    parts = []
    for line_id in sorted(wanted, key=lambda key: lines[key].batch_id):
        line, meters = lines[line_id], wanted[line_id]
        left = line.meters - line.returned_m
        if meters > left:
            raise AppError(409, "return_too_much", label=line.sku_label, available=str(left))
        # Oxirgi qism qaytarilganda — qolgan summaning hammasi (yaxlitlash farqi yig'ilib qolmaydi)
        amount = (
            line.amount - int(already.get(line.id, 0))
            if meters == left
            else line_amount(meters, line.price_per_m)
        )
        line.returned_m += meters
        parts.append((line, meters, amount))
    total = sum(amount for _, _, amount in parts)

    debt = await credit.sale_debt(ctx, sale.id, lock=True)
    offset = credit.offset_return(debt, total)
    await credit.debt_closed(ctx, debt)
    refund = total - offset
    returned = SaleReturn(
        business_id=ctx.business.id,
        sale_id=sale.id,
        store_id=sale.store_id,
        user_id=ctx.user.id,
        amount=total,
        debt_amount=offset,
        method=body.method if refund > 0 else None,
    )
    ctx.db.add(returned)
    await ctx.db.flush()
    for line, meters, amount in parts:
        ctx.db.add(
            ReturnLine(
                business_id=ctx.business.id,
                return_id=returned.id,
                sale_line_id=line.id,
                meters=meters,
                amount=amount,
            )
        )
        await move_stock(
            ctx.db,
            business_id=ctx.business.id,
            batch_id=line.batch_id,
            location_id=sale.store_id,
            qty_m=meters,
            type="return",
            status="open",  # partiya shu joyda yopilgan bo'lsa — qayta ochiladi
            ref_type="sale",
            ref_id=sale.id,
            user_id=ctx.user.id,
        )
    sale.returned_total += total

    _log(ctx, "sale.returned", sale.store_id, name=sale.number, amount=total)
    store = await ctx.db.get(Location, sale.store_id)
    await notifications.notify_owners(
        ctx.db,
        ctx.business.id,
        "sale.returned",
        {
            "sale_id": sale.id,
            "number": sale.number,
            "amount": total,
            "store": store.name,
            "by": ctx.user.full_name,
        },
        exclude=ctx.user.id,
    )
    return ReturnCreated(id=returned.id, amount=total, debt_amount=offset, refund=refund)
