"""Hisobotlar: savdo, tushum, foyda, top tovarlar, qoldiq qiymati, nasiya, narx og'ishi.

Atamalar (docs/03-details/08-hisobotlar.md):
- Savdo  = sotuvlar summasi − qaytarishlar. Qaytarish qaytarilgan kunning savdosidan ayriladi.
- Tushum = kassaga tushgan pul: naqd/karta sotuvlar + boshlang'ich to'lovlar + qarz to'lovlari − pul bilan
           qaytarilgani. Naqd va karta alohida.
- Foyda  = savdo − sotilgan tovar tannarxi (sotuv qatorida saqlangan tannarx bo'yicha). Metr farqi va hisobdan
           chiqarilgan qarzlar kirmaydi.
Kun chegarasi — biznes vaqti (Toshkent) bo'yicha. Bekor qilingan sotuvlar hech qayerda hisoblanmaydi.

Hisobotlar yig'ma jadvaldan emas, asl jadvallardan (indekslar bilan) hisoblanadi — har doim aniq.
"""
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import (
    Date,
    Select,
    bindparam,
    case,
    cast,
    distinct,
    extract,
    func,
    literal,
    select,
    union_all,
)

from app.core.deps import AuthContext
from app.modules.auth.models import User
from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.credit import service as credit
from app.modules.credit.models import Debt, DebtPayment, DebtWriteoff
from app.modules.inventory import service as inventory
from app.modules.inventory.models import BatchStock
from app.modules.inventory.service import _day_range, _stock_rows
from app.modules.receiving.models import Batch
from app.modules.reports.schemas import (
    ChartDay,
    CreditReport,
    Dashboard,
    DeviationReport,
    DeviationRow,
    HourRow,
    HoursReport,
    Money,
    SalesReport,
    SalesRow,
    StockPlace,
    StockReport,
    TopRow,
    WeekdayRow,
)
from app.modules.sales.models import ReturnLine, Sale, SaleLine, SaleReturn
from app.modules.structure.models import Location

ZERO = Decimal(0)
CHART_DAYS = 30
_REMAINING = Debt.amount - Debt.paid - Debt.written_off - Debt.returned


@dataclass(frozen=True)
class Scope:
    """Hisobot filtri: davr (ikkala kun ham kiradi) va ixtiyoriy do'kon, sotuvchi, mato."""

    date_from: date
    date_to: date
    store_id: int | None = None
    seller_id: int | None = None
    fabric_id: int | None = None

    @property
    def days(self) -> int:
        return (self.date_to - self.date_from).days + 1

    def previous(self) -> "Scope":
        """Shu uzunlikdagi, bevosita oldingi davr (bugun → kecha, shu hafta → o'tgan 7 kun ...)."""
        return replace(
            self,
            date_from=self.date_from - timedelta(days=self.days),
            date_to=self.date_from - timedelta(days=1),
        )


def today(ctx: AuthContext) -> date:
    return datetime.now(ZoneInfo(ctx.business.timezone)).date()


def _local(ctx: AuthContext, column: Any) -> Any:
    """Vaqtni biznes mintaqasiga o'giradi. Mintaqa so'rovga qiymat sifatida yoziladi — ifoda SELECT va
    GROUP BY da bir xil chiqishi uchun (aks holda PostgreSQL ularni turli ifoda deb biladi)."""
    return func.timezone(bindparam(None, ctx.business.timezone, literal_execute=True), column)


def _day(ctx: AuthContext, column: Any) -> Any:
    return cast(_local(ctx, column), Date)


def _period(ctx: AuthContext, scope: Scope, column: Any) -> list:
    return _day_range(ctx, scope.date_from, scope.date_to, column)


# ====================== Savdo, tushum, foyda — kunlar bo'yicha ======================


