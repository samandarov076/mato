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
    ClosablePage,
    CloseIn,
    Differences,
    MovementPage,
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
from app.modules.reports.export import EXPORT_ROWS, EXPORT_SKUS, download, local_time, number
from app.modules.reports.labels import labels

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
    sort: Literal["total", "-total"] | None = None,
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
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/stock/export")
async def export_stock(
    ctx: Auth,
    location_id: int | None = None,
    search: str | None = None,
    only: Literal["low", "negative", "in_transit"] | None = None,
) -> Response:
    """Qoldiq Excel faylida — matritsa: qatorda tovar, ustunlarda xodim ko'ra oladigan joylar, oxirida jami.
    Faqat metr: tannarx va qiymat chiqmaydi (omborchi va sotuvchi ham yuklaydi)."""
    t = labels(ctx.user.language)
    page = await service.list_stock(
        ctx, location_id=location_id, search=search, only=only, limit=EXPORT_SKUS
    )
    places = [place for place in page.locations if location_id is None or place.id == location_id]
    rows = []
    for item in page.items:
        here = {total.location_id: total.qty_m for total in item.totals}
        names = [item.sku.fabric_name, item.sku.color_name, item.sku.pattern_name]
        rows.append(
            [
                item.sku.code,
                " · ".join(name for name in names if name),
                *(number(here.get(place.id)) for place in places),
                number(sum((here.get(place.id, 0) for place in places), 0) if location_id else item.total_m),
            ]
        )
    headers = [t["code"], t["item"], *(place.name for place in places), t["total_m"]]
    return download("qoldiq", [(t["stock"], headers, rows)])


@router.get("/stock/differences/export")
async def export_differences(
    ctx: OwnerAuth,
    date_from: date | None = None,
    date_to: date | None = None,
    location_id: int | None = None,
    user_id: int | None = None,
    kind: Literal["shortage", "surplus"] | None = None,
) -> Response:
    """Metr farqi Excel faylida: yopilgan partiyalar va ko'chirish farqlari — ikki varaq. Faqat biznes egasi."""
    t, zone = labels(ctx.user.language), ctx.business.timezone
    report = await service.differences(
        ctx,
        date_from=date_from,
        date_to=date_to,
        location_id=location_id,
        user_id=user_id,
        kind=kind,
        limit=EXPORT_ROWS,
    )

    def item(sku) -> str:
        names = [sku.code, sku.fabric_name, sku.color_name, sku.pattern_name]
        return " · ".join(name for name in names if name)

    closures = [
        [
            row.batch_number,
            item(row.sku),
            row.location.name,
            number(row.received_m),
            number(row.out_m),
            number(row.diff_m),
            number(row.diff_percent),
            row.diff_amount,
            row.closed_by.name,
            local_time(row.closed_at, zone),
            row.note or "",
        ]
        for row in report.closures
    ]
    moved = [
        [
            row.number,
            row.batch_number,
            item(row.sku),
            row.source.name,
            row.target.name,
            number(row.sent_m),
            number(row.received_m),
            number(row.diff_m),
            row.diff_amount,
            row.received_by.name,
            local_time(row.received_at, zone),
            row.note or "",
        ]
        for row in report.transfers
    ]
    closed_keys = (
        "batch", "item", "place", "labeled_m", "out_m", "diff_m", "percent", "diff", "by", "when", "note",
    )  # fmt: skip
    moved_keys = (
        "transfer", "batch", "item", "from", "to", "sent_m", "received_m", "diff_m", "diff", "by", "when", "note",
    )  # fmt: skip
    return download(
        "metr_farqi",
        [
            (t["differences"], [t[key] for key in closed_keys], closures),
            (t["transfer_diffs"], [t[key] for key in moved_keys], moved),
        ],
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


@router.get("/batches/closable")
async def closable_batches(ctx: Auth) -> ClosablePage:
    """"Partiyani yopish" sahifasi: ochiq partiyalar, joylar bo'yicha qoldiq va kim qayerda yopa olishi."""
    return await service.closable(ctx)


@router.get("/batches/by-number/{number}")
async def find_batch(number: str, ctx: Auth) -> dict[str, int]:
    """Skaner: etiketkadagi partiya raqami bo'yicha."""
    return {"id": await service.find_batch(ctx, number)}


@router.get("/batches/{batch_id}")
async def get_batch(batch_id: int, ctx: Auth) -> BatchCard:
    return await service.get_batch(ctx, batch_id)


@router.get("/batches/{batch_id}/movements")
async def list_movements(
    batch_id: int,
    ctx: Auth,
    kind: Literal["sales", "transfers", "other"] | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MovementPage:
    """Partiya tarixi — sahifalab; `kind` — sotuvlar / ko'chirishlar / boshqa."""
    return await service.list_movements(ctx, batch_id, kind=kind, limit=limit, offset=offset)


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
    sort: Literal["date", "-date"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransferPage:
    return await transfers.list_transfers(
        ctx,
        status=status,
        location_id=location_id,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
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
