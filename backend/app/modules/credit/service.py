"""Nasiya mantiqi: mijozlar, qarzlar, to'lovlar, hisobdan chiqarish.

Qoidalar (docs/03-details/07-nasiya.md):
- mijoz biznes bo'yicha umumiy; o'chirilmaydi, qarzi bo'lsa faolsizlantirilmaydi;
- qarz har nasiya sotuvdan alohida; qolgan qarz = amount − paid − written_off − returned;
- to'lov eng eski qarzdan boshlab yopadi (yoki tanlangan bitta qarzni); qarzdan ko'p to'lab bo'lmaydi;
- hisobdan chiqarishda sabab majburiy; egalarga xabar boradi;
- hammasi jurnalga ("Nasiya").
Sotuv moduli qarzni shu yerdagi funksiyalar orqali yozadi (`open_debt`, `offset_return`, `cancel_debt`).
"""
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.exc import IntegrityError

from app.core.audit import log_event
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.auth.schemas import normalize_phone
from app.modules.credit.models import Customer, Debt, DebtPayment, DebtWriteoff, PaymentAllocation
from app.modules.credit.schemas import (
    Aging,
    AllocationOut,
    CustomerBrief,
    CustomerCard,
    CustomerIn,
    CustomerPage,
    CustomerRow,
    CustomerUpdate,
    DebtRow,
    PaymentCreated,
    PaymentIn,
    PaymentOut,
    PaymentPage,
    WriteoffIn,
    WriteoffOut,
    WriteoffPage,
)
from app.modules.notifications import service as notifications
from app.modules.sales.models import Sale
from app.modules.structure.models import Location

_REMAINING = Debt.amount - Debt.paid - Debt.written_off - Debt.returned


# Kartochkada tarixning birinchi sahifasi; qolgani — "Yana ko'rsatish" bilan
HISTORY_PAGE = 20


def overdue_key(debt_id: int) -> str:
    """Muddati o'tgan qarz xabari — har qarz uchun bir marta."""
    return f"debt_overdue:{debt_id}"


def _today(timezone: str) -> date:
    """Biznes kuni (qarz muddati shu bo'yicha hisoblanadi)."""
    return datetime.now(ZoneInfo(timezone)).date()


def _log(ctx: AuthContext, event_code: str, location_id: int | None = None, **data: Any) -> None:
    log_event(
        ctx.db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        location_id=location_id if location_id is not None else (ctx.store.id if ctx.store else None),
        category="credit",
        event_code=event_code,
        data=data,
    )


def _like(search: str) -> str:
    escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _debts(ctx: AuthContext, customer_ids: list[int]) -> dict[int, int]:
    """Mijozlarning umumiy qolgan qarzi."""
    if not customer_ids:
        return {}
    rows = await ctx.db.execute(
        select(Debt.customer_id, func.sum(_REMAINING))
        .where(Debt.customer_id.in_(customer_ids), Debt.status == "active")
        .group_by(Debt.customer_id)
    )
    return {customer_id: int(total or 0) for customer_id, total in rows}


async def brief(ctx: AuthContext, customer: Customer) -> CustomerBrief:
    debts = await _debts(ctx, [customer.id])
    return CustomerBrief(
        id=customer.id, name=customer.name, phone=customer.phone, debt=debts.get(customer.id, 0)
    )


async def search_customers(
    ctx: AuthContext, search: str | None = None, limit: int = 20
) -> list[CustomerBrief]:
    """Sotuv ekranidagi tanlov: ism yoki telefon bo'yicha (telefon — raqamlarning istalgan qismi)."""
    query = select(Customer).where(Customer.is_active).order_by(func.lower(Customer.name))
    if search and search.strip():
        like = _like(search)
        digits = "".join(ch for ch in search if ch.isdigit())
        conditions = [Customer.name.ilike(like, escape="\\")]
        if digits:
            conditions.append(Customer.phone.like(f"%{digits}%"))
        query = query.where(or_(*conditions))
    customers = (await ctx.db.scalars(query.limit(limit))).all()
    debts = await _debts(ctx, [customer.id for customer in customers])
    return [
        CustomerBrief(id=c.id, name=c.name, phone=c.phone, debt=debts.get(c.id, 0))
        for c in customers
    ]


