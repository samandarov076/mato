"""Xodimga ruxsat etilgan joylar (02-tuzilmada belgilanadi): omborchi — o'z skladlari, sotuvchi — o'z do'konlari.

Kirim, ombor va sotuv modullari joy bilan ishlashdan oldin shu yerdan tekshiradi.
"""
from sqlalchemy import select

from app.core.deps import AuthContext
from app.core.errors import AppError
from app.modules.structure.models import Location, UserLocation


async def allowed_location_ids(ctx: AuthContext, type: str) -> set[int] | None:
    """Xodim ishlay oladigan shu turdagi joylar. None — cheklov yo'q (ega yoki "barcha joylar")."""
    if ctx.user.role == "owner" or ctx.user.all_locations:
        return None
    ids = await ctx.db.scalars(
        select(UserLocation.location_id)
        .join(Location, Location.id == UserLocation.location_id)
        .where(UserLocation.user_id == ctx.user.id, Location.type == type)
    )
    return set(ids.all())


async def can_act_at(ctx: AuthContext, location: Location) -> bool:
    """Xodim shu joyda ish qila oladimi (qabul qilish, yopish): ega — hamma joyda, omborchi — o'z skladida,
    sotuvchi — o'zi kirgan qurilma bog'langan do'konda."""
    role = ctx.user.role
    if role == "owner":
        return True
    if role == "seller":
        return ctx.store is not None and ctx.store.id == location.id
    if location.type != "warehouse":
        return False
    allowed = await allowed_location_ids(ctx, "warehouse")
    return allowed is None or location.id in allowed


async def visible_location_ids(ctx: AuthContext) -> set[int] | None:
    """Qoldig'ini ko'ra oladigan joylar. None — hammasi.

    Ega va sotuvchi barcha joylarni ko'radi (sotuvchi — faqat metr va rulon); omborchi — o'ziga
    biriktirilgan skladlar va barcha do'konlarni.
    """
    if ctx.user.role != "warehouse":
        return None
    warehouses = await allowed_location_ids(ctx, "warehouse")
    if warehouses is None:
        return None
    stores = await ctx.db.scalars(select(Location.id).where(Location.type == "store"))
    return warehouses | set(stores.all())


async def require_location(
    ctx: AuthContext, location_id: int, type: str, *, field: str = "location_id"
) -> Location:
    """Faol va xodimga ruxsat etilgan joyni qaytaradi; aks holda — xato."""
    location = await ctx.db.get(Location, location_id)  # RLS: begona biznes joyi ko'rinmaydi
    if location is None or location.type != type or not location.is_active:
        raise AppError(422, "validation_error", fields={field: "invalid"})
    allowed = await allowed_location_ids(ctx, type)
    if allowed is not None and location.id not in allowed:
        raise AppError(403, "location_forbidden")
    return location
