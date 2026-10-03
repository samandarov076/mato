"""Tuzilma jadvallari: joylar (do'kon va sklad) va xodimlarga ruxsat etilgan joylar."""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Identity, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Location(Base):
    """Do'kon yoki sklad. Interfeysda alohida, bazada bitta jadval — qoldiq va ko'chirish bir xil ishlaydi."""

    __tablename__ = "locations"
    __table_args__ = (
        CheckConstraint("type IN ('store', 'warehouse')", name="type"),
        Index("ix_locations_business_id_type", "business_id", "type"),
        # Nom shu turdagi joylar orasida noyob (katta-kichik harf farqsiz) — 0002-migratsiya
        Index(
            "uq_locations_business_id_type_name",
            "business_id",
            "type",
            text("lower(name)"),
            unique=True,
        ),
        # Do'kon logini butun tizimda noyob — 0011-migratsiya
        Index(
            "uq_locations_login",
            text("lower(login)"),
            unique=True,
            postgresql_where=text("login IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    type: Mapped[str]
    name: Mapped[str]
    address: Mapped[str | None]
    phone: Mapped[str | None]
    # Do'kon qurilmasini ochish uchun do'konning o'z logini (butun tizimda noyob) va paroli — 0011-migratsiya.
    # Faqat do'konda; bo'sh bo'lsa — qurilmani faqat biznes egasi bog'laydi.
    login: Mapped[str | None]
    password_hash: Mapped[str | None]
    password_enc: Mapped[str | None]  # ega ko'rishi uchun shifrlangan nusxa (app/core/vault.py)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class UserLocation(Base):
    """Xodimga ruxsat etilgan joy (users.all_locations = false bo'lganda)."""

    __tablename__ = "user_locations"
    __table_args__ = (Index("ix_user_locations_location_id", "location_id"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