async def create_customer(ctx: AuthContext, body: CustomerIn) -> Customer:
    phone = normalize_phone(body.phone)
    if phone is None:
        raise AppError(422, "validation_error", fields={"phone": "invalid_phone"})
    existing = await ctx.db.scalar(select(Customer).where(Customer.phone == phone))
    if existing is not None:
        # "Bu raqam [ism]ga tegishli" — interfeys mavjud mijozni taklif qiladi
        raise AppError(409, "customer_phone_taken", customer_id=existing.id, name=existing.name)
    customer = Customer(
        business_id=ctx.business.id, name=body.name, phone=phone, note=body.note or None
    )
    ctx.db.add(customer)
    try:
        async with ctx.db.begin_nested():
            await ctx.db.flush()
    except IntegrityError:  # ikki so'rov bir vaqtda kelgan bo'lsa
        raise AppError(409, "customer_phone_taken") from None
    _log(ctx, "customer.created", name=customer.name)
    return customer


async def require_customer(ctx: AuthContext, customer_id: int) -> Customer:
    customer = await ctx.db.get(Customer, customer_id)  # RLS: begona biznes mijozi ko'rinmaydi
    if customer is None or not customer.is_active:
        raise AppError(422, "validation_error", fields={"customer_id": "invalid"})
    return customer


# ====================== Qarz (sotuv moduli chaqiradi) ======================


def open_debt(ctx: AuthContext, customer: Customer, sale_id: int, amount: int) -> Debt:
    """Nasiya sotuv qarzi. Muddat bugundan (biznes vaqti bo'yicha) sozlamadagi kun qadar."""
    today = _today(ctx.business.timezone)
    debt = Debt(
        business_id=ctx.business.id,
        customer_id=customer.id,
        sale_id=sale_id,
        amount=amount,
        due_date=today + timedelta(days=ctx.business.credit_days),
    )
    ctx.db.add(debt)
    return debt


async def sale_debt(ctx: AuthContext, sale_id: int, *, lock: bool = False) -> Debt | None:
    query = select(Debt).where(Debt.sale_id == sale_id)
    if lock:  # qaytarish va to'lov bir vaqtda kelsa — biri ikkinchisini kutadi
        query = query.with_for_update().execution_options(populate_existing=True)
    return await ctx.db.scalar(query)


def offset_return(debt: Debt | None, amount: int) -> int:
    """Qaytarilgan tovar summasini qarzdan ayiradi. Qarzdan ayirilgan qismni qaytaradi
    (qolgani mijozga pul bilan qaytariladi — u allaqachon to'lagan)."""
    if debt is None or debt.status != "active":
        return 0
    offset = min(amount, debt.remaining)
    debt.returned += offset
    return offset


def cancel_debt(debt: Debt | None) -> None:
    """Sotuv bekor qilindi — qarz ham bekor. Qarzga to'lov yoki hisobdan chiqarish bo'lgan bo'lsa,
    sotuvni bekor qilib bo'lmaydi (avval ular hal qilinadi)."""
    if debt is None:
        return
    if debt.paid > 0 or debt.written_off > 0:
        raise AppError(409, "debt_has_payments")
    debt.status = "cancelled"


async def debt_closed(ctx: AuthContext, debt: Debt | None) -> None:
    """Qarz to'liq yopildi yoki bekor bo'ldi — "muddati o'tdi" xabari endi kerak emas."""
    if debt is not None and (debt.status != "active" or debt.remaining == 0):
        await notifications.resolve(ctx.db, ctx.business.id, overdue_key(debt.id))


# ====================== Mijozlar ro'yxati ======================


def _row(
    ctx: AuthContext,
    customer: Customer,
    debt: int | None,
    overdue: int | None,
    oldest: datetime | None,
    last_payment: datetime | None,
    last_amount: int | None = None,
) -> CustomerRow:
    zone = ZoneInfo(ctx.business.timezone)
    return CustomerRow(
        id=customer.id,
        name=customer.name,
        phone=customer.phone,
        note=customer.note,
        is_active=customer.is_active,
        debt=int(debt or 0),
        overdue=int(overdue or 0),
        oldest_days=(_today(ctx.business.timezone) - oldest.astimezone(zone).date()).days if oldest else None,
        last_payment_at=last_payment,
        last_payment_amount=last_amount,
    )


