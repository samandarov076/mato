"""Kirish jadvallari: foydalanuvchilar, sessiyalar, do'kon qurilmalari, 2FA zaxira kodlari."""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Identity, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    """Xodim yoki platforma egasi. O'chirilmaydi — faqat faolsizlantiriladi."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('platform_owner', 'owner', 'warehouse', 'seller')", name="role"),
        # Platforma egasi biznesga tegishli emas; qolgan hamma — albatta bitta biznesda
        CheckConstraint("(role = 'platform_owner') = (business_id IS NULL)", name="business_by_role"),
        CheckConstraint("language IN ('uz', 'en', 'ru')", name="language"),
        # Telefon butun tizimda noyob (sotuvchida bo'lmasligi mumkin)
        Index("uq_users_phone", "phone", unique=True, postgresql_where=text("phone IS NOT NULL")),
        # PIN faqat faol sotuvchilar orasida noyob — do'kon qurilmasida sotuvchi PIN bo'yicha topiladi
        Index(
            "uq_users_business_id_pin_lookup",
            "business_id",
            "pin_lookup",
            unique=True,
            postgresql_where=text("role = 'seller' AND is_active"),
        ),
        # Har biznesda asosiy ega bitta
        Index(
            "uq_users_primary_owner",
            "business_id",
            unique=True,
            postgresql_where=text("is_primary_owner"),
        ),
        Index("ix_users_business_id_role", "business_id", "role"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int | None] = mapped_column(ForeignKey("businesses.id"))
    full_name: Mapped[str]
    phone: Mapped[str | None]
    password_hash: Mapped[str | None]  # sotuvchida yo'q — u faqat PIN bilan kiradi
    # HMAC(SECRET_KEY, PIN): bcrypt emas, chunki PIN bo'yicha qidirish va noyoblikni tekshirish kerak
    pin_lookup: Mapped[str | None]
    # Ko'rsatish uchun shifrlangan nusxalar (app/core/vault.py): ega xodiminikini, platforma egasi
    # biznes eganikini ko'radi. Kirish tekshiruvida ishlatilmaydi. Platforma egasining o'zida bo'sh.
    password_enc: Mapped[str | None]
    pin_enc: Mapped[str | None]
    role: Mapped[str]
    is_primary_owner: Mapped[bool] = mapped_column(server_default=text("false"))
    all_locations: Mapped[bool] = mapped_column(server_default=text("false"))
    totp_secret: Mapped[str | None]  # faqat platforma egasi
    language: Mapped[str] = mapped_column(server_default="uz")
    must_change_password: Mapped[bool] = mapped_column(server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Device(Base):
    """Do'konga bog'langan umumiy qurilma. Uzilganda (revoked_at) darhol ishlamay qoladi."""

    __tablename__ = "devices"
    __table_args__ = (
        Index("uq_devices_token_hash", "token_hash", unique=True),
        Index("ix_devices_business_id_store_id", "business_id", "store_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    store_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    name: Mapped[str]
    token_hash: Mapped[str]
    last_seen_at: Mapped[datetime | None]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class UserSession(Base):
    """Faol sessiya. Har so'rovda revoked_at tekshiriladi — xodim faolsizlantirilsa darhol chiqariladi."""

    __tablename__ = "sessions"
    __table_args__ = (
        Index("uq_sessions_refresh_token_hash", "refresh_token_hash", unique=True),
        Index("ix_sessions_user_id_active", "user_id", postgresql_where=text("revoked_at IS NULL")),
        Index("ix_sessions_device_id", "device_id", postgresql_where=text("device_id IS NOT NULL")),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int | None] = mapped_column(ForeignKey("businesses.id"))  # platforma egasida NULL
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"))  # do'kon qurilmasida
    refresh_token_hash: Mapped[str]
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class RecoveryCode(Base):
    """2FA zaxira kodi (bir martalik). Faqat platforma egasi uchun."""

    __tablename__ = "recovery_codes"
    __table_args__ = (Index("ix_recovery_codes_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    code_hash: Mapped[str]
    used_at: Mapped[datetime | None]
