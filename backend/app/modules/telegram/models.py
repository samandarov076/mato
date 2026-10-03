"""Telegram bog'lanishi: qaysi ega qaysi Telegram suhbatiga (chat) ulangan va nimalarni olishni xohlaydi."""
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TelegramLink(Base):
    """Har xodimga bitta qator. `chat_id` bo'sh — uzilgan (sozlamalari saqlanib qoladi)."""

    __tablename__ = "telegram_links"
    __table_args__ = (Index("ix_telegram_links_business_id", "business_id"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    chat_id: Mapped[int | None] = mapped_column(BigInteger)
    username: Mapped[str | None]  # Telegram'dagi nomi — "qaysi akkaunt ulangan" ko'rsatish uchun
    daily_summary: Mapped[bool] = mapped_column(server_default=text("true"))  # kunlik xulosa
    instant_alerts: Mapped[bool] = mapped_column(server_default=text("true"))  # darhol keladigan xabarlar
    linked_at: Mapped[datetime | None]
