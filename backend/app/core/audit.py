"""Harakatlar jurnaliga yozish. Barcha modullar faqat shu funksiya orqali yozadi."""
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import AuditLog

Category = Literal["login", "sale", "stock", "price", "credit", "staff"]


def log_event(
    session: AsyncSession,
    *,
    business_id: int,
    category: Category,
    event_code: str,
    user_id: int | None = None,
    location_id: int | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """Jurnalga yozuv qo'shadi. Amal bilan bitta tranzaksiyada saqlanadi: amal bekor bo'lsa, yozuv ham."""
    session.add(
        AuditLog(
            business_id=business_id,
            user_id=user_id,
            location_id=location_id,
            category=category,
            event_code=event_code,
            data=data or {},
        )
    )
