"""Nasiya API'si: mijozlar, to'lovlar, hisobdan chiqarish (/api/customers, /api/debts).

Biznes egalari va sotuvchilar uchun — omborchiga yopiq. Mijoz biznes bo'yicha umumiy: sotuvchi istalgan
mijozning qarzini ko'radi va to'lovini qabul qiladi.
"""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

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
    WriteoffIn,
)

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
    only: Literal["debtors", "overdue"] | None = None,
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


@router.get("/customers/{customer_id}")
async def get_customer(customer_id: int, ctx: CreditAuth) -> CustomerCard:
    return await service.get_customer(ctx, customer_id)


@router.patch("/customers/{customer_id}", status_code=204)
async def update_customer(customer_id: int, body: CustomerUpdate, ctx: CreditAuth) -> None:
    await service.update_customer(ctx, customer_id, body)


@router.post("/customers/{customer_id}/active", status_code=204)
async def set_customer_active(customer_id: int, body: ActiveIn, ctx: CreditAuth) -> None:
    """Mijoz o'chirilmaydi — faolsizlantiriladi (qarzi bo'lmasa)."""
    await service.set_customer_active(ctx, customer_id, body.is_active)


@router.post("/customers/{customer_id}/payments", status_code=201)
async def receive_payment(customer_id: int, body: PaymentIn, ctx: CreditAuth) -> PaymentCreated:
    """Qarz to'lovi: eng eski qarzdan boshlab; `debt_id` berilsa — faqat o'sha qarzga."""
    return await service.receive_payment(ctx, customer_id, body)


@router.post("/debts/{debt_id}/writeoff", status_code=204)
async def write_off(debt_id: int, body: WriteoffIn, ctx: CreditAuth) -> None:
    """Qarzni hisobdan chiqarish (sabab majburiy) — egalarga xabar boradi."""
    await service.write_off(ctx, debt_id, body)
