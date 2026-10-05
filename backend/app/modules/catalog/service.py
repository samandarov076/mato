"""Katalog mantiqi: matolar, ranglar, gullar, SKU va tavsiya narx. Hamma amal biznes ichida (RLS).

Hech narsa o'chirilmaydi — faqat faolsizlantiriladi. Narx o'zgarishi SKU narx tarixiga va jurnalga
("Narx" kategoriyasi) yoziladi; katalogning boshqa o'zgarishlari — jurnalning "Ombor" kategoriyasiga.
"""
from typing import Any, Literal

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import Select

from app.core.audit import Category, log_event
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.core.media import check_image_url
from app.modules.auth.models import User
from app.modules.catalog.models import Color, Fabric, Pattern, Sku, SkuPriceHistory
from app.modules.catalog.schemas import (
    AttributeIn,
    AttributeOut,
    BulkPriceIn,
    ColorRef,
    FabricIn,
    FabricOut,
    FabricRef,
    PatternRef,
    PriceChange,
    SkuCard,
    SkuCreate,
    SkuCreated,
    SkuOut,
    SkuPage,
    SkuUpdate,
)

Kind = Literal["colors", "patterns"]
_MODELS: dict[str, type[Color] | type[Pattern]] = {"colors": Color, "patterns": Pattern}
_EVENT = {"colors": "color", "patterns": "pattern"}
_SKU_COLUMN = {"colors": Sku.color_id, "patterns": Sku.pattern_id}

# Bitta so'rovda yaratiladigan SKU'lar chegarasi (ranglar × gullar)
MAX_SKUS_PER_REQUEST = 300
HISTORY_LIMIT = 50


def _field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields={field: problem})


def _log(ctx: AuthContext, event_code: str, category: Category = "stock", **data: Any) -> None:
    log_event(
        ctx.db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        category=category,
        event_code=event_code,
        data=data,
    )


def _like(search: str) -> str:
    """Qidiruv matni LIKE uchun: % va _ oddiy belgi sifatida qidiriladi."""
    escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _flush_code(ctx: AuthContext) -> None:
    """Kod noyobligini baza kafolatlaydi — cheklov buzilsa tushunarli xatoga aylantiramiz."""
    try:
        async with ctx.db.begin_nested():
            await ctx.db.flush()
    except IntegrityError as error:
        if "_code" in str(error.orig):
            raise AppError(409, "code_taken") from None
        raise


def _label(row: Fabric | Color | Pattern) -> str:
    return f"{row.code} — {row.name}"


async def _sku_counts(ctx: AuthContext, column: Any) -> dict[int, int]:
    return dict((await ctx.db.execute(select(column, func.count()).group_by(column))).all())


# ====================== Matolar ======================


async def list_fabrics(
    ctx: AuthContext, search: str | None = None, include_inactive: bool = False
) -> list[FabricOut]:
    query = select(Fabric).order_by(Fabric.is_active.desc(), func.lower(Fabric.code))
    if not include_inactive:
        query = query.where(Fabric.is_active)
    if search and search.strip():
        like = _like(search)
        query = query.where(
            or_(Fabric.code.ilike(like, escape="\\"), Fabric.name.ilike(like, escape="\\"))
        )
    counts = await _sku_counts(ctx, Sku.fabric_id)
    return [
        FabricOut(
            id=fabric.id,
            code=fabric.code,
            name=fabric.name,
            width_cm=fabric.width_cm,
            composition=fabric.composition,
            image_url=fabric.image_url,
            default_m_per_kg=fabric.default_m_per_kg,
            is_active=fabric.is_active,
            sku_count=counts.get(fabric.id, 0),
        )
        for fabric in (await ctx.db.scalars(query)).all()
    ]


async def _fabric(ctx: AuthContext, fabric_id: int) -> Fabric:
    fabric = await ctx.db.get(Fabric, fabric_id)  # RLS: boshqa biznes matosi ko'rinmaydi
    if fabric is None:
        raise AppError(404, "fabric_not_found")
    return fabric


