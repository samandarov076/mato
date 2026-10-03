"""Biznes sozlamalari va harakatlar jurnali API'sining shakllari."""
from datetime import datetime, time
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SettingsBody(BaseModel):
    """Biznes sozlamalari (docs/03-details/00-umumiy.md). O'qishda ham, saqlashda ham shu shakl."""

    model_config = ConfigDict(from_attributes=True)

    sell_by_kg: bool
    credit_enabled: bool
    credit_days: int = Field(ge=1, le=365)
    # Metr; bo'sh (null) — standart chegara yo'q. JSON'da matn sifatida ("50.00") — aniqlik yo'qolmasin
    low_stock_default: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    price_rounding: Literal[1, 100, 1000]
    autolock_minutes: int = Field(ge=1, le=480)
    # Telegram kunlik xulosasi yuboriladigan vaqt (biznes vaqti bo'yicha) — to'liq soat: "21:00:00"
    daily_summary_time: time = time(21, 0)

    @field_validator("daily_summary_time")
    @classmethod
    def _whole_hour(cls, value: time) -> time:
        if value.minute or value.second or value.microsecond or value.tzinfo is not None:
            raise ValueError("to'liq soat bo'lishi kerak")
        return value

    @field_validator("low_stock_default")
    @classmethod
    def _to_centimetres(cls, value: Decimal | None) -> Decimal | None:
        # Metr doim 2 xona (1 sm) aniqlikda: "50.5" → "50.50" — bazadagi ko'rinish bilan bir xil
        return value.quantize(Decimal("0.01")) if value is not None else None


class AuditUser(BaseModel):
    id: int
    full_name: str


class AuditLocation(BaseModel):
    id: int
    name: str
    type: Literal["store", "warehouse"]


class AuditItem(BaseModel):
    id: int
    created_at: datetime
    category: str
    event_code: str  # interfeys `audit.events.<kod>` bo'yicha tarjima qiladi
    data: dict[str, Any]
    user: AuditUser | None
    location: AuditLocation | None


class AuditPage(BaseModel):
    items: list[AuditItem]
    next_cursor: str | None  # keyingi sahifa uchun; None — boshqa yozuv yo'q
