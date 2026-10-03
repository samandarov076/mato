"""Sotuv API'sining shakllari: sotuv ekrani, sotuv yaratish, ro'yxat, kartochka, qaytarish, bekor qilish."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.modules.catalog.schemas import SkuOut

PaymentType = Literal["cash", "card", "credit"]
MoneyMethod = Literal["cash", "card"]
# completed — yakunlangan; partially_returned / returned — qisman / to'liq qaytarilgan; cancelled — bekor qilingan
SaleStatus = Literal["completed", "partially_returned", "returned", "cancelled"]
Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Meters = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class Ref(BaseModel):
    id: int
    name: str


# ---------- Sotuv ekrani ----------


class SellableBatch(BaseModel):
    """Do'kondagi ochiq partiya. Tavsiya narx 1 metrga keltirilgan (SKU narxi kg da bo'lsa — partiya
    koeffitsienti bo'yicha)."""

    id: int
    number: str
    receipt_date: date
    qty_m: Decimal
    m_per_kg: Decimal | None
    recommended_price_per_m: int | None


class SellableSku(BaseModel):
    sku: SkuOut
    batches: list[SellableBatch]  # eng eskisi birinchi


class SaleContext(BaseModel):
    """Sotuv ekrani ochilganda kerak bo'ladigan hamma narsa: do'kon, sozlamalar va sotiladigan tovarlar."""

    store: Ref
    sell_by_kg: bool
    credit_enabled: bool
    items: list[SellableSku]


class SaleLineIn(BaseModel):
    batch_id: int
    meters: Meters
    kg: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=3)
    price_per_m: int = Field(gt=0, le=1_000_000_000)
    # Qoldiqdan ko'p sotilayotgan bo'lsa (haqiqatda mato bor) — izoh majburiy
    negative_stock_note: Note | None = None


class SaleCreate(BaseModel):
    client_uuid: uuid.UUID  # savat identifikatori — qayta yuborilsa ham sotuv bir marta yoziladi
    store_id: int | None = None  # biznes egasi uchun; sotuvchida — qurilma bog'langan do'kon
    lines: list[SaleLineIn] = Field(min_length=1, max_length=100)
    payment_type: PaymentType
    customer_id: int | None = None  # nasiya uchun
    initial_payment: int = Field(default=0, ge=0)
    initial_payment_method: MoneyMethod | None = None


class SaleCreated(BaseModel):
    id: int
    number: str
    total: int
    payment_type: PaymentType
    duplicate: bool  # shu savat avval yozilgan — yangi sotuv yaratilmadi


# ---------- Ro'yxat ----------


class SaleRow(BaseModel):
    id: int
    number: str
    created_at: datetime
    store: Ref
    seller: Ref
    customer: Ref | None
    total: int
    returned_total: int
    payment_type: PaymentType
    status: SaleStatus


class SalePage(BaseModel):
    items: list[SaleRow]
    total: int
    amount: int  # filtrga mos sotuvlar summasi (bekor qilinganlarsiz, qaytarilgani ayirilgan)


# ---------- Kartochka ----------


class SaleLineOut(BaseModel):
    id: int
    sku_label: str
    batch_id: int
    batch_number: str
    meters: Decimal
    kg: Decimal | None
    price_per_m: int
    recommended_price_per_m: int | None
    amount: int
    returned_m: Decimal
    returned_amount: int  # shu qator bo'yicha qaytarilgan summa
    negative_stock_note: str | None
    cost_per_m: int | None  # faqat biznes egasiga


class DebtOut(BaseModel):
    amount: int
    remaining: int
    due_date: date
    status: Literal["active", "cancelled"]


class ReturnLineOut(BaseModel):
    sku_label: str
    meters: Decimal
    amount: int


class ReturnOut(BaseModel):
    id: int
    created_at: datetime
    user: str
    amount: int
    debt_amount: int  # qarzdan ayirilgani
    refund: int  # pul bilan qaytarilgani
    method: MoneyMethod | None
    lines: list[ReturnLineOut]


class SaleCard(SaleRow):
    initial_payment: int
    initial_payment_method: MoneyMethod | None
    lines: list[SaleLineOut]
    debt: DebtOut | None
    returns: list[ReturnOut]
    profit: int | None  # faqat biznes egasiga: (narx − tannarx) × sotilgan metr, qaytarilgani ayirilgan
    cancelled_by: str | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    can_cancel: bool
    can_return: bool


# ---------- Amallar ----------


class CancelIn(BaseModel):
    reason: Note


class ReturnLineIn(BaseModel):
    sale_line_id: int
    meters: Meters


class ReturnIn(BaseModel):
    lines: list[ReturnLineIn] = Field(min_length=1, max_length=100)
    method: MoneyMethod = "cash"  # pul qanday qaytariladi (qarzdan ayirilmagan qismi)


class ReturnCreated(BaseModel):
    id: int
    amount: int
    debt_amount: int
    refund: int
