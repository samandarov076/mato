"""Kirim jadvallari: kirim hujjati (bitta kelgan yuk) va partiyalar (hujjat qatorlari).

Partiya = bitta SKU'ning shu yukdagi miqdori. Yozilgan metr (`meters_labeled`) — etiketka bo'yicha;
metr farqi keyin shu raqamga nisbatan hisoblanadi. Tannarx 1 metr uchun, so'mda.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Receipt(Base):
    """Kirim hujjati. O'chirilmaydi — harakatsiz bo'lsa, biznes egasi bekor qiladi."""

    __tablename__ = "receipts"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'cancelled')", name="status"),
        UniqueConstraint("business_id", "number"),
        # Bir kirim ikki marta yozilmaydi: forma har kirimga noyob identifikator beradi
        UniqueConstraint("business_id", "client_uuid"),
        Index("ix_receipts_business_id_receipt_date", "business_id", "receipt_date"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    client_uuid: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # 13-migratsiyagacha yozilganlarida yo'q
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    number: Mapped[str]  # KR-00045
    receipt_date: Mapped[date]
    note: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None]


class Batch(Base):
    """Partiya. Raqami (P-000123) etiketkadagi shtrix-kod — biznes ichida noyob."""

    __tablename__ = "batches"
    __table_args__ = (
        UniqueConstraint("business_id", "number"),
        CheckConstraint("rolls_count >= 1", name="rolls_count"),
        CheckConstraint("meters_labeled > 0", name="meters_labeled"),
        CheckConstraint("kg > 0", name="kg"),
        CheckConstraint("m_per_kg > 0", name="m_per_kg"),
        CheckConstraint("cost_per_m >= 0", name="cost_per_m"),
        Index("ix_batches_receipt_id", "receipt_id"),
        Index("ix_batches_sku_id", "sku_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    receipt_id: Mapped[int] = mapped_column(ForeignKey("receipts.id"))
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"))
    number: Mapped[str]
    rolls_count: Mapped[int] = mapped_column(Integer)
    meters_labeled: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    # 1 kg = X metr: metr va kg ikkalasi kiritilsa — metr ÷ kg, aks holda matoning standarti
    m_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    cost_per_m: Mapped[int]  # tannarx, so'm
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
