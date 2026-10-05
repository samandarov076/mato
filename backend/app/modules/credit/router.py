"""Nasiya API'si: mijozlar, to'lovlar, hisobdan chiqarish (/api/customers, /api/debts).

Biznes egalari va sotuvchilar uchun — omborchiga yopiq. Mijoz biznes bo'yicha umumiy: sotuvchi istalgan
mijozning qarzini ko'radi va to'lovini qabul qiladi.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import AuthContext, require_roles
from app.modules.credit import service
from app.modules.credit.schemas import (
    ActiveIn,
    CustomerBrief,
    CustomerCard,
    CustomerIn,
    CustomerPage,
    CustomerUpdate,
    PaymentCreated,
    PaymentIn,
    PaymentPage,
    WriteoffIn,
    WriteoffPage,
)
from app.modules.reports.export import EXPORT_ROWS, download, local_time
from app.modules.reports.labels import labels

router = APIRouter(tags=["nasiya"])

CreditAuth = Annotated[AuthContext, Depends(require_roles("owner", "seller"))]


@router.get("/customers/search")
async def search_customers(
    ctx: CreditAuth,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[CustomerBrief]:
    """Sotuv ekranidagi tezkor tanlov: ism yoki telefon bo'yicha, hozirgi qarzi bilan."""
    return await service.search_customers(ctx, q, limit)


@router.post("/customers", status_code=201)
async def create_customer(body: CustomerIn, ctx: CreditAuth) -> CustomerBrief:
    """Mijoz qo'shish (sotuv ekranidan ham). Telefon band bo'lsa — mavjud mijoz taklif qilinadi."""
    return await service.brief(ctx, await service.create_customer(ctx, body))


@router.get("/customers")
async def list_customers(
    ctx: CreditAuth,
    search: str | None = None,
    only: Literal["debtors", "overdue", "not_due", "d1_30", "d31_60", "d60_plus"] | None = None,
    sort: Literal["name", "debt", "oldest"] = "name",
    include_inactive: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CustomerPage:
    """Mijozlar: qarzi, muddati o'tgan qismi, eng eski qarz necha kunlik, oxirgi to'lov."""
    return await service.list_customers(
        ctx,
        search=search,
        only=only,
        sort=sort,
        include_inactive=include_inactive,
        limit=limit,
        offset=offset,
    )


@router.get("/customers/export")
async def export_customers(
    ctx: CreditAuth,
    search: str | None = None,
    only: Literal["debtors", "overdue", "not_due", "d1_30", "d31_60", "d60_plus"] | None = None,
    sort: Literal["name", "debt", "oldest"] = "name",
    include_inactive: bool = False,
) -> Response:
    """Mijozlar ro'yxati Excel faylida — ro'yxatdagi filtr va tartib bilan."""
    t = labels(ctx.user.language)
    page = await service.list_customers(
        ctx, search=search, only=only, sort=sort, include_inactive=include_inactive, limit=EXPORT_ROWS
    )
    keys = (
        "customer", "phone", "debt", "overdue", "oldest_days", "last_payment", "last_payment_amount", "note",
    )  # fmt: skip
    rows = [
        [
            row.name,
            row.phone,
            row.debt,
            row.overdue,
            row.oldest_days,
            local_time(row.last_payment_at, ctx.business.timezone)[:10],
            row.last_payment_amount,
            row.note or "",
        ]
        for row in page.items
    ]
    return download("mijozlar", [(t["customers"], [t[key] for key in keys], rows)])


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: int, ctx: CreditAuth) -> CustomerCard:
    return await service.get_customer(ctx, customer_id)


@router.get("/customers/{customer_id}/payments")
async def list_payments(
    customer_id: int,
    ctx: CreditAuth,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaymentPage:
    """To'lovlar tarixi — sahifalab (kartochkada faqat birinchi sahifa)."""
    return await service.list_payments(ctx, customer_id, limit=limit, offset=offset)


@router.get("/customers/{customer_id}/writeoffs")
async def list_writeoffs(
    customer_id: int,
    ctx: CreditAuth,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WriteoffPage:
    return await service.list_writeoffs(ctx, customer_id, limit=limit, offset=offset)


@router.patch("/customers/{customer_id}", status_code=204)
async def update_customer(customer_id: int, body: CustomerUpdate, ctx: CreditAuth) -> None:
    await service.update_customer(ctx, customer_id, body)


@router.post("/customers/{customer_id}/active", status_code=204)
async def set_customer_active(customer_id: int, body: ActiveIn, ctx: CreditAuth) -> None:
    """Mijoz o'chirilmaydi — faolsizlantiriladi (qarzi bo'lmasa)."""
    await service.set_customer_active(ctx, customer_id, body.is_active)


@router.post("/customers/{customer_id}/payments", status_code=201)
async def receive_payment(
    customer_id: int, body: PaymentIn, ctx: CreditAuth, response: Response
) -> PaymentCreated:
    """Qarz to'lovi: eng eski qarzdan boshlab; `debt_id` berilsa — faqat o'sha qarzga."""
    payment, duplicate = await service.receive_payment(ctx, customer_id, body)
    if duplicate:  # shu to'lov avval yozilgan — yangisi yaratilmadi
        response.status_code = 200
    return payment


@router.post("/debts/{debt_id}/writeoff", status_code=204)
async def write_off(debt_id: int, body: WriteoffIn, ctx: CreditAuth) -> None:
    """Qarzni hisobdan chiqarish (sabab majburiy) — egalarga xabar boradi."""
    await service.write_off(ctx, debt_id, body)
