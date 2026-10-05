"""Katalog API'sining shakllari: matolar, ranglar, gullar, SKU va tavsiya narx."""
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

# Kodni biznes o'zi o'ylab topadi: raqam, harf, belgi — istalgan ko'rinishda
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
PriceUnit = Literal["m", "kg"]
Price = Annotated[int, Field(gt=0, le=1_000_000_000)]  # so'm

# ---------- Matolar ----------


class FabricIn(BaseModel):
    code: Code
    name: Name
    width_cm: int | None = Field(default=None, gt=0, le=1000)
    composition: str | None = Field(default=None, max_length=200)
    image_url: str | None = Field(default=None, max_length=200)
    # 1 kg = X metr; kirimda partiyaga avtomatik qo'yiladi
    default_m_per_kg: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=4)


class FabricOut(BaseModel):
    id: int
    code: str
    name: str
    width_cm: int | None
    composition: str | None
    image_url: str | None
    default_m_per_kg: Decimal | None
    is_active: bool
    sku_count: int


# ---------- Ranglar va gullar ----------


class AttributeIn(BaseModel):
    code: Code
    name: Name
    hex: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")  # faqat rangda
    image_url: str | None = Field(default=None, max_length=200)


class AttributeOut(BaseModel):
    id: int
    code: str
    name: str
    hex: str | None = None
    image_url: str | None
    is_plain: bool = False  # "gulsiz" — faqat gullarda
    is_active: bool
    sku_count: int


# ---------- SKU ----------


class SkuCreate(BaseModel):
    """Bitta mato uchun tanlangan ranglar × gullar. Gul tanlanmasa — "gulsiz"."""

    fabric_id: int
    color_ids: list[int] = Field(min_length=1, max_length=200)
    pattern_ids: list[int] = Field(default=[], max_length=200)


class SkuCreated(BaseModel):
    created: int
    existing: int  # oldindan bor bo'lgani uchun qo'shilmaganlar


class SkuUpdate(BaseModel):
    price: Price | None = None  # bo'sh — tavsiya narx olib tashlanadi
    price_unit: PriceUnit = "m"
    low_stock_threshold: Decimal | None = Field(
        default=None, gt=0, max_digits=12, decimal_places=2
    )


class BulkPriceIn(BaseModel):
    sku_ids: list[int] = Field(min_length=1, max_length=500)
    price: Price
    price_unit: PriceUnit = "m"


class FabricRef(BaseModel):
    id: int
    code: str
    name: str
    image_url: str | None  # sotuv ekranida tovar rasmi: gul → rang → mato
    default_m_per_kg: Decimal | None
    is_active: bool


class ColorRef(BaseModel):
    id: int
    code: str
    name: str
    hex: str | None
    image_url: str | None
    is_active: bool


class PatternRef(BaseModel):
    id: int
    code: str
    name: str
    image_url: str | None
    is_plain: bool
    is_active: bool


class SkuOut(BaseModel):
    id: int
    code: str  # mato-rang[-gul]
    fabric: FabricRef
    color: ColorRef
    pattern: PatternRef
    price: int | None
    price_unit: PriceUnit
    low_stock_threshold: Decimal | None
    is_active: bool


class SkuPage(BaseModel):
    items: list[SkuOut]
    total: int


class PriceChange(BaseModel):
    created_at: datetime
    old_price: int | None
    old_price_unit: PriceUnit | None
    new_price: int | None
    price_unit: PriceUnit
    user_name: str | None  # bo'sh — tizim


class SkuCard(SkuOut):
    low_stock_default: Decimal | None  # biznes sozlamasidagi standart chegara
    history: list[PriceChange]
