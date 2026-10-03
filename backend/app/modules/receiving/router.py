"""Kirim API'si: kirim hujjatlari (/api/receipts) va partiyani tuzatish (/api/batches/{id}).

Biznes egalari va omborchi uchun. Omborchi faqat o'ziga biriktirilgan skladlar kirimlarini ko'radi;
tannarx shu sahifalarda unga ham ko'rinadi (docs/03-details/04-kirim.md).
"""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import AuthContext, OwnerAuth, require_roles
from app.modules.receiving import service
from app.modules.receiving.schemas import (
    BatchUpdate,
    Options,
    ReceiptCard,
    ReceiptCreate,
    ReceiptPage,
    ReceiptUpdate,
)

router = APIRouter(tags=["kirim"])

ReceivingAuth = Annotated[AuthContext, Depends(require_roles("owner", "warehouse"))]


@router.get("/receipts")
async def list_receipts(
    ctx: ReceivingAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    warehouse_id: int | None = None,
    created_by: int | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ReceiptPage:
    return await service.list_receipts(
        ctx,
        date_from=date_from,
        date_to=date_to,
        warehouse_id=warehouse_id,
        created_by=created_by,
        limit=limit,
        offset=offset,
    )


@router.get("/receipts/options")
async def receipt_options(ctx: ReceivingAuth) -> Options:
    """Forma va filtrlar uchun: xodim ishlay oladigan skladlar, kirim kiritganlar."""
    return await service.options(ctx)


@router.post("/receipts", status_code=201)
async def create_receipt(body: ReceiptCreate, ctx: ReceivingAuth, response: Response) -> dict[str, int]:
    receipt, duplicate = await service.create_receipt(ctx, body)
    if duplicate:  # shu kirim avval yozilgan — yangisi yaratilmadi
        response.status_code = 200
    return {"id": receipt.id}


@router.get("/receipts/{receipt_id}")
async def get_receipt(receipt_id: int, ctx: ReceivingAuth) -> ReceiptCard:
    return await service.get_receipt(ctx, receipt_id)


@router.patch("/receipts/{receipt_id}", status_code=204)
async def update_receipt(receipt_id: int, body: ReceiptUpdate, ctx: ReceivingAuth) -> None:
    await service.update_receipt(ctx, receipt_id, body)


@router.post("/receipts/{receipt_id}/cancel", status_code=204)
async def cancel_receipt(receipt_id: int, ctx: OwnerAuth) -> None:
    """Kirim o'chirilmaydi — harakatsiz bo'lsa, biznes egasi bekor qiladi."""
    await service.cancel_receipt(ctx, receipt_id)


@router.patch("/batches/{batch_id}", status_code=204)
async def update_batch(batch_id: int, body: BatchUpdate, ctx: ReceivingAuth) -> None:
    await service.update_batch(ctx, batch_id, body)
