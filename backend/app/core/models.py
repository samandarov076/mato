"""Barcha modullar ishlatadigan umumiy jadvallar: harakatlar jurnali va hujjat raqamlari."""
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Identity, Index, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    """Harakatlar jurnali. Faqat qo'shiladi — yangilash va o'chirish bazadagi trigger bilan taqiqlangan.

    Hodisa matn emas, kod (event_code) + ma'lumot (data) — har kim o'z tilida ko'radi.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        CheckConstraint(
            "category IN ('login', 'sale', 'stock', 'price', 'credit', 'staff')", name="category"
        ),
        Index("ix_audit_logs_business_id_created_at", "business_id", "created_at"),
        Index("ix_audit_logs_business_id_category_created_at", "business_id", "category", "created_at"),
        Index("ix_audit_logs_business_id_user_id_created_at", "business_id", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    category: Mapped[str]
    event_code: Mapped[str]
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Counter(Base):
    """Har biznes uchun uzluksiz hujjat raqamlari (partiya P-000123, sotuv S-000045, ko'chirish K-00045, kirim KR-00045). Qator qulflanib oshiriladi."""

    __tablename__ = "counters"
    __table_args__ = (
        CheckConstraint("name IN ('batch', 'sale', 'transfer', 'receipt')", name="name"),
    )

    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), primary_key=True)
    name: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[int] = mapped_column(server_default="0")
