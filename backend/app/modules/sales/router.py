"""Sotuv API'si (/api/sales): sotuv ekrani, sotuvlar, qaytarish, bekor qilish.

Biznes egalari va sotuvchilar uchun. Sotuvchi faqat o'z do'konida ishlaydi (qurilma bog'langan do'kon);
tannarx va foyda faqat biznes egasiga qaytadi.
"""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import AuthContext, require_roles
from app.modules.reports.export import EXPORT_ROWS, download, local_time
from app.modules.reports.labels import labels
from app.modules.sales import service
from app.modules.sales.schemas import (
    CancelIn,
    PaymentType,
    ReturnCreated,
    ReturnIn,
    SaleCard,
    SaleContext,
    SaleCreate,
    SaleCreated,
    SalePage,
    SaleStatus,
)

router = APIRouter(prefix="/sales", tags=["sotuv"])

SalesAuth = Annotated[AuthContext, Depends(require_roles("owner", "seller"))]


@router.get("/context")
async def sale_context(ctx: SalesAuth, store_id: int | None = None) -> SaleContext:
    """Sotuv ekrani uchun: do'kon, sozlamalar va sotiladigan tovarlar (partiyalari va tavsiya narxi bilan)."""
    return await service.context(ctx, store_id)


@router.post("", status_code=201)
async def create_sale(body: SaleCreate, ctx: SalesAuth, response: Response) -> SaleCreated:
    sale, duplicate = await service.create_sale(ctx, body)
    if duplicate:  # shu savat avval yozilgan — yangi sotuv yaratilmadi
        response.status_code = 200
    return SaleCreated(
        id=sale.id,
        number=sale.number,
        total=sale.total,
        payment_type=sale.payment_type,
        duplicate=duplicate,
    )


@router.get("")
async def list_sales(
    ctx: SalesAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    store_id: int | None = None,
    seller_id: int | None = None,
    mine: bool = False,
    payment_type: PaymentType | None = None,
    status: SaleStatus | None = None,
    customer_id: int | None = None,
    search: str | None = None,
    sort: Literal["time", "-time", "amount", "-amount"] = "-time",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SalePage:
    return await service.list_sales(
        ctx,
        date_from=date_from,
        date_to=date_to,
        store_id=store_id,
        seller_id=seller_id,
        mine=mine,
        payment_type=payment_type,
        status=status,
        customer_id=customer_id,
        search=search,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/export")
async def export_sales(
    ctx: SalesAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    store_id: int | None = None,
    seller_id: int | None = None,
    mine: bool = False,
    payment_type: PaymentType | None = None,
    status: SaleStatus | None = None,
    customer_id: int | None = None,
    search: str | None = None,
    sort: Literal["time", "-time", "amount", "-amount"] = "-time",
) -> Response:
    """Sotuvlar ro'yxati Excel faylida — ro'yxatdagi filtrlar bilan. Tannarx va foyda chiqmaydi
    (sotuvchi ham yuklaydi — faqat o'z do'koni sotuvlari)."""
    t = labels(ctx.user.language)
    page = await service.list_sales(
        ctx,
        date_from=date_from,
        date_to=date_to,
        store_id=store_id,
        seller_id=seller_id,
        mine=mine,
        payment_type=payment_type,
        status=status,
        customer_id=customer_id,
        search=search,
        sort=sort,
        limit=EXPORT_ROWS,
    )
    keys = ("number", "time", "store", "seller", "customer", "payment_type", "amount", "returned", "status")
    rows = [
        [
            row.number,
            local_time(row.created_at, ctx.business.timezone),
            row.store.name,
            row.seller.name,
            row.customer.name if row.customer else "",
            t[f"pay_{row.payment_type}"],
            row.total,
            row.returned_total,
            t[f"status_{row.status}"],
        ]
        for row in page.items
    ]
    return download("sotuvlar", [(t["sales_list"], [t[key] for key in keys], rows)])


@router.get("/{sale_id}")
async def get_sale(sale_id: int, ctx: SalesAuth) -> SaleCard:
    return await service.get_sale(ctx, sale_id)


@router.post("/{sale_id}/cancel", status_code=204)
async def cancel_sale(sale_id: int, body: CancelIn, ctx: SalesAuth) -> None:
    """Sotuvchi — o'z sotuvini 10 daqiqa ichida; keyin faqat biznes egasi. Sabab majburiy."""
    await service.cancel_sale(ctx, sale_id, body.reason)


@router.post("/{sale_id}/returns", status_code=201)
async def return_sale(sale_id: int, body: ReturnIn, ctx: SalesAuth) -> ReturnCreated:
    return await service.return_sale(ctx, sale_id, body)