def aging_buckets(today: date) -> dict[str, Any]:
    """Muddat oraliqlari sharti (kun = bugun − muddat): 30-kun — "1–30", 31- va 60-kun — "31–60", 61+ — "60+"."""
    return {
        "not_due": Debt.due_date >= today,
        "d1_30": and_(Debt.due_date < today, Debt.due_date >= today - timedelta(days=30)),
        "d31_60": and_(
            Debt.due_date < today - timedelta(days=30), Debt.due_date >= today - timedelta(days=60)
        ),
        "d60_plus": Debt.due_date < today - timedelta(days=60),
    }


async def debt_summary(ctx: AuthContext, store_id: int | None = None) -> tuple[Aging, int]:
    """(muddat taqsimoti, qarzdorlar soni) — bitta yig'ma so'rov bilan. Do'kon tanlansa — shu do'kondagi
    nasiya sotuvlar qarzi."""
    buckets = aging_buckets(_today(ctx.business.timezone))
    query = select(
        func.coalesce(func.sum(_REMAINING), 0),
        *(func.coalesce(func.sum(_REMAINING).filter(condition), 0) for condition in buckets.values()),
        func.count(distinct(Debt.customer_id)),
    ).where(Debt.status == "active", _REMAINING > 0)
    if store_id is not None:
        query = query.join(Sale, Sale.id == Debt.sale_id).where(Sale.store_id == store_id)
    total, *parts, debtors = (await ctx.db.execute(query)).one()
    return Aging(total=int(total), **dict(zip(buckets, map(int, parts), strict=True))), debtors


def _with_totals(ctx: AuthContext):
    """Mijozlar + har birining qarzi, muddati o'tgan qismi, eng eski qarz sanasi va oxirgi to'lovi."""
    open_debts = (
        select(
            Debt.customer_id.label("customer_id"),
            func.sum(_REMAINING).label("debt"),
            func.sum(_REMAINING).filter(Debt.due_date < _today(ctx.business.timezone)).label("overdue"),
            func.min(Debt.created_at).label("oldest"),
            # Muddat oraliqlari — ro'yxatni "60+ kunlilar" kabi filtrlash uchun
            *(
                func.coalesce(func.sum(_REMAINING).filter(condition), 0).label(name)
                for name, condition in aging_buckets(_today(ctx.business.timezone)).items()
            ),
        )
        .where(Debt.status == "active", _REMAINING > 0)
        .group_by(Debt.customer_id)
        .subquery()
    )
    # Har mijozning oxirgi to'lovi: sanasi va summasi (DISTINCT ON — eng yangi to'lov qatori)
    payments = (
        select(
            DebtPayment.customer_id.label("customer_id"),
            DebtPayment.created_at.label("last"),
            DebtPayment.amount.label("last_amount"),
        )
        .ext(distinct_on(DebtPayment.customer_id))
        .order_by(DebtPayment.customer_id, DebtPayment.id.desc())
        .subquery()
    )
    return open_debts, payments


