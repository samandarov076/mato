"""Katalog jadvallari: mato, rang, gul, SKU (mato + rang + gul) va tavsiya narx tarixi.

Hech narsa o'chirilmaydi — faqat faolsizlantiriladi. Kodlarni biznes o'zi yaratadi; har kod o'z turi
ichida noyob (katta-kichik harf farqsiz).
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Fabric(Base):
    """Mato turi. Standart koeffitsient (1 kg = X metr) kirimda partiyaga avtomatik qo'yiladi."""

    __tablename__ = "fabrics"
    __table_args__ = (
        CheckConstraint("width_cm > 0", name="width_cm"),
        CheckConstraint("default_m_per_kg > 0", name="default_m_per_kg"),
        Index("uq_fabrics_business_id_code", "business_id", text("lower(code)"), unique=True),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    code: Mapped[str]
    name: Mapped[str]
    width_cm: Mapped[int | None] = mapped_column(Integer)
    composition: Mapped[str | None]
    image_url: Mapped[str | None]
    default_m_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Color(Base):
    """Rang. `fabric_id` bo'sh — barcha matolar uchun umumiy ro'yxat (1-versiyada doim shunday)."""

    __tablename__ = "colors"
    __table_args__ = (
        CheckConstraint("hex ~ '^#[0-9a-f]{6}$'", name="hex"),
        Index(
            "uq_colors_business_id_fabric_id_code",
            "business_id",
            "fabric_id",
            text("lower(code)"),
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    fabric_id: Mapped[int | None] = mapped_column(ForeignKey("fabrics.id"))
    code: Mapped[str]
    name: Mapped[str]
    hex: Mapped[str | None]  # rang namunasi: "#1f3a8a"
    image_url: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Pattern(Base):
    """Gul (naqsh). Har biznesda bitta "gulsiz" yozuvi bo'ladi (`is_plain`) — SKU kodida ko'rsatilmaydi."""

    __tablename__ = "patterns"
    __table_args__ = (
        Index(
            "uq_patterns_business_id_fabric_id_code",
            "business_id",
            "fabric_id",
            text("lower(code)"),
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
        Index(
            "uq_patterns_business_id_plain",
            "business_id",
            unique=True,
            postgresql_where=text("is_plain"),
        ),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    fabric_id: Mapped[int | None] = mapped_column(ForeignKey("fabrics.id"))
    code: Mapped[str]
    name: Mapped[str]
    image_url: Mapped[str | None]
    is_plain: Mapped[bool] = mapped_column(server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Sku(Base):
    """Sotiladigan tovar: mato + rang + gul. Tavsiya narx partiyaga emas, SKU'ga bog'liq."""

    __tablename__ = "skus"
    __table_args__ = (
        UniqueConstraint("business_id", "fabric_id", "color_id", "pattern_id"),
        CheckConstraint("price > 0", name="price"),
        CheckConstraint("price_unit IN ('m', 'kg')", name="price_unit"),
        CheckConstraint("low_stock_threshold > 0", name="low_stock_threshold"),
        Index("ix_skus_color_id", "color_id"),
        Index("ix_skus_pattern_id", "pattern_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    fabric_id: Mapped[int] = mapped_column(ForeignKey("fabrics.id"))
    color_id: Mapped[int] = mapped_column(ForeignKey("colors.id"))
    pattern_id: Mapped[int] = mapped_column(ForeignKey("patterns.id"))
    price: Mapped[int | None]  # tavsiya narx, so'm; bo'sh — "narxi belgilanmagan"
    price_unit: Mapped[str] = mapped_column(server_default="m")  # narx 1 metr yoki 1 kg uchun
    # Bo'sh bo'lsa — biznes sozlamasidagi standart chegara
    low_stock_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # SKU'ning o'z rasmi (aynan shu mato + rang + gul surati); bo'sh — gul / rang / mato rasmi ko'rsatiladi
    image_url: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SkuPriceHistory(Base):
    """Tavsiya narx tarixi: eski → yangi, kim, qachon. Faqat qo'shiladi."""

    __tablename__ = "sku_price_history"
    __table_args__ = (Index("ix_sku_price_history_sku_id_created_at", "sku_id", "created_at"),)

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"))
    old_price: Mapped[int | None]
    old_price_unit: Mapped[str | None]
    new_price: Mapped[int | None]
    price_unit: Mapped[str]
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
