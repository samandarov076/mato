"""Qoldiqni o'zgartiradigan YAGONA joy.

Har harakat `stock_movements` ga yoziladi va `batch_stock` shu tranzaksiyaning o'zida yangilanadi —
ikkalasi doim mos turadi. `batch_stock` qatori qulflanadi: ikki sotuvchi bitta partiyani bir paytda
sotsa ham, biri ikkinchisini kutadi va qoldiq to'g'ri chiqadi. Boshqa partiya va joylar kutmaydi.
"""
from decimal import Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.alerts import stock_changed
from app.modules.inventory.models import BatchStock, StockMovement

MovementType = Literal[
    "receipt", "receipt_cancel", "transfer_out", "transfer_in", "transfer_cancel",
    "sale", "sale_cancel", "return", "close", "reopen", "correction",
]  # fmt: skip


async def move_stock(
    db: AsyncSession,
    *,
    business_id: int,
    batch_id: int,
    location_id: int,
    qty_m: Decimal,
    type: MovementType,
    user_id: int | None,
    ref_type: str | None = None,
    ref_id: int | None = None,
    note: str | None = None,
    received_m: Decimal = Decimal(0),
    status: Literal["open", "closed"] | None = None,
) -> BatchStock:
    """Partiyaning shu joydagi qoldig'ini `qty_m` ga o'zgartiradi (+ kirdi, − chiqdi) va harakatni yozadi.

    `received_m` — "shu joyga kirgan metr"ning o'zgarishi: kirim va qabul qilingan ko'chirishda musbat.
    `status` — partiyaning shu joydagi holati ham o'zgarsa (yopish, qayta ochish, yopilgan joyga ko'chirish).
    Yangilangan qoldiq qatorini qaytaradi (qulflangan holda — tranzaksiya tugaguncha).
    """
    key = {"batch_id": batch_id, "location_id": location_id}
    # Partiya bu joyga birinchi marta kelayotgan bo'lsa, qator yaratiladi
    await db.execute(
        pg_insert(BatchStock).values(business_id=business_id, **key).on_conflict_do_nothing()
    )
    stock = (
        await db.scalars(
            select(BatchStock)
            .filter_by(**key)
            .with_for_update()
            .execution_options(populate_existing=True)  # qulfdan keyingi eng yangi qiymatlar
        )
    ).one()
    stock.qty_m += qty_m
    stock.received_m += received_m
    if status is not None:
        stock.status = status
    db.add(
        StockMovement(
            business_id=business_id,
            batch_id=batch_id,
            location_id=location_id,
            qty_m=qty_m,
            type=type,
            ref_type=ref_type,
            ref_id=ref_id,
            user_id=user_id,
            note=note,
        )
    )
    await db.flush()
    await stock_changed(db, business_id, batch_id, location_id)  # kam qoldiq xabari
    return stock


async def lock_stock(db: AsyncSession, batch_id: int, location_id: int) -> BatchStock | None:
    """Qoldiq qatorini o'qiydi va qulflaydi — tekshirib, keyin o'zgartirish kerak bo'lganda
    (masalan: "skladda shuncha metr bormi?" → jo'natish). Qator yo'q bo'lsa — None."""
    return await db.scalar(
        select(BatchStock)
        .filter_by(batch_id=batch_id, location_id=location_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