@dataclass
class _Day:
    sold: int = 0
    sold_profit: int = 0
    sold_m: Decimal = ZERO
    count: int = 0
    returned: int = 0
    returned_profit: int = 0
    returned_m: Decimal = ZERO
    cash: int = 0
    card: int = 0

    def add(self, other: "_Day") -> None:
        for field in self.__dataclass_fields__:
            setattr(self, field, getattr(self, field) + getattr(other, field))

    def money(self, with_revenue: bool) -> dict[str, Any]:
        return {
            "sales": self.sold - self.returned,
            "returns": self.returned,
            "profit": self.sold_profit - self.returned_profit,
            "cash": self.cash if with_revenue else None,
            "card": self.card if with_revenue else None,
            "count": self.count,
            "meters": self.sold_m - self.returned_m,
        }


def _by_fabric(query: Select, scope: Scope) -> Select:
    if scope.fabric_id is None:
        return query
    return query.join(Sku, Sku.id == SaleLine.sku_id).where(Sku.fabric_id == scope.fabric_id)


async def _days(ctx: AuthContext, scope: Scope) -> dict[date, _Day]:
    """Davrning har kuni uchun ko'rsatkichlar (harakat bo'lmagan kunlar — nol)."""
    days = {scope.date_from + timedelta(days=shift): _Day() for shift in range(scope.days)}

    # Sotuvlar: qatorlar bo'yicha (mato filtri uchun), sotilgan kunga yoziladi
    day = _day(ctx, Sale.created_at)
    cost = func.round(SaleLine.cost_per_m * SaleLine.meters)
    sold = (
        select(
            day,
            func.sum(SaleLine.amount),
            func.sum(SaleLine.amount - cost),
            func.sum(SaleLine.meters),
            func.count(distinct(Sale.id)),
        )
        .select_from(SaleLine)
        .join(Sale, Sale.id == SaleLine.sale_id)
        .where(Sale.status == "completed", *_period(ctx, scope, Sale.created_at))
        .group_by(day)
    )
    if scope.store_id is not None:
        sold = sold.where(Sale.store_id == scope.store_id)
    if scope.seller_id is not None:
        sold = sold.where(Sale.seller_id == scope.seller_id)
    for key, amount, profit, meters, count in await ctx.db.execute(_by_fabric(sold, scope)):
        row = days[key]
        row.sold, row.sold_profit, row.sold_m, row.count = int(amount), int(profit), meters, count

    # Qaytarishlar: qaytarilgan kunga yoziladi (sotilgan kunga emas)
    day = _day(ctx, SaleReturn.created_at)
    cost = func.round(SaleLine.cost_per_m * ReturnLine.meters)
    returned = (
        select(day, func.sum(ReturnLine.amount), func.sum(ReturnLine.amount - cost), func.sum(ReturnLine.meters))
        .select_from(ReturnLine)
        .join(SaleReturn, SaleReturn.id == ReturnLine.return_id)
        .join(SaleLine, SaleLine.id == ReturnLine.sale_line_id)
        .join(Sale, Sale.id == SaleLine.sale_id)
        .where(*_period(ctx, scope, SaleReturn.created_at))
        .group_by(day)
    )
    if scope.store_id is not None:
        returned = returned.where(SaleReturn.store_id == scope.store_id)
    if scope.seller_id is not None:
        returned = returned.where(Sale.seller_id == scope.seller_id)
    for key, amount, profit, meters in await ctx.db.execute(_by_fabric(returned, scope)):
        row = days[key]
        row.returned, row.returned_profit, row.returned_m = int(amount), int(profit), meters

    if scope.fabric_id is None:  # pul matoga bog'lanmaydi — mato tanlanganda tushum hisoblanmaydi
        for key, method, amount in await _revenue(ctx, scope):
            row = days[key]
            if method == "cash":
                row.cash += amount
            else:
                row.card += amount
    return days


