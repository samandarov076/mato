"""Ombor ogohlantirishlari: kam qoldiq. `move_stock` har harakatdan keyin `stock_changed` ni chaqiradi.

Chegara — SKU'niki, bo'lmasa biznes sozlamasidagi standart; ikkalasi ham yo'q bo'lsa xabar kelmaydi.
Xabar bir marta keladi: qoldiq chegaradan tushganda. Tovar to'ldirilib chegaradan oshsa, kalit bo'shaydi —
keyingi safar tushganda yana xabar keladi (har sotuvda emas).
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.catalog.service import sku_code
from app.modules.inventory.models import BatchStock
from app.modules.notifications import service as notifications
from app.modules.platform.models import Business
from app.modules.receiving.models import Batch, Receipt
from app.modules.structure.models import Location


async def stock_changed(db: AsyncSession, business_id: int, batch_id: int, location_id: int) -> None:
    """Partiyaning SKU'si shu joyda chegaradan pastmi — tekshiradi va egalarga xabar beradi yoki kalitni bo'shatadi."""
    sku, fabric, color, pattern, default = (
        await db.execute(
            select(Sku, Fabric, Color, Pattern, Business.low_stock_default)
            .select_from(Batch)
            .join(Sku, Sku.id == Batch.sku_id)
            .join(Fabric, Fabric.id == Sku.fabric_id)
            .join(Color, Color.id == Sku.color_id)
            .join(Pattern, Pattern.id == Sku.pattern_id)
            .join(Business, Business.id == Sku.business_id)
            .where(Batch.id == batch_id)
        )
    ).one()
    threshold = sku.low_stock_threshold if sku.low_stock_threshold is not None else default
    if threshold is None:
        return

    total = await db.scalar(
        select(func.coalesce(func.sum(BatchStock.qty_m), 0))
        .join(Batch, Batch.id == BatchStock.batch_id)
        .join(Receipt, Receipt.id == Batch.receipt_id)
        .where(
            Batch.sku_id == sku.id,
            BatchStock.location_id == location_id,
            BatchStock.status == "open",
            Receipt.status == "active",
        )
    )
    key = f"low_stock:{sku.id}:{location_id}"
    if total >= threshold:
        await notifications.release(db, business_id, key)
        return
    location = await db.get(Location, location_id)
    await notifications.notify_owners(
        db,
        business_id,
        "stock.low",
        {
            "sku_id": sku.id,
            "code": sku_code(fabric, color, pattern),
            "location_id": location_id,
            "location": location.name,
            "qty": str(total),
            "threshold": str(threshold),
        },
        dedup_key=key,
    )
