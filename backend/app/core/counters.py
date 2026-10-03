"""Hujjat raqamlari: har biznesda o'zining uzluksiz ketma-ketligi (partiya P-000123, kirim KR-00045, ko'chirish K-00045 ...).

Raqam bazadagi bitta qatorni oshirish bilan olinadi — ikki so'rov bir vaqtda kelsa ham bir xil raqam
chiqmaydi. Amal bekor bo'lsa (tranzaksiya qaytsa), raqam ham qaytadi — bo'shliq qolmaydi.
"""
from typing import Literal

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Counter

CounterName = Literal["batch", "sale", "transfer", "receipt"]


async def next_numbers(
    db: AsyncSession, business_id: int, name: CounterName, count: int = 1
) -> list[int]:
    """Navbatdagi `count` ta raqamni band qiladi va qaytaradi (o'sish tartibida)."""
    last = (
        await db.execute(
            pg_insert(Counter)
            .values(business_id=business_id, name=name, value=count)
            .on_conflict_do_update(
                index_elements=[Counter.business_id, Counter.name],
                set_={"value": Counter.value + count},
            )
            .returning(Counter.value)
        )
    ).scalar_one()
    return list(range(last - count + 1, last + 1))
