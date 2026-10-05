"""Xabarlar API'si (/api/notifications): har xodim faqat o'z xabarlarini ko'radi."""
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.core.deps import Auth
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationPage

router = APIRouter(prefix="/notifications", tags=["xabarlar"])


@router.get("")
async def list_notifications(
    ctx: Auth,
    event: str | None = None,
    kind: Literal["low_stock", "transfers", "credit", "other"] | None = None,
    unread_only: bool = False,
    cursor: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> NotificationPage:
    return await service.list_notifications(
        ctx, event=event, kind=kind, unread_only=unread_only, cursor=cursor, limit=limit
    )


@router.get("/unread-count")
async def unread_count(ctx: Auth) -> dict[str, int]:
    """Qo'ng'iroqcha yonidagi son."""
    return {"count": await service.unread_count(ctx)}


@router.get("/stream")
async def stream(ctx: Auth) -> StreamingResponse:
    """Real vaqt: yangi xabar kelganda brauzerga signal (Server-Sent Events).

    Baza sessiyasi shu yerda yopiladi — oqim faqat Redis'ni tinglaydi va ulanishni band qilmaydi.
    """
    return StreamingResponse(
        service.stream(ctx.business.id, ctx.user.id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/read-all", status_code=204)
async def mark_all_read(ctx: Auth) -> None:
    await service.mark_all_read(ctx)


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(notification_id: int, ctx: Auth) -> None:
    await service.mark_read(ctx, notification_id)
