"""Platforma jadvallari: bizneslar va ularning bloklash tarixi."""
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    Time,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Business(Base):
    """Biznes (tenant). Hech qachon o'chirilmaydi — faqat bloklanadi."""

    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'blocked')", name="status"),
        CheckConstraint("credit_days > 0", name="credit_days"),
        CheckConstraint("price_rounding IN (1, 100, 1000)", name="price_rounding"),
        CheckConstraint("autolock_minutes > 0", name="autolock_minutes"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    name: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")

    # Biznes sozlamalari (docs/03-details/00-umumiy.md)
    sell_by_kg: Mapped[bool] = mapped_column(server_default=text("true"))
    credit_enabled: Mapped[bool] = mapped_column(server_default=text("true"))
    credit_days: Mapped[int] = mapped_column(Integer, server_default="30")
    low_stock_default: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_rounding: Mapped[int] = mapped_column(Integer, server_default="1000")
    autolock_minutes: Mapped[int] = mapped_column(Integer, server_default="30")
    daily_summary_time: Mapped[time] = mapped_column(Time, server_default=text("'21:00'"))
    timezone: Mapped[str] = mapped_column(server_default="Asia/Tashkent")

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_activity_at: Mapped[datetime | None]


class BusinessStatusEvent(Base):
    """Bloklash / blokdan chiqarish / asosiy egani almashtirish tarixi. Faqat platforma egasi ko'radi."""

    __tablename__ = "business_status_events"
    __table_args__ = (
        CheckConstraint("action IN ('block', 'unblock', 'owner_change')", name="action"),
        Index("ix_business_status_events_business_id", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    action: Mapped[str]
    reason: Mapped[str]
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # kim qildi
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
