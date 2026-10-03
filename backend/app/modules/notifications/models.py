"""Tizim ichidagi xabarlar. Xabar matn emas — hodisa kodi + ma'lumot: har kim o'z tilida o'qiydi."""
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Identity, Index, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Notification(Base):
    """Bitta xodimga bitta xabar. `dedup_key` — bir hodisa uchun xabar bir marta kelishi uchun
    (masalan kam qoldiq: tovar qayta to'ldirilib yana kamayguncha takrorlanmaydi)."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
        Index(
            "ix_notifications_user_id_unread",
            "user_id",
            postgresql_where=text("read_at IS NULL"),
        ),
        Index(
            "uq_notifications_user_id_dedup_key",
            "user_id",
            "dedup_key",
            unique=True,
            postgresql_where=text("dedup_key IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # qabul qiluvchi
    event_code: Mapped[str]
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    dedup_key: Mapped[str | None]
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
