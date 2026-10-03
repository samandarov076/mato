"""Telegram sozlamalari (/api/telegram) — har ega o'z profilida ulaydi va sozlaydi."""
from fastapi import APIRouter

from app.core.deps import OwnerAuth
from app.modules.telegram import service
from app.modules.telegram.schemas import LinkOut, PrefsIn, TelegramStatus

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.get("")
async def telegram_status(ctx: OwnerAuth) -> TelegramStatus:
    return await service.status(ctx)


@router.post("/link")
async def create_link(ctx: OwnerAuth) -> LinkOut:
    """Bir martalik havola: ochilgan botda "Start" bosilsa, Telegram shu egaga bog'lanadi."""
    return await service.create_link(ctx)


@router.patch("", status_code=204)
async def update_prefs(body: PrefsIn, ctx: OwnerAuth) -> None:
    """Kunlik xulosa va darhol keladigan xabarlarni yoqish / o'chirish."""
    await service.update_prefs(ctx, body)


@router.delete("", status_code=204)
async def unlink(ctx: OwnerAuth) -> None:
    await service.unlink(ctx)