def _apply_fabric(ctx: AuthContext, fabric: Fabric, body: FabricIn) -> None:
    fabric.code = body.code
    fabric.name = body.name
    fabric.width_cm = body.width_cm
    fabric.composition = (body.composition or "").strip() or None
    fabric.image_url = check_image_url(ctx.business.id, body.image_url)
    fabric.default_m_per_kg = body.default_m_per_kg


async def create_fabric(ctx: AuthContext, body: FabricIn) -> Fabric:
    fabric = Fabric(business_id=ctx.business.id)
    _apply_fabric(ctx, fabric, body)
    ctx.db.add(fabric)
    await _flush_code(ctx)
    _log(ctx, "fabric.created", name=_label(fabric))
    return fabric


async def update_fabric(ctx: AuthContext, fabric_id: int, body: FabricIn) -> None:
    fabric = await _fabric(ctx, fabric_id)
    _apply_fabric(ctx, fabric, body)
    await _flush_code(ctx)
    _log(ctx, "fabric.updated", name=_label(fabric))


async def set_fabric_active(ctx: AuthContext, fabric_id: int, active: bool) -> None:
    fabric = await _fabric(ctx, fabric_id)
    if fabric.is_active == active:
        return
    fabric.is_active = active
    _log(ctx, "fabric.activated" if active else "fabric.deactivated", name=_label(fabric))


# ====================== Ranglar va gullar ======================


async def plain_pattern(ctx: AuthContext) -> Pattern:
    """Biznesning "gulsiz" yozuvi. Birinchi murojaatda yaratiladi — gulsiz mato ham SKU bo'la olishi uchun."""
    query = select(Pattern).where(Pattern.is_plain)
    pattern = await ctx.db.scalar(query)
    if pattern is None:
        # Ikki so'rov bir vaqtda kelsa, ikkinchisi jim o'tadi (bitta biznesda bitta "gulsiz")
        await ctx.db.execute(
            pg_insert(Pattern)
            .values(business_id=ctx.business.id, code="0", name="Gulsiz", is_plain=True)
            .on_conflict_do_nothing()
        )
        pattern = (await ctx.db.scalars(query)).one()
    return pattern


async def list_attributes(
    ctx: AuthContext, kind: Kind, search: str | None = None, include_inactive: bool = False
) -> list[AttributeOut]:
    model = _MODELS[kind]
    query = select(model).order_by(model.is_active.desc(), func.lower(model.code))
    if kind == "patterns":
        await plain_pattern(ctx)
        query = query.order_by(None).order_by(
            Pattern.is_plain.desc(), Pattern.is_active.desc(), func.lower(Pattern.code)
        )
    if not include_inactive:
        query = query.where(model.is_active)
    if search and search.strip():
        like = _like(search)
        query = query.where(
            or_(model.code.ilike(like, escape="\\"), model.name.ilike(like, escape="\\"))
        )
    counts = await _sku_counts(ctx, _SKU_COLUMN[kind])
    return [
        AttributeOut(
            id=row.id,
            code=row.code,
            name=row.name,
            hex=getattr(row, "hex", None),
            image_url=row.image_url,
            is_plain=getattr(row, "is_plain", False),
            is_active=row.is_active,
            sku_count=counts.get(row.id, 0),
        )
        for row in (await ctx.db.scalars(query)).all()
    ]


async def _attribute(ctx: AuthContext, kind: Kind, attribute_id: int) -> Color | Pattern:
    row = await ctx.db.get(_MODELS[kind], attribute_id)
    if row is None:
        raise AppError(404, f"{_EVENT[kind]}_not_found")
    return row


def _apply_attribute(ctx: AuthContext, row: Color | Pattern, body: AttributeIn) -> None:
    row.code = body.code
    row.name = body.name
    row.image_url = check_image_url(ctx.business.id, body.image_url)
    if isinstance(row, Color):
        row.hex = body.hex.lower() if body.hex else None