async def _revenue(ctx: AuthContext, scope: Scope) -> list[tuple[date, str, int]]:
    """Kassaga tushgan pul: (kun, naqd | karta, summa). Qaytarilgan pul — manfiy."""

    def scoped(query: Select, store: Any, seller: Any) -> Select:
        if scope.store_id is not None:
            query = query.where(store == scope.store_id)
        if scope.seller_id is not None:
            query = query.where(seller == scope.seller_id)
        return query

    sale_day = _day(ctx, Sale.created_at)
    in_period = [Sale.status == "completed", *_period(ctx, scope, Sale.created_at)]
    paid_day = _day(ctx, DebtPayment.created_at)
    return_day = _day(ctx, SaleReturn.created_at)
    refund = SaleReturn.amount - SaleReturn.debt_amount
    # To'rt manba bitta so'rovda (UNION ALL): pul bilan qaytarilgani — manfiy
    parts = [
        # Naqd va karta sotuvlar
        scoped(
            select(sale_day, Sale.payment_type, func.sum(Sale.total), literal(1))
            .where(*in_period, Sale.payment_type.in_(("cash", "card")))
            .group_by(sale_day, Sale.payment_type),
            Sale.store_id,
            Sale.seller_id,
        ),
        # Nasiya sotuvlarning boshlang'ich to'lovi
        scoped(
            select(sale_day, Sale.initial_payment_method, func.sum(Sale.initial_payment), literal(1))
            .where(*in_period, Sale.payment_type == "credit", Sale.initial_payment > 0)
            .group_by(sale_day, Sale.initial_payment_method),
            Sale.store_id,
            Sale.seller_id,
        ),
        # Qarz to'lovlari — qabul qilingan kun va do'konga
        scoped(
            select(paid_day, DebtPayment.method, func.sum(DebtPayment.amount), literal(1))
            .where(*_period(ctx, scope, DebtPayment.created_at))
            .group_by(paid_day, DebtPayment.method),
            DebtPayment.store_id,
            DebtPayment.user_id,
        ),
        # Pul bilan qaytarilgani ayriladi (qarzdan ayirilgan qismi pul emas)
        scoped(
            select(return_day, SaleReturn.method, func.sum(refund), literal(-1))
            .where(*_period(ctx, scope, SaleReturn.created_at), SaleReturn.method.is_not(None))
            .group_by(return_day, SaleReturn.method),
            SaleReturn.store_id,
            SaleReturn.user_id,
        ),
    ]
    return [
        (key, method, sign * int(amount))
        for key, method, amount, sign in await ctx.db.execute(union_all(*parts))
    ]


def _sum(rows: list[_Day]) -> _Day:
    total = _Day()
    for row in rows:
        total.add(row)
    return total


async def totals(ctx: AuthContext, scope: Scope) -> Money:
    days = await _days(ctx, scope)
    return Money(**_sum(list(days.values())).money(scope.fabric_id is None))


async def sales_report(ctx: AuthContext, scope: Scope, group: str = "day") -> SalesReport:
    days = await _days(ctx, scope)
    with_revenue = scope.fabric_id is None
    grouped: dict[str, _Day] = {}
    for key, row in days.items():
        grouped.setdefault(key.isoformat()[: 7 if group == "month" else 10], _Day()).add(row)
    return SalesReport(
        group=group,
        rows=[SalesRow(period=period, **row.money(with_revenue)) for period, row in grouped.items()],
        total=Money(**_sum(list(days.values())).money(with_revenue)),
        previous=await totals(ctx, scope.previous()),
    )


# ====================== Bosh sahifa ======================


def period_scope(ctx: AuthContext, period: str, store_id: int | None) -> Scope:
    """Bugun | shu hafta (dushanbadan) | shu oy (1-kundan) — bugungi kungacha."""
    end = today(ctx)
    start = {"week": end - timedelta(days=end.weekday()), "month": end.replace(day=1)}.get(period, end)
    return Scope(start, end, store_id=store_id)


