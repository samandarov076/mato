"""Ombor jadvallari: qoldiqning ikki qatlami, ko'chirishlar va partiyani yopish.

- `stock_movements` — har bir harakat (kirim, ko'chirish, sotuv, yopish ...). Faqat qo'shiladi, hech qachon
  o'zgarmaydi: bu haqiqat manbai va partiya tarixi.
- `batch_stock` — (partiya, joy) bo'yicha hozirgi qoldiq. Har harakat bilan bitta tranzaksiyada yangilanadi.
  Ikkalasini faqat `inventory.stock.move_stock` o'zgartiradi.
- `transfers`, `transfer_lines` — ko'chirish (jo'natish → qabul).
- `batch_closures` — partiyani joyda yopish va metr farqi.
"""
import uuid
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
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

MOVEMENT_TYPES = (
    "receipt",  # kirim
    "receipt_cancel",  # kirim bekor qilindi
    "transfer_out",  # ko'chirish: jo'natildi
    "transfer_in",  # ko'chirish: qabul qilindi
    "transfer_cancel",  # ko'chirish bekor qilindi — jo'natuvchiga qaytdi
    "sale",
    "sale_cancel",
    "return",  # mijoz qaytardi
    "close",  # partiya shu joyda yopildi — qoldiq 0 ga keltirildi
    "reopen",
    "correction",  # kirimdagi metr tuzatildi
)


class BatchStock(Base):
    """Partiyaning bitta joydagi qoldig'i (metrda). Manfiy bo'lishi mumkin — yopilganda "ortiq chiqdi" bo'ladi."""

    __tablename__ = "batch_stock"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'closed')", name="status"),
        Index("ix_batch_stock_location_id_batch_id", "location_id", "batch_id"),
    )

    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"), primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    # Shu joyga kirgan metr (kirim yoki qabul qilingan ko'chirish) — metr farqi shunga nisbatan hisoblanadi
    received_m: Mapped[Decimal] = mapped_column(Numeric(12, 2), server_default="0")
    qty_m: Mapped[Decimal] = mapped_column(Numeric(12, 2), server_default="0")
    status: Mapped[str] = mapped_column(server_default="open")


class Transfer(Base):
    """Ko'chirish — ikki bosqichli: jo'natildi ("yo'lda") → qabul qilindi. Yo'lda metr hech qaysi joyda turmaydi."""

    __tablename__ = "transfers"
    __table_args__ = (
        CheckConstraint("status IN ('in_transit', 'received', 'cancelled')", name="status"),
        CheckConstraint("from_location_id <> to_location_id", name="locations"),
        UniqueConstraint("business_id", "number"),
        # Bir ko'chirish ikki marta yozilmaydi: forma har ko'chirishga noyob identifikator beradi
        UniqueConstraint("business_id", "client_uuid"),
        Index("ix_transfers_business_id_status_sent_at", "business_id", "status", "sent_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    client_uuid: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # 13-migratsiyagacha yozilganlarida yo'q
    number: Mapped[str]  # K-00045
    from_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    to_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    status: Mapped[str] = mapped_column(server_default="in_transit")
    note: Mapped[str | None]
    sent_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    sent_at: Mapped[datetime] = mapped_column(server_default=func.now())
    received_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    received_at: Mapped[datetime | None]
    # Qabul qiluvchining izohi — jo'natilgan va kelgan miqdor farq qilsa majburiy
    receive_note: Mapped[str | None]
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None]


class TransferLine(Base):
    """Ko'chirish qatori: partiyadan necha rulon va metr jo'natildi, qabulda qancha keldi.

    Farq (jo'natilgan − kelgan) faqat shu yerda turadi: hech qaysi joy qoldig'iga kirmaydi va
    partiya yopilganda ikkinchi marta hisoblanmaydi.
    """

    __tablename__ = "transfer_lines"
    __table_args__ = (
        UniqueConstraint("transfer_id", "batch_id"),
        CheckConstraint("sent_m > 0", name="sent_m"),
        CheckConstraint("sent_rolls >= 0", name="sent_rolls"),
        CheckConstraint("received_m >= 0", name="received_m"),
        CheckConstraint("received_rolls >= 0", name="received_rolls"),
        Index("ix_transfer_lines_batch_id", "batch_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    transfer_id: Mapped[int] = mapped_column(ForeignKey("transfers.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    sent_rolls: Mapped[int] = mapped_column(Integer)
    sent_m: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    received_rolls: Mapped[int | None] = mapped_column(Integer)
    received_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))


class BatchClosure(Base):
    """Partiya bitta joyda yopildi: tizimda qolgan metr — "metr farqi" (+ kam chiqdi, − ortiq chiqdi)."""

    __tablename__ = "batch_closures"
    __table_args__ = (
        Index("ix_batch_closures_batch_id_location_id", "batch_id", "location_id"),
        Index("ix_batch_closures_business_id_closed_at", "business_id", "closed_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    received_m: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # shu joyga kirgan
    out_m: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # sotilgan va ko'chirilgan
    diff_m: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    diff_amount: Mapped[int]  # so'm: farq × tannarx
    note: Mapped[str | None]
    closed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    closed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Xato yopilgan bo'lsa qayta ochiladi — yozuv o'chirilmaydi, shu ikki maydon to'ldiriladi
    reopened_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reopened_at: Mapped[datetime | None]


class StockMovement(Base):
    """Bitta harakat: qaysi partiya, qaysi joy, necha metr (+ kirdi, − chiqdi), kim va qaysi hujjat bo'yicha."""

    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint(
            "type IN (" + ", ".join(f"'{t}'" for t in MOVEMENT_TYPES) + ")", name="type"
        ),
        Index(
            "ix_stock_movements_batch_id_location_id_created_at",
            "batch_id",
            "location_id",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    qty_m: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    type: Mapped[str]
    # Harakatga sabab bo'lgan hujjat: ("receipt", 12), ("sale", 345) ...
    ref_type: Mapped[str | None]
    ref_id: Mapped[int | None]
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