async def create_attribute(ctx: AuthContext, kind: Kind, body: AttributeIn) -> Color | Pattern:
    if kind == "patterns":
        await plain_pattern(ctx)  # "gulsiz" doim birinchi bo'lib yaratiladi
    row = _MODELS[kind](business_id=ctx.business.id)
    _apply_attribute(ctx, row, body)
    ctx.db.add(row)
    await _flush_code(ctx)
    _log(ctx, f"{_EVENT[kind]}.created", name=_label(row))
    return row


async def update_attribute(ctx: AuthContext, kind: Kind, attribute_id: int, body: AttributeIn) -> None:
    row = await _attribute(ctx, kind, attribute_id)
    _apply_attribute(ctx, row, body)
    await _flush_code(ctx)
    _log(ctx, f"{_EVENT[kind]}.updated", name=_label(row))


async def set_attribute_active(ctx: AuthContext, kind: Kind, attribute_id: int, active: bool) -> None:
    row = await _attribute(ctx, kind, attribute_id)
    if isinstance(row, Pattern) and row.is_plain and not active:
        raise AppError(400, "plain_pattern_protected")
    if row.is_active == active:
        return
    row.is_active = active
    suffix = "activated" if active else "deactivated"
    _log(ctx, f"{_EVENT[kind]}.{suffix}", name=_label(row))


# ====================== SKU ======================

_SKU_ROWS: Select = (
    select(Sku, Fabric, Color, Pattern)
    .join(Fabric, Fabric.id == Sku.fabric_id)
    .join(Color, Color.id == Sku.color_id)
    .join(Pattern, Pattern.id == Sku.pattern_id)
)


def sku_code(fabric: Fabric, color: Color, pattern: Pattern) -> str:
    """SKU kodi: mato-rang-gul; gulsiz bo'lsa — mato-rang."""
    parts = [fabric.code, color.code]
    if not pattern.is_plain:
        parts.append(pattern.code)
    return "-".join(parts)


def sku_out(sku: Sku, fabric: Fabric, color: Color, pattern: Pattern) -> SkuOut:
    return SkuOut(
        id=sku.id,
        code=sku_code(fabric, color, pattern),
        fabric=FabricRef(
            id=fabric.id,
            code=fabric.code,
            name=fabric.name,
            image_url=fabric.image_url,
            default_m_per_kg=fabric.default_m_per_kg,
            is_active=fabric.is_active,
        ),
        color=ColorRef(
            id=color.id,
            code=color.code,
            name=color.name,
            hex=color.hex,
            image_url=color.image_url,
            is_active=color.is_active,
        ),
        pattern=PatternRef(
            id=pattern.id,
            code=pattern.code,
            name=pattern.name,
            image_url=pattern.image_url,
            is_plain=pattern.is_plain,
            is_active=pattern.is_active,
        ),
        price=sku.price,
        price_unit=sku.price_unit,
        low_stock_threshold=sku.low_stock_threshold,
        is_active=sku.is_active,
    )