async def dashboard(ctx: AuthContext, period: str = "day", store_id: int | None = None) -> Dashboard:
    scope = period_scope(ctx, period, store_id)
    previous = scope.previous()
    aging, _ = await credit.debt_summary(ctx, store_id)
    low_by_place, low_anywhere = await inventory.low_stock_counts(ctx)
    diff = await inventory.difference_totals(
        ctx, date_from=scope.date_from, date_to=scope.date_to, location_id=store_id
    )
    # Joriy davr, oldingi davr va grafik (oxirgi 30 kun) — kunlar bo'yicha bitta o'tishda olinadi
    chart_from = scope.date_to - timedelta(days=CHART_DAYS - 1)
    days = await _days(ctx, Scope(min(previous.date_from, chart_from), scope.date_to, store_id))

    def money(part: Scope) -> Money:
        rows = [row for key, row in days.items() if part.date_from <= key <= part.date_to]
        return Money(**_sum(rows).money(True))

    return Dashboard(
        date_from=scope.date_from,
        date_to=scope.date_to,
        current=money(scope),
        previous=money(previous),
        debt_total=aging.total,
        debt_overdue=aging.total - aging.not_due,
        debt_aging=aging,
        low_stock=low_anywhere if store_id is None else low_by_place.get(store_id, 0),
        diff_amount=diff.shortage_amount + diff.transfer_amount,
        diff_m=diff.shortage_m + diff.transfer_m,
        chart=[
            ChartDay(day=key, sales=row.sold - row.returned)
            for key, row in days.items()
            if key >= chart_from
        ],
    )


# ====================== Soatlar va hafta kunlari ======================


async def hours_report(ctx: AuthContext, scope: Scope) -> HoursReport:
    """Qaysi soatda va haftaning qaysi kunida ko'p sotiladi (sotuvlar soni va summasi)."""

    async def grouped(part: str) -> dict[int, tuple[int, int]]:
        key = extract(part, _local(ctx, Sale.created_at))
        query = (
            select(key, func.count(distinct(Sale.id)), func.sum(SaleLine.amount))
            .select_from(SaleLine)
            .join(Sale, Sale.id == SaleLine.sale_id)
            .where(Sale.status == "completed", *_period(ctx, scope, Sale.created_at))
            .group_by(key)
        )
        if scope.store_id is not None:
            query = query.where(Sale.store_id == scope.store_id)
        if scope.seller_id is not None:
            query = query.where(Sale.seller_id == scope.seller_id)
        rows = await ctx.db.execute(_by_fabric(query, scope))
        return {int(value): (count, int(amount)) for value, count, amount in rows}

    hours, weekdays = await grouped("hour"), await grouped("isodow")
    return HoursReport(
        hours=[
            HourRow(hour=hour, count=hours[hour][0], amount=hours[hour][1])
            for hour in sorted(hours)
        ],
        weekdays=[
            WeekdayRow(weekday=day, count=weekdays.get(day, (0, 0))[0], amount=weekdays.get(day, (0, 0))[1])
            for day in range(1, 8)
        ],
    )


# ====================== Eng ko'p sotilgan tovarlar ======================


def _net_lines() -> tuple[Any, Any, Any, Any]:
    """Sotuv qatorining sof ko'rsatkichlari (qaytarilgani ayirilgan): (so'rov uchun bog'lanish, metr, summa, foyda)."""
    returned = (
        select(
            ReturnLine.sale_line_id.label("line_id"),
            func.sum(ReturnLine.amount).label("amount"),
            func.sum(ReturnLine.meters).label("meters"),
        )
        .group_by(ReturnLine.sale_line_id)
        .subquery()
    )
    meters = SaleLine.meters - func.coalesce(returned.c.meters, 0)
    amount = SaleLine.amount - func.coalesce(returned.c.amount, 0)
    profit = amount - func.round(SaleLine.cost_per_m * meters)
    return returned, meters, amount, profit


