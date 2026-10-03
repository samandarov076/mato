"""Sotuv jadvallari: sotuv, qatorlari va qaytarishlar.

Sotuv qatorida nom, tavsiya narx va tannarx sotuv paytidagi qiymati bilan saqlanadi — keyin katalogda
yoki kirimda o'zgarsa ham eski sotuvlar, foyda va narx og'ishi hisoboti buzilmaydi.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("business_id", "number"),
        # Bir sotuv ikki marta yozilmaydi: sotuv ekrani har savatga noyob identifikator beradi
        UniqueConstraint("business_id", "client_uuid"),
        CheckConstraint("payment_type IN ('cash', 'card', 'credit')", name="payment_type"),
        CheckConstraint(
            "initial_payment_method IS NULL OR initial_payment_method IN ('cash', 'card')",
            name="initial_payment_method",
        ),
        CheckConstraint("status IN ('completed', 'cancelled')", name="status"),
        CheckConstraint("total >= 0 AND initial_payment >= 0 AND returned_total >= 0", name="amounts"),
        Index("ix_sales_business_id_created_at", "business_id", "created_at"),
        Index("ix_sales_business_id_store_id_created_at", "business_id", "store_id", "created_at"),
        Index("ix_sales_customer_id", "customer_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    number: Mapped[str]  # S-000045
    client_uuid: Mapped[uuid.UUID] = mapped_column(Uuid)
    store_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))  # nasiya bo'lsa
    total: Mapped[int]
    payment_type: Mapped[str]
    initial_payment: Mapped[int] = mapped_column(server_default="0")  # nasiyada boshlang'ich to'lov
    initial_payment_method: Mapped[str | None]
    returned_total: Mapped[int] = mapped_column(server_default="0")  # qaytarilgan tovar summasi
    status: Mapped[str] = mapped_column(server_default="completed")
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None]
    cancel_reason: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SaleLine(Base):
    __tablename__ = "sale_lines"
    __table_args__ = (
        CheckConstraint("meters > 0", name="meters"),
        CheckConstraint("price_per_m > 0", name="price_per_m"),
        CheckConstraint("returned_m >= 0 AND returned_m <= meters", name="returned_m"),
        Index("ix_sale_lines_sale_id", "sale_id"),
        Index("ix_sale_lines_sku_id", "sku_id"),
        Index("ix_sale_lines_batch_id", "batch_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"))
    sku_label: Mapped[str]  # sotuv paytidagi kod va nom: "M101-03 · Xon atlas · Qizil"
    meters: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    price_per_m: Mapped[int]  # haqiqiy narx
    recommended_price_per_m: Mapped[int | None]  # tavsiya narx (1 metrga keltirilgan); yo'q bo'lsa — bo'sh
    cost_per_m: Mapped[int]  # tannarx nusxasi
    amount: Mapped[int]
    returned_m: Mapped[Decimal] = mapped_column(Numeric(12, 2), server_default="0")
    negative_stock_note: Mapped[str | None]  # qoldiqdan ko'p sotilganda izoh


class SaleReturn(Base):
    """Qaytarish: mijoz tovarni qaytardi. Pul qaytariladi yoki (nasiya bo'lsa) qarzdan ayriladi."""

    __tablename__ = "sale_returns"
    __table_args__ = (
        CheckConstraint("method IS NULL OR method IN ('cash', 'card')", name="method"),
        CheckConstraint("amount > 0 AND debt_amount >= 0 AND debt_amount <= amount", name="amounts"),
        Index("ix_sale_returns_sale_id", "sale_id"),
        Index("ix_sale_returns_business_id_created_at", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    store_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    amount: Mapped[int]  # qaytarilgan tovar summasi
    debt_amount: Mapped[int] = mapped_column(server_default="0")  # shundan qarzdan ayirilgani
    method: Mapped[str | None]  # qolgani (amount − debt_amount) qanday qaytarildi: naqd / karta
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ReturnLine(Base):
    __tablename__ = "return_lines"
    __table_args__ = (
        CheckConstraint("meters > 0", name="meters"),
        Index("ix_return_lines_return_id", "return_id"),
        Index("ix_return_lines_sale_line_id", "sale_line_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    return_id: Mapped[int] = mapped_column(ForeignKey("sale_returns.id"))
    sale_line_id: Mapped[int] = mapped_column(ForeignKey("sale_lines.id"))
    meters: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    amount: Mapped[int]