async def list_skus(
    ctx: AuthContext,
    *,
    fabric_id: int | None = None,
    color_id: int | None = None,
    pattern_id: int | None = None,
    no_price: bool = False,
    include_inactive: bool = False,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> SkuPage:
    conditions = []
    if fabric_id is not None:
        conditions.append(Sku.fabric_id == fabric_id)
    if color_id is not None:
        conditions.append(Sku.color_id == color_id)
    if pattern_id is not None:
        conditions.append(Sku.pattern_id == pattern_id)
    if no_price:
        conditions.append(Sku.price.is_(None))
    if not include_inactive:
        conditions.append(Sku.is_active)
    if search and search.strip():
        like = _like(search)
        conditions.append(
            or_(
                *(
                    column.ilike(like, escape="\\")
                    for column in (
                        Fabric.code, Fabric.name, Color.code, Color.name, Pattern.code, Pattern.name,
                    )
                )
            )
        )  # fmt: skip
    rows = (
        await ctx.db.execute(
            _SKU_ROWS.where(*conditions)
            .order_by(
                func.lower(Fabric.code),
                func.lower(Color.code),
                Pattern.is_plain.desc(),
                func.lower(Pattern.code),
            )
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = await ctx.db.scalar(
        select(func.count()).select_from(_SKU_ROWS.where(*conditions).subquery())
    )
    return SkuPage(items=[sku_out(*row) for row in rows], total=total or 0)


async def _active_ids(ctx: AuthContext, model: type[Color] | type[Pattern], ids: list[int]) -> bool:
    found = (
        await ctx.db.scalars(select(model.id).where(model.id.in_(ids), model.is_active))
    ).all()
    return set(found) == set(ids)


async def create_skus(ctx: AuthContext, body: SkuCreate) -> SkuCreated:
    """Bitta mato uchun tanlangan ranglar × gullar kombinatsiyalarini yaratadi; borlari o'tkazib yuboriladi."""
    fabric = await ctx.db.get(Fabric, body.fabric_id)
    if fabric is None or not fabric.is_active:
        raise _field_error("fabric_id", "invalid")
    color_ids = sorted(set(body.color_ids))
    if not await _active_ids(ctx, Color, color_ids):
        raise _field_error("color_ids", "invalid")
    pattern_ids = sorted(set(body.pattern_ids))
    if not pattern_ids:
        pattern_ids = [(await plain_pattern(ctx)).id]
    elif not await _active_ids(ctx, Pattern, pattern_ids):
        raise _field_error("pattern_ids", "invalid")
    if len(color_ids) * len(pattern_ids) > MAX_SKUS_PER_REQUEST:
        raise AppError(422, "too_many_skus", limit=MAX_SKUS_PER_REQUEST)

    rows = [
        {
            "business_id": ctx.business.id,
            "fabric_id": fabric.id,
            "color_id": color_id,
            "pattern_id": pattern_id,
        }
        for color_id in color_ids
        for pattern_id in pattern_ids
    ]
    created = len(
        (
            await ctx.db.execute(
                pg_insert(Sku)
                .values(rows)
                .on_conflict_do_nothing(
                    index_elements=["business_id", "fabric_id", "color_id", "pattern_id"]
                )
                .returning(Sku.id)
            )
        ).all()
    )
    if created:
        _log(ctx, "sku.created", name=_label(fabric), count=created)
    return SkuCreated(created=created, existing=len(rows) - created)


async def _sku_row(ctx: AuthContext, sku_id: int) -> tuple[Sku, Fabric, Color, Pattern]:
    row = (await ctx.db.execute(_SKU_ROWS.where(Sku.id == sku_id))).first()
    if row is None:
        raise AppError(404, "sku_not_found")
    return row[0], row[1], row[2], row[3]


async def get_sku(ctx: AuthContext, sku_id: int) -> SkuCard:
    sku, fabric, color, pattern = await _sku_row(ctx, sku_id)
    history = (
        await ctx.db.execute(
            select(SkuPriceHistory, User.full_name)
            .outerjoin(User, User.id == SkuPriceHistory.user_id)
            .where(SkuPriceHistory.sku_id == sku.id)
            .order_by(SkuPriceHistory.created_at.desc(), SkuPriceHistory.id.desc())
            .limit(HISTORY_LIMIT)
        )
    ).all()
    return SkuCard(
        **sku_out(sku, fabric, color, pattern).model_dump(),
        low_stock_default=ctx.business.low_stock_default,
        history=[
            PriceChange(
                created_at=change.created_at,
                old_price=change.old_price,
                old_price_unit=change.old_price_unit,
                new_price=change.new_price,
                price_unit=change.price_unit,
                user_name=user_name,
            )
            for change, user_name in history
        ],
    )


def _change_price(ctx: AuthContext, sku: Sku, price: int | None, unit: str) -> bool:
    """Tavsiya narxni o'zgartiradi va tarixga yozadi. O'zgarish bo'lmasa — False."""
    if price is None and sku.price is None:
        sku.price_unit = unit  # narx yo'q — birlikning o'zi tarixga yozilmaydi
        return False
    if price == sku.price and unit == sku.price_unit:
        return False
    ctx.db.add(
        SkuPriceHistory(
            business_id=ctx.business.id,
            sku_id=sku.id,
            old_price=sku.price,
            old_price_unit=sku.price_unit if sku.price is not None else None,
            new_price=price,
            price_unit=unit,
            user_id=ctx.user.id,
        )
    )
    sku.price, sku.price_unit = price, unit
    return True


def set_price(
    ctx: AuthContext,
    sku: Sku,
    fabric: Fabric,
    color: Color,
    pattern: Pattern,
    price: int | None,
    unit: str,
) -> bool:
    """Bitta SKU'ning tavsiya narxini o'zgartiradi: tarix + jurnal ("Narx"). Katalog va kirim shuni chaqiradi."""
    old_price, old_unit = sku.price, sku.price_unit
    if not _change_price(ctx, sku, price, unit):
        return False
    _log(
        ctx,
        "sku.price_changed",
        "price",
        name=sku_code(fabric, color, pattern),
        old_price=old_price,
        old_unit=old_unit if old_price is not None else None,
        new_price=sku.price,
        new_unit=sku.price_unit,
    )
    return True


async def update_sku(ctx: AuthContext, sku_id: int, body: SkuUpdate) -> None:
    sku, fabric, color, pattern = await _sku_row(ctx, sku_id)
    set_price(ctx, sku, fabric, color, pattern, body.price, body.price_unit)
    sku.low_stock_threshold = body.low_stock_threshold


async def ensure_sku(
    ctx: AuthContext, fabric_id: int, color_id: int, pattern_id: int | None
) -> tuple[Sku, Fabric, Color, Pattern]:
    """Kirim uchun: mato + rang + gul bo'yicha SKU'ni topadi, bo'lmasa yaratadi.

    Faolsiz mato, rang, gul yoki SKU yangi kirimda tanlanmaydi. Gul berilmasa — "gulsiz".
    """
    fabric = await ctx.db.get(Fabric, fabric_id)
    if fabric is None or not fabric.is_active:
        raise _field_error("fabric_id", "invalid")
    color = await ctx.db.get(Color, color_id)
    if color is None or not color.is_active:
        raise _field_error("color_id", "invalid")
    pattern = await plain_pattern(ctx) if pattern_id is None else await ctx.db.get(Pattern, pattern_id)
    if pattern is None or not pattern.is_active:
        raise _field_error("pattern_id", "invalid")

    key = {"fabric_id": fabric.id, "color_id": color.id, "pattern_id": pattern.id}
    await ctx.db.execute(
        pg_insert(Sku).values(business_id=ctx.business.id, **key).on_conflict_do_nothing()
    )
    sku = (await ctx.db.scalars(select(Sku).filter_by(**key))).one()
    if not sku.is_active:
        raise AppError(409, "sku_inactive", sku=sku_code(fabric, color, pattern))
    return sku, fabric, color, pattern


async def bulk_price(ctx: AuthContext, body: BulkPriceIn) -> int:
    """Tanlangan SKU'larga bitta narx qo'yadi. Nechtasi o'zgarganini qaytaradi."""
    ids = sorted(set(body.sku_ids))
    rows = (await ctx.db.execute(_SKU_ROWS.where(Sku.id.in_(ids)))).all()
    if len(rows) != len(ids):  # begona yoki yo'q SKU
        raise AppError(404, "sku_not_found")
    changed = sum(_change_price(ctx, row[0], body.price, body.price_unit) for row in rows)
    if changed:
        fabrics = {row[1].code for row in rows}
        _log(
            ctx,
            "sku.price_bulk",
            "price",
            # Hammasi bitta matoniki bo'lsa, jurnalda mato kodi ko'rinadi
            name=fabrics.pop() if len(fabrics) == 1 else None,
            count=changed,
            new_price=body.price,
            new_unit=body.price_unit,
        )
    return changed


async def set_sku_active(ctx: AuthContext, sku_id: int, active: bool) -> None:
    """Faolsiz SKU yangi kirimda tanlanmaydi, lekin qoldig'i sotilaveradi."""
    sku, fabric, color, pattern = await _sku_row(ctx, sku_id)
    if sku.is_active == active:
        return
    sku.is_active = active
    _log(
        ctx,
        "sku.activated" if active else "sku.deactivated",
        name=sku_code(fabric, color, pattern),
    )
