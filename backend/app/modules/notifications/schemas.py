"""Xabarlar API'sining shakllari."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    event_code: str  # masalan "transfer.diff" — interfeys matn va havolani shundan yasaydi
    data: dict[str, Any]
    created_at: datetime
    read: bool


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    next_cursor: int | None  # keyingi sahifa uchun: shu id dan eskilari
    unread: int
