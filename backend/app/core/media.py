"""Rasmlar: yuklash va berish (mato, rang, gul rasmlari).

Yuklangan har rasm qayta kodlanadi (WebP, eng uzun tomoni 1200 px gacha): hajmi kichrayadi,
ichidagi qo'shimcha ma'lumot (joylashuv va h.k.) tushib qoladi, "rasm" ko'rinishidagi boshqa fayl o'tmaydi.

Fayl nomi — taxmin qilib bo'lmaydigan tasodifiy son. Tovar rasmi sir emas, shuning uchun manzilni
bilgan ochadi va <img> ga token kerak bo'lmaydi.

Saqlash hozircha lokal diskda (MEDIA_DIR). Hosting tanlanganda faqat shu fayldagi `_save` va
`media_path` boshqa omborga (S3 va h.k.) ko'chiriladi — qolgan kod o'zgarmaydi.
"""
import asyncio
import io
import re
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings
from app.core.deps import AuthContext, require_roles
from app.core.errors import AppError

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1200  # px
Image.MAX_IMAGE_PIXELS = 40_000_000  # juda katta "siqilgan" rasm xotirani to'ldirib qo'ymasin

_NAME = re.compile(r"[0-9a-f]{32}(?:\.s)?\.webp")  # .s.webp — kichik (96px) variant
THUMB_SIDE = 96
_URL = re.compile(r"/api/media/(\d+)/([0-9a-f]{32}\.webp)")


def _encode(raw: bytes) -> tuple[bytes, bytes]:
    """Rasmni ochib, WebP qilib qaytaradi: (katta — 1200px gacha, kichik — 96px kvadrat). Rasm bo'lmasa — `invalid_image`."""
    try:
        with Image.open(io.BytesIO(raw)) as source:
            image = ImageOps.exif_transpose(source)  # telefon rasmi yonboshlab qolmasin
            image.thumbnail((MAX_SIDE, MAX_SIDE))
            if image.mode != "RGB":
                # Shaffof fon oq bo'ladi (qora emas)
                layer = image.convert("RGBA")
                image = Image.new("RGB", layer.size, "white")
                image.paste(layer, mask=layer.getchannel("A"))
            out = io.BytesIO()
            image.save(out, "WEBP", quality=82)
            # Ro'yxat va chiplar uchun kichik variant: markazdan kvadrat kesib, 96px
            small = ImageOps.fit(image, (THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS)
            thumb = io.BytesIO()
            small.save(thumb, "WEBP", quality=80)
            return out.getvalue(), thumb.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as error:
        raise AppError(422, "invalid_image") from error


def _save(business_id: int, raw: bytes) -> str:
    data, thumb = _encode(raw)
    stem = secrets.token_hex(16)
    folder = get_settings().media_dir / str(business_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{stem}.webp").write_bytes(data)
    (folder / f"{stem}.s.webp").write_bytes(thumb)
    return f"/api/media/{business_id}/{stem}.webp"


def media_path(business_id: int, name: str) -> Path | None:
    """Rasm fayli. Nom faqat biz bergan ko'rinishda bo'lsa qabul qilinadi (boshqa papkaga chiqib bo'lmaydi)."""
    if not _NAME.fullmatch(name):
        return None
    path = get_settings().media_dir / str(business_id) / name
    return path if path.is_file() else None


def check_image_url(business_id: int, url: str | None) -> str | None:
    """Formadan kelgan rasm manzili: faqat shu biznes yuklagan rasm bo'lishi mumkin (tashqi havola emas)."""
    if not url:
        return None
    match = _URL.fullmatch(url)
    if not match or int(match[1]) != business_id or media_path(business_id, match[2]) is None:
        raise AppError(422, "validation_error", fields={"image_url": "invalid"})
    return url


router = APIRouter(tags=["rasmlar"])

Uploader = Annotated[AuthContext, Depends(require_roles("owner", "warehouse"))]


@router.post("/uploads/image", status_code=201)
async def upload_image(file: UploadFile, ctx: Uploader) -> dict[str, str]:
    """Rasmni saqlaydi va manzilini qaytaradi; manzil keyin mato / rang / gul formasida yuboriladi."""
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise AppError(413, "image_too_large")
    return {"url": await asyncio.to_thread(_save, ctx.business.id, raw)}


@router.get("/media/{business_id}/{name}")
async def get_image(business_id: int, name: str) -> FileResponse:
    path = media_path(business_id, name)
    # Eski rasmlarda kichik variant yo'q — kattasi beriladi (brauzer o'zi kichraytiradi)
    if path is None and name.endswith(".s.webp"):
        path = media_path(business_id, name[:-7] + ".webp")
    if path is None:
        raise AppError(404, "not_found")
    # Fayl hech qachon o'zgarmaydi (yangi rasm — yangi nom), brauzer bir marta yuklab oladi
    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