async def top_report(
    ctx: AuthContext, scope: Scope, by: str = "sku", metric: str = "amount", limit: int = 10
) -> list[TopRow]:
    """Top tovarlar: SKU, mato, rang yoki gul bo'yicha; metr, savdo summasi yoki foyda bo'yicha saralanadi."""
    returned, meters, amount, profit = _net_lines()
    if by == "sku":
        key, label = SaleLine.sku_id, func.max(SaleLine.sku_label)
        group = [SaleLine.sku_id]
    else:
        table = {"fabric": Fabric, "color": Color, "pattern": Pattern}[by]
        key, label = table.id, func.max(table.code + " · " + table.name)
        if by == "pattern":  # "gulsiz" kodsiz ko'rsatiladi
            label = func.max(case((Pattern.is_plain, Pattern.name), else_=Pattern.code + " · " + Pattern.name))
        group = [table.id]
    sums = {"meters": func.sum(meters), "amount": func.sum(amount), "profit": func.sum(profit)}
    query = (
        select(key, label, sums["meters"], sums["amount"], sums["profit"])
        .select_from(SaleLine)
        .join(Sale, Sale.id == SaleLine.sale_id)
        .join(Sku, Sku.id == SaleLine.sku_id)
        .outerjoin(returned, returned.c.line_id == SaleLine.id)
        .where(Sale.status == "completed", *_period(ctx, scope, Sale.created_at))
        .group_by(*group)
        .having(func.sum(meters) > 0)
        .order_by(sums[metric].desc(), key)
        .limit(limit)
    )
    if by != "sku":
        query = query.join(table, table.id == getattr(Sku, f"{by}_id"))
    if scope.store_id is not None:
        query = query.where(Sale.store_id == scope.store_id)
    if scope.seller_id is not None:
        query = query.where(Sale.seller_id == scope.seller_id)
    if scope.fabric_id is not None:
        query = query.where(Sku.fabric_id == scope.fabric_id)
    return [
        TopRow(id=row_id, label=text, meters=sold_m, amount=int(total), profit=int(gain))
        for row_id, text, sold_m, total, gain in await ctx.db.execute(query)
    ]


# ====================== Qoldiq qiymati ======================


async def stock_report(ctx: AuthContext) -> StockReport:
    """Har joyda qancha tovar bor: metr, taxminiy rulon va tannarx bo'yicha qiymati."""
    places: dict[int, dict[str, Any]] = {}
    rows = await ctx.db.execute(_stock_rows(BatchStock.location_id, BatchStock.qty_m, Batch))
    for location_id, qty_m, batch in rows:
        place = places.setdefault(location_id, {"meters": ZERO, "rolls": 0, "value": 0, "skus": set()})
        place["meters"] += qty_m
        place["rolls"] += inventory.rolls_estimate(batch, qty_m)
        place["value"] += inventory.amount(qty_m, batch.cost_per_m)
        if qty_m > 0:
            place["skus"].add(batch.sku_id)
    locations = (
        await ctx.db.scalars(
            select(Location)
            .where(Location.is_active | Location.id.in_(list(places)))
            .order_by(Location.type.desc(), Location.name)
        )
    ).all()
    low, _ = await inventory.low_stock_counts(ctx)  # barcha joylar uchun bitta so'rov
    result = []
    for location in locations:
        place = places.get(location.id, {"meters": ZERO, "rolls": 0, "value": 0, "skus": set()})
        result.append(
            StockPlace(
                location_id=location.id,
                name=location.name,
                type=location.type,
                meters=place["meters"],
                rolls=place["rolls"],
                value=place["value"],
                skus=len(place["skus"]),
                low=low.get(location.id, 0),
            )
        )
    return StockReport(
        places=result,
        meters=sum((place.meters for place in result), ZERO),
        value=sum(place.value for place in result),
    )


# ====================== Nasiya ======================


