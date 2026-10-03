"""Hisobotlar API'si (/api/reports) — faqat biznes egalari uchun.

Har hisobotning `/export` yo'li shu ma'lumotni Excel fayli qilib beradi (sarlavhalar foydalanuvchi tilida).
"""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import OwnerAuth
from app.core.errors import AppError
from app.modules.credit import service as credit
from app.modules.reports import service
from app.modules.reports.export import download
from app.modules.reports.labels import labels
from app.modules.reports.schemas import (
    CreditReport,
    Dashboard,
    DeviationBy,
    DeviationReport,
    Group,
    HoursReport,
    Metric,
    Period,
    SalesReport,
    StockReport,
    TopBy,
    TopRow,
)
from app.modules.reports.service import Scope

router = APIRouter(prefix="/reports", tags=["hisobotlar"])

MAX_DAYS = 366  # bitta hisobotda ko'pi bilan bir yil


def _scope(
    date_from: date,
    date_to: date,
    store_id: int | None = None,
    seller_id: int | None = None,
    fabric_id: int | None = None,
) -> Scope:
    if date_to < date_from or (date_to - date_from).days >= MAX_DAYS:
        raise AppError(422, "validation_error", fields={"date_to": "invalid_range"})
    return Scope(date_from, date_to, store_id, seller_id, fabric_id)


ScopeDep = Annotated[Scope, Depends(_scope)]
Limit = Annotated[int, Query(ge=1, le=100)]


def _name(report: str, scope: Scope) -> str:
    return f"{report}_{scope.date_from.isoformat()}_{scope.date_to.isoformat()}"


@router.get("/dashboard")
async def dashboard(ctx: OwnerAuth, period: Period = "day", store_id: int | None = None) -> Dashboard:
    """Bosh sahifa: savdo, tushum, foyda (oldingi davr bilan), nasiya, kam qoldiq, metr farqi, 30 kunlik grafik."""
    return await service.dashboard(ctx, period, store_id)


# ---------- Savdo, tushum, foyda ----------


@router.get("/sales")
async def sales(ctx: OwnerAuth, scope: ScopeDep, group: Group = "day") -> SalesReport:
    return await service.sales_report(ctx, scope, group)


@router.get("/sales/export")
async def sales_export(ctx: OwnerAuth, scope: ScopeDep, group: Group = "day") -> Response:
    report, t = await service.sales_report(ctx, scope, group), labels(ctx.user.language)

    def line(name: str, row) -> list:
        return [name, row.sales, row.returns, row.cash, row.card, row.profit, row.count, row.meters]

    headers = [t[key] for key in ("period", "sales_amount", "returns", "cash", "card", "profit", "count", "meters")]
    rows = [line(row.period, row) for row in report.rows] + [line(t["total"], report.total)]
    return download(_name("savdo", scope), [(t["sales"], headers, rows)])


# ---------- Soatlar ----------


@router.get("/hours")
async def hours(ctx: OwnerAuth, scope: ScopeDep) -> HoursReport:
    return await service.hours_report(ctx, scope)


@router.get("/hours/export")
async def hours_export(ctx: OwnerAuth, scope: ScopeDep) -> Response:
    report, t = await service.hours_report(ctx, scope), labels(ctx.user.language)
    names = t["days"].split(",")
    return download(
        _name("soatlar", scope),
        [
            (
                t["hours"],
                [t["hour"], t["count"], t["amount"]],
                [[f"{row.hour:02d}:00", row.count, row.amount] for row in report.hours],
            ),
            (
                t["weekdays"],
                [t["weekday"], t["count"], t["amount"]],
                [[names[row.weekday - 1], row.count, row.amount] for row in report.weekdays],
            ),
        ],
    )


# ---------- Top tovarlar ----------


@router.get("/top")
async def top(
    ctx: OwnerAuth, scope: ScopeDep, by: TopBy = "sku", metric: Metric = "amount", limit: Limit = 10
) -> list[TopRow]:
    return await service.top_report(ctx, scope, by, metric, limit)


@router.get("/top/export")
async def top_export(
    ctx: OwnerAuth, scope: ScopeDep, by: TopBy = "sku", metric: Metric = "amount", limit: Limit = 10
) -> Response:
    rows, t = await service.top_report(ctx, scope, by, metric, limit), labels(ctx.user.language)
    return download(
        _name("top", scope),
        [
            (
                t["top"],
                [t["item"], t["meters"], t["sales_amount"], t["profit"]],
                [[row.label, row.meters, row.amount, row.profit] for row in rows],
            )
        ],
    )


# ---------- Qoldiq ----------


@router.get("/stock")
async def stock(ctx: OwnerAuth) -> StockReport:
    return await service.stock_report(ctx)


@router.get("/stock/export")
async def stock_export(ctx: OwnerAuth) -> Response:
    report, t = await service.stock_report(ctx), labels(ctx.user.language)
    headers = [t[key] for key in ("place", "type", "meters", "rolls", "value", "skus", "low")]
    rows = [
        [place.name, t[place.type], place.meters, place.rolls, place.value, place.skus, place.low]
        for place in report.places
    ]
    rows.append([t["total"], "", report.meters, "", report.value, "", ""])
    return download(f"qoldiq_{service.today(ctx).isoformat()}", [(t["stock"], headers, rows)])


# ---------- Nasiya ----------


@router.get("/credit")
async def credit_summary(ctx: OwnerAuth, scope: ScopeDep) -> CreditReport:
    return await service.credit_report(ctx, scope)


@router.get("/credit/export")
async def credit_export(ctx: OwnerAuth) -> Response:
    """Qarzdor mijozlar ro'yxati (qarzi kattasi tepada)."""
    t = labels(ctx.user.language)
    page = await credit.list_customers(ctx, only="debtors", sort="debt", limit=200)
    headers = [t[key] for key in ("customer", "phone", "debt", "overdue", "oldest_days", "last_payment")]
    rows = [
        [
            row.name,
            row.phone,
            row.debt,
            row.overdue,
            row.oldest_days,
            row.last_payment_at.date() if row.last_payment_at else None,
        ]
        for row in page.items
    ]
    rows.append([t["total"], "", page.debt_total, page.overdue_total, "", ""])
    return download(f"nasiya_{service.today(ctx).isoformat()}", [(t["credit"], headers, rows)])


# ---------- Narx og'ishi ----------


@router.get("/price-deviation")
async def price_deviation(ctx: OwnerAuth, scope: ScopeDep, by: DeviationBy = "sku") -> DeviationReport:
    return await service.deviation_report(ctx, scope, by)


@router.get("/price-deviation/export")
async def price_deviation_export(ctx: OwnerAuth, scope: ScopeDep, by: DeviationBy = "sku") -> Response:
    report, t = await service.deviation_report(ctx, scope, by), labels(ctx.user.language)
    headers = [t["seller" if by == "seller" else "item"]]
    headers += [t[key] for key in ("meters", "expected", "actual", "diff", "percent")]
    rows = [[row.label, row.meters, row.expected, row.actual, row.diff, row.percent] for row in report.rows]
    rows.append([t["total"], "", report.expected, report.actual, report.diff, report.percent])
    return download(_name("narx_ogishi", scope), [(t["deviation"], headers, rows)])