async def list_customers(
    ctx: AuthContext,
    *,
    search: str | None = None,
    only: str | None = None,
    sort: str = "name",
    include_inactive: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> CustomerPage:
    open_debts, payments = _with_totals(ctx)
    debt = func.coalesce(open_debts.c.debt, 0)
    overdue = func.coalesce(open_debts.c.overdue, 0)
    conditions = []
    if not include_inactive:
        conditions.append(Customer.is_active)
    if search and search.strip():
        like = _like(search)
        digits = "".join(ch for ch in search if ch.isdigit())
        found = [Customer.name.ilike(like, escape="\\")]
        if digits:
            found.append(Customer.phone.like(f"%{digits}%"))
        conditions.append(or_(*found))
    if only == "debtors":
        conditions.append(debt > 0)
    elif only == "overdue":
        conditions.append(overdue > 0)
    elif only in ("not_due", "d1_30", "d31_60", "d60_plus"):
        conditions.append(func.coalesce(open_debts.c[only], 0) > 0)

    def joined(*columns: Any):
        return (
            select(*columns)
            .select_from(Customer)
            .outerjoin(open_debts, open_debts.c.customer_id == Customer.id)
            .outerjoin(payments, payments.c.customer_id == Customer.id)
            .where(*conditions)
        )

    order = {
        "debt": [debt.desc()],
        "oldest": [open_debts.c.oldest.asc().nulls_last()],
    }.get(sort, [])
    rows = (
        await ctx.db.execute(
            joined(
                Customer,
                open_debts.c.debt,
                open_debts.c.overdue,
                open_debts.c.oldest,
                payments.c.last,
                payments.c.last_amount,
            )
            .order_by(*order, func.lower(Customer.name), Customer.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total, debt_total, overdue_total = (
        await ctx.db.execute(joined(func.count(), func.sum(debt), func.sum(overdue)))
    ).one()
    aging, _ = await debt_summary(ctx)
    return CustomerPage(
        aging=aging,
        items=[_row(ctx, *row) for row in rows],
        total=total,
        debt_total=int(debt_total or 0),
        overdue_total=int(overdue_total or 0),
    )


# ====================== Mijoz kartochkasi ======================


async def _customer(ctx: AuthContext, customer_id: int) -> Customer:
    customer = await ctx.db.get(Customer, customer_id)  # RLS: begona biznes mijozi ko'rinmaydi
    if customer is None:
        raise AppError(404, "customer_not_found")
    return customer


async def get_customer(ctx: AuthContext, customer_id: int) -> CustomerCard:
    customer = await _customer(ctx, customer_id)
    open_debts, payments = _with_totals(ctx)
    totals = (
        await ctx.db.execute(
            select(
                open_debts.c.debt,
                open_debts.c.overdue,
                open_debts.c.oldest,
                payments.c.last,
                payments.c.last_amount,
            )
            .select_from(Customer)
            .outerjoin(open_debts, open_debts.c.customer_id == Customer.id)
            .outerjoin(payments, payments.c.customer_id == Customer.id)
            .where(Customer.id == customer.id)
        )
    ).one()
    today = _today(ctx.business.timezone)
    zone = ZoneInfo(ctx.business.timezone)

    debts = (
        await ctx.db.execute(
            select(Debt, Sale, Location.name, User.full_name)
            .join(Sale, Sale.id == Debt.sale_id)
            .join(Location, Location.id == Sale.store_id)
            .join(User, User.id == Sale.seller_id)
            .where(Debt.customer_id == customer.id, Debt.status == "active")
            # Yopilmaganlari tepada, eng eskisi birinchi (to'lov shu tartibda yopadi); yopilganlari — oxirida
            .order_by((_REMAINING == 0), Debt.created_at, Debt.id)
        )
    ).all()
    payments = await list_payments(ctx, customer.id, limit=HISTORY_PAGE, known=customer)
    writeoffs = await list_writeoffs(ctx, customer.id, limit=HISTORY_PAGE, known=customer)

    return CustomerCard(
        **_row(ctx, customer, *totals).model_dump(),
        debts=[
            DebtRow(
                id=debt.id,
                sale_id=sale.id,
                sale_number=sale.number,
                created_at=debt.created_at,
                store=store,
                seller=seller,
                sale_total=sale.total,
                initial_payment=sale.initial_payment,
                amount=debt.amount,
                paid=debt.paid,
                written_off=debt.written_off,
                returned=debt.returned,
                remaining=debt.remaining,
                due_date=debt.due_date,
                overdue=debt.remaining > 0 and debt.due_date < today,
                days=(today - debt.created_at.astimezone(zone).date()).days,
            )
            for debt, sale, store, seller in debts
        ],
        payments=payments.items,
        payments_total=payments.total,
        writeoffs=writeoffs.items,
        writeoffs_total=writeoffs.total,
    )


async def list_payments(
    ctx: AuthContext, customer_id: int, *, limit: int = 20, offset: int = 0, known: Customer | None = None
) -> PaymentPage:
    """Mijozdan qabul qilingan to'lovlar — eng yangisi birinchi, sahifalab (tarix jimgina qirqilmaydi)."""
    customer = known or await _customer(ctx, customer_id)
    mine = DebtPayment.customer_id == customer.id
    paid = (
        await ctx.db.execute(
            select(DebtPayment, User.full_name, Location.name)
            .join(User, User.id == DebtPayment.user_id)
            .join(Location, Location.id == DebtPayment.store_id)
            .where(mine)
            .order_by(DebtPayment.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    allocations: dict[int, list[AllocationOut]] = {}
    for allocation, sale_id, number in await ctx.db.execute(
        select(PaymentAllocation, Sale.id, Sale.number)
        .join(Debt, Debt.id == PaymentAllocation.debt_id)
        .join(Sale, Sale.id == Debt.sale_id)
        .where(PaymentAllocation.payment_id.in_([payment.id for payment, _, _ in paid]))
        .order_by(PaymentAllocation.id)
    ):
        allocations.setdefault(allocation.payment_id, []).append(
            AllocationOut(sale_id=sale_id, sale_number=number, amount=allocation.amount)
        )
    total = await ctx.db.scalar(select(func.count()).select_from(DebtPayment).where(mine))
    return PaymentPage(
        items=[
            PaymentOut(
                id=payment.id,
                created_at=payment.created_at,
                amount=payment.amount,
                method=payment.method,
                user=user,
                store=store,
                allocations=allocations.get(payment.id, []),
            )
            for payment, user, store in paid
        ],
        total=total or 0,
    )


async def list_writeoffs(
    ctx: AuthContext, customer_id: int, *, limit: int = 20, offset: int = 0, known: Customer | None = None
) -> WriteoffPage:
    """Mijoz qarzlaridan hisobdan chiqarilganlari — eng yangisi birinchi, sahifalab."""
    customer = known or await _customer(ctx, customer_id)
    rows = (
        await ctx.db.execute(
            select(DebtWriteoff, User.full_name, Sale.id, Sale.number)
            .join(Debt, Debt.id == DebtWriteoff.debt_id)
            .join(Sale, Sale.id == Debt.sale_id)
            .join(User, User.id == DebtWriteoff.user_id)
            .where(Debt.customer_id == customer.id)
            .order_by(DebtWriteoff.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = await ctx.db.scalar(
        select(func.count())
        .select_from(DebtWriteoff)
        .join(Debt, Debt.id == DebtWriteoff.debt_id)
        .where(Debt.customer_id == customer.id)
    )
    return WriteoffPage(
        items=[
            WriteoffOut(
                id=item.id,
                created_at=item.created_at,
                amount=item.amount,
                reason=item.reason,
                user=user,
                sale_id=sale_id,
                sale_number=number,
            )
            for item, user, sale_id, number in rows
        ],
        total=total or 0,
    )


async def update_customer(ctx: AuthContext, customer_id: int, body: CustomerUpdate) -> None:
    customer = await _customer(ctx, customer_id)
    phone = normalize_phone(body.phone)
    if phone is None:
        raise AppError(422, "validation_error", fields={"phone": "invalid_phone"})
    if phone != customer.phone:
        existing = await ctx.db.scalar(select(Customer).where(Customer.phone == phone))
        if existing is not None:
            raise AppError(409, "customer_phone_taken", customer_id=existing.id, name=existing.name)
    customer.name, customer.phone, customer.note = body.name, phone, body.note or None
    try:
        async with ctx.db.begin_nested():
            await ctx.db.flush()
    except IntegrityError:
        raise AppError(409, "customer_phone_taken") from None
    _log(ctx, "customer.updated", name=customer.name)


async def set_customer_active(ctx: AuthContext, customer_id: int, is_active: bool) -> None:
    customer = await _customer(ctx, customer_id)
    if customer.is_active == is_active:
        return
    if not is_active and (await _debts(ctx, [customer.id])).get(customer.id, 0) > 0:
        raise AppError(409, "customer_has_debt")  # qarzi bor mijoz faolsizlantirilmaydi
    customer.is_active = is_active
    _log(ctx, "customer.activated" if is_active else "customer.deactivated", name=customer.name)


# ====================== To'lov ======================


async def receive_payment(
    ctx: AuthContext, customer_id: int, body: PaymentIn
) -> tuple[PaymentCreated, bool]:
    """Mijozdan to'lov qabul qiladi: eng eski qarzdan boshlab yopadi (yoki faqat tanlangan qarzni).
    (to'lov, takrormi) qaytaradi: shu identifikator bilan avval yozilgan bo'lsa — o'sha to'lov."""
    customer = await _customer(ctx, customer_id)
    # Qarzlar qulflanadi — bir vaqtdagi ikki to'lov yoki to'lov va qaytarish bir-birini kutadi
    debts = (
        await ctx.db.scalars(
            select(Debt)
            .where(Debt.customer_id == customer.id, Debt.status == "active", _REMAINING > 0)
            .order_by(Debt.created_at, Debt.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).all()
    # Takror shu yerda — qarzlar qulflangach tekshiriladi: bir vaqtda kelgan ikki bir xil so'rovning
    # ikkinchisi qulfda kutadi va birinchisi yozgan to'lovni ko'radi
    existing = await ctx.db.scalar(
        select(DebtPayment).where(DebtPayment.client_uuid == body.client_uuid)
    )
    if existing is not None:
        sent = (customer.id, body.amount, body.method)
        if (existing.customer_id, existing.amount, existing.method) != sent:
            raise AppError(409, "request_changed")
        remaining = (await _debts(ctx, [customer.id])).get(customer.id, 0)
        return PaymentCreated(id=existing.id, amount=existing.amount, debt=remaining), True
    if body.debt_id is not None:
        debts = [debt for debt in debts if debt.id == body.debt_id]
        if not debts:
            raise AppError(404, "debt_not_found")
    owed = sum(debt.remaining for debt in debts)
    if body.amount > owed:
        raise AppError(409, "payment_too_large", debt=owed)

    # Pul qaysi do'konga tushdi: sotuvchida — qurilma do'koni; egada — birinchi yopilayotgan qarzning do'koni
    store_id = ctx.store.id if ctx.store else (await ctx.db.get(Sale, debts[0].sale_id)).store_id
    payment = DebtPayment(
        business_id=ctx.business.id,
        client_uuid=body.client_uuid,
        customer_id=customer.id,
        store_id=store_id,
        user_id=ctx.user.id,
        amount=body.amount,
        method=body.method,
    )
    ctx.db.add(payment)
    await ctx.db.flush()
    left = body.amount
    for debt in debts:
        if left == 0:
            break
        part = min(left, debt.remaining)
        debt.paid += part
        left -= part
        ctx.db.add(
            PaymentAllocation(
                business_id=ctx.business.id, payment_id=payment.id, debt_id=debt.id, amount=part
            )
        )
        await debt_closed(ctx, debt)
    await ctx.db.flush()
    _log(ctx, "debt.paid", store_id, name=customer.name, amount=body.amount, method=body.method)
    remaining = (await _debts(ctx, [customer.id])).get(customer.id, 0)
    return PaymentCreated(id=payment.id, amount=body.amount, debt=remaining), False


# ====================== Hisobdan chiqarish ======================


async def write_off(ctx: AuthContext, debt_id: int, body: WriteoffIn) -> None:
    """Qarzni (to'liq yoki qisman) hisobdan chiqaradi. Sabab majburiy; egalarga xabar boradi."""
    debt = await ctx.db.scalar(
        select(Debt)
        .where(Debt.id == debt_id, Debt.status == "active")
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if debt is None:
        raise AppError(404, "debt_not_found")
    if body.amount > debt.remaining:
        raise AppError(409, "writeoff_too_large", debt=debt.remaining)
    customer = await ctx.db.get(Customer, debt.customer_id)
    sale = await ctx.db.get(Sale, debt.sale_id)

    ctx.db.add(
        DebtWriteoff(
            business_id=ctx.business.id,
            debt_id=debt.id,
            user_id=ctx.user.id,
            amount=body.amount,
            reason=body.reason,
        )
    )
    debt.written_off += body.amount
    await debt_closed(ctx, debt)
    _log(
        ctx,
        "debt.written_off",
        ctx.store.id if ctx.store else sale.store_id,
        name=customer.name,
        amount=body.amount,
        reason=body.reason,
        sale=sale.number,
    )
    await notifications.notify_owners(
        ctx.db,
        ctx.business.id,
        "debt.written_off",
        {
            "customer_id": customer.id,
            "customer": customer.name,
            "amount": body.amount,
            "reason": body.reason,
            "number": sale.number,
            "by": ctx.user.full_name,
        },
        exclude=ctx.user.id,
    )