async def credit_report(ctx: AuthContext, scope: Scope) -> CreditReport:
    """Hozirgi qarz va davr ichidagi harakat: berilgan nasiya, qaytgan qarz, hisobdan chiqarilgan."""
    aging, debtors = await credit.debt_summary(ctx, scope.store_id)

    def of_store(query: Select, column: Any) -> Select:
        return query if scope.store_id is None else query.where(column == scope.store_id)

    given = await ctx.db.scalar(
        of_store(
            select(func.coalesce(func.sum(Debt.amount), 0))
            .join(Sale, Sale.id == Debt.sale_id)
            .where(Debt.status == "active", *_period(ctx, scope, Debt.created_at)),
            Sale.store_id,
        )
    )
    paid = await ctx.db.scalar(
        of_store(
            select(func.coalesce(func.sum(DebtPayment.amount), 0)).where(
                *_period(ctx, scope, DebtPayment.created_at)
            ),
            DebtPayment.store_id,
        )
    )
    returned = await ctx.db.scalar(
        of_store(
            select(func.coalesce(func.sum(SaleReturn.debt_amount), 0)).where(
                *_period(ctx, scope, SaleReturn.created_at)
            ),
            SaleReturn.store_id,
        )
    )
    written_off = await ctx.db.scalar(
        of_store(
            select(func.coalesce(func.sum(DebtWriteoff.amount), 0))
            .join(Debt, Debt.id == DebtWriteoff.debt_id)
            .join(Sale, Sale.id == Debt.sale_id)
            .where(*_period(ctx, scope, DebtWriteoff.created_at)),
            Sale.store_id,
        )
    )
    return CreditReport(
        debt_total=aging.total,
        debt_overdue=aging.total - aging.not_due,
        debtors=debtors,
        aging=aging,
        given=int(given),
        paid=int(paid),
        returned=int(returned),
        written_off=int(written_off),
    )


# ====================== Narx og'ishi ======================


def _percent(diff: int, expected: int) -> Decimal:
    if expected == 0:
        return ZERO
    return (Decimal(diff) * 100 / expected).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


async def deviation_report(ctx: AuthContext, scope: Scope, by: str = "sku") -> DeviationReport:
    """Tavsiya narx va haqiqiy narx farqi: SKU yoki sotuvchi bo'yicha. Tavsiya narxi bo'lmagan qatorlar kirmaydi."""
    expected = func.sum(func.round(SaleLine.recommended_price_per_m * SaleLine.meters))
    actual = func.sum(SaleLine.amount)
    if by == "seller":
        key, label = Sale.seller_id, func.max(User.full_name)
    else:
        key, label = SaleLine.sku_id, func.max(SaleLine.sku_label)
    query = (
        select(key, label, func.sum(SaleLine.meters), expected, actual)
        .select_from(SaleLine)
        .join(Sale, Sale.id == SaleLine.sale_id)
        .join(User, User.id == Sale.seller_id)
        .where(
            Sale.status == "completed",
            SaleLine.recommended_price_per_m.is_not(None),
            *_period(ctx, scope, Sale.created_at),
        )
        .group_by(key)
        .order_by((actual - expected).asc(), key)  # eng ko'p arzonlashtirilgani tepada
    )
    if scope.store_id is not None:
        query = query.where(Sale.store_id == scope.store_id)
    if scope.seller_id is not None:
        query = query.where(Sale.seller_id == scope.seller_id)
    rows = [
        DeviationRow(
            id=row_id,
            label=text,
            meters=meters,
            expected=int(planned),
            actual=int(real),
            diff=int(real) - int(planned),
            percent=_percent(int(real) - int(planned), int(planned)),
        )
        for row_id, text, meters, planned, real in await ctx.db.execute(_by_fabric(query, scope))
    ]
    planned, real = sum(row.expected for row in rows), sum(row.actual for row in rows)
    return DeviationReport(
        rows=rows, expected=planned, actual=real, diff=real - planned, percent=_percent(real - planned, planned)
    )
