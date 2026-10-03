"""Ombor API'si: qoldiq (/api/stock), partiya kartochkasi va yopish (/api/batches), ko'chirish (/api/transfers).

Qoldiqni hamma ko'radi: ega — to'liq, omborchi — o'z skladlari va do'konlar, sotuvchi — faqat metr va
rulon (narx va tannarxsiz). Kim qayerda nima qila olishi servisda tekshiriladi.
"""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import Auth, AuthContext, OwnerAuth, require_roles
from app.modules.inventory import service, transfers
from app.modules.inventory.schemas import (
    BatchCard,
    CloseIn,
    Differences,
    ReceiveIn,
    ReopenIn,
    Sendable,
    StockPage,
    TransferCard,
    TransferCreate,
    TransferOptions,
    TransferPage,
    TransferStatus,
)

router = APIRouter(tags=["ombor"])

# Ko'chirish yaratish, bekor qilish va partiyani qayta ochish — sotuvchiga yo'q
StaffAuth = Annotated[AuthContext, Depends(require_roles("owner", "warehouse"))]

# ---------- Qoldiq ----------


@router.get("/stock")
async def list_stock(
    ctx: Auth,
    location_id: int | None = None,
    fabric_id: int | None = None,
    color_id: int | None = None,
    pattern_id: int | None = None,
    search: str | None = None,
    only: Literal["low", "negative", "in_transit"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> StockPage:
    return await service.list_stock(
        ctx,
        location_id=location_id,
        fabric_id=fabric_id,
        color_id=color_id,
        pattern_id=pattern_id,
        search=search,
        only=only,
        limit=limit,
        offset=offset,
    )


@router.get("/stock/differences")
async def differences(
    ctx: OwnerAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    location_id: int | None = None,
    user_id: int | None = None,
    kind: Literal["shortage", "surplus"] | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Differences:
    """Metr farqi hisoboti: yopilgan partiyalar va ko'chirish farqlari. Faqat biznes egasi.
    Ro'yxatlar sahifalanadi; jami sonlar filtrga mos barcha qatorlar bo'yicha."""
    return await service.differences(
        ctx,
        date_from=date_from,
        date_to=date_to,
        location_id=location_id,
        user_id=user_id,
        kind=kind,
        limit=limit,
        offset=offset,
    )


# ---------- Partiya ----------


@router.get("/batches/by-number/{number}")
async def find_batch(number: str, ctx: Auth) -> dict[str, int]:
    """Skaner: etiketkadagi partiya raqami bo'yicha."""
    return {"id": await service.find_batch(ctx, number)}


@router.get("/batches/{batch_id}")
async def get_batch(batch_id: int, ctx: Auth) -> BatchCard:
    return await service.get_batch(ctx, batch_id)


@router.post("/batches/{batch_id}/close", status_code=204)
async def close_batch(batch_id: int, body: CloseIn, ctx: Auth) -> None:
    """Partiya shu joyda tugadi. Sotuvchi — o'z do'konida, omborchi — o'z skladida, ega — har qayerda."""
    await service.close_batch(ctx, batch_id, body.location_id, body.note)


@router.post("/batches/{batch_id}/reopen", status_code=204)
async def reopen_batch(batch_id: int, body: ReopenIn, ctx: StaffAuth) -> None:
    await service.reopen_batch(ctx, batch_id, body.location_id)


# ---------- Ko'chirish ----------


@router.get("/transfers")
async def list_transfers(
    ctx: Auth,
    status: TransferStatus | None = None,
    location_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransferPage:
    return await transfers.list_transfers(
        ctx,
        status=status,
        location_id=location_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/transfers/options")
async def transfer_options(ctx: StaffAuth) -> TransferOptions:
    return await transfers.options(ctx)


@router.get("/transfers/sendable")
async def sendable(ctx: StaffAuth, location_id: int, search: str | None = None) -> list[Sendable]:
    """Shu joydan jo'natsa bo'ladigan partiyalar (forma uchun)."""
    return await transfers.sendable(ctx, location_id, search)


@router.post("/transfers", status_code=201)
async def create_transfer(body: TransferCreate, ctx: StaffAuth, response: Response) -> dict[str, int]:
    transfer, duplicate = await transfers.create_transfer(ctx, body)
    if duplicate:  # shu ko'chirish avval yozilgan — yangisi yaratilmadi
        response.status_code = 200
    return {"id": transfer.id}


@router.get("/transfers/{transfer_id}")
async def get_transfer(transfer_id: int, ctx: Auth) -> TransferCard:
    return await transfers.get_transfer(ctx, transfer_id)


@router.post("/transfers/{transfer_id}/receive", status_code=204)
async def receive_transfer(transfer_id: int, body: ReceiveIn, ctx: Auth) -> None:
    await transfers.receive_transfer(ctx, transfer_id, body)


@router.post("/transfers/{transfer_id}/cancel", status_code=204)
async def cancel_transfer(transfer_id: int, ctx: StaffAuth) -> None:
    await transfers.cancel_transfer(ctx, transfer_id)
