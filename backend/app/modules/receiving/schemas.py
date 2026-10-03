"""Kirim API'sining shakllari: kirim hujjati, uning qatorlari (partiyalar) va tuzatish."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.modules.catalog.schemas import Price, PriceUnit, SkuOut

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Meters = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Kg = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
MPerKg = Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=4)]
Cost = Annotated[int, Field(ge=0, le=1_000_000_000)]  # so'm, 1 metr uchun
Rolls = Annotated[int, Field(ge=1, le=100_000)]


class SkuPick(BaseModel):
    """Katalogdan tanlov. SKU bo'lmasa, kirim uni o'zi yaratadi. Gul tanlanmasa — "gulsiz"."""

    fabric_id: int
    color_id: int
    pattern_id: int | None = None


class LineIn(SkuPick):
    rolls_count: Rolls
    meters: Meters  # jami metr, etiketka bo'yicha
    kg: Kg | None = None
    # Kg kiritilmagan bo'lsa ishlatiladi; bo'sh qolsa — matoning standart koeffitsienti
    m_per_kg: MPerKg | None = None
    cost_per_m: Cost
    # Tavsiya narxni shu yerda ham o'zgartirsa bo'ladi; bo'sh — o'zgarmaydi
    price: Price | None = None
    price_unit: PriceUnit | None = None


class ReceiptCreate(BaseModel):
    warehouse_id: int
    receipt_date: date
    note: Note | None = None
    lines: list[LineIn] = Field(min_length=1, max_length=100)


class ReceiptUpdate(BaseModel):
    receipt_date: date
    note: Note | None = None


class BatchUpdate(BaseModel):
    """Partiyani tuzatish. `sku` berilsa — tovar almashtiriladi (faqat harakatsiz partiyada)."""

    sku: SkuPick | None = None
    rolls_count: Rolls
    meters: Meters
    kg: Kg | None = None
    m_per_kg: MPerKg | None = None
    cost_per_m: Cost


class Ref(BaseModel):
    id: int
    name: str


class ReceiptRow(BaseModel):
    id: int
    number: str
    receipt_date: date
    status: Literal["active", "cancelled"]
    warehouse: Ref
    created_by: Ref
    batches_count: int
    total_m: Decimal
    total_amount: int  # so'm: metr × tannarx


class ReceiptPage(BaseModel):
    items: list[ReceiptRow]
    total: int


class BatchOut(BaseModel):
    id: int
    number: str  # P-000123
    sku: SkuOut
    rolls_count: int
    meters_labeled: Decimal
    kg: Decimal | None
    m_per_kg: Decimal | None
    cost_per_m: int
    amount: int
    qty_m: Decimal  # skladdagi hozirgi qoldiq
    has_movement: bool  # sotilgan yoki ko'chirilgan
    can_edit: bool


class ReceiptCard(BaseModel):
    id: int
    number: str
    receipt_date: date
    note: str | None
    status: Literal["active", "cancelled"]
    warehouse: Ref
    created_by: Ref
    created_at: datetime
    cancelled_by: Ref | None
    cancelled_at: datetime | None
    lines: list[BatchOut]
    total_m: Decimal
    total_amount: int
    can_edit: bool  # sana va izohni tuzatish
    can_cancel: bool


class Options(BaseModel):
    """Forma va filtrlar uchun: xodim ishlay oladigan skladlar va kirim kiritganlar."""

    warehouses: list[Ref]
    creators: list[Ref]
