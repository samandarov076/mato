"""Katalog API'si (/api/catalog/...): matolar, ranglar, gullar, SKU va tavsiya narx.

Ko'rish va o'zgartirish — biznes egalari va omborchi. Sotuvchi katalogni faqat sotuv ekrani orqali
ko'radi (06-sales).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import AuthContext, require_roles
from app.modules.catalog import service
from app.modules.catalog.schemas import (
    AttributeIn,
    AttributeOut,
    BulkPriceIn,
    FabricIn,
    FabricOut,
    SkuCard,
    SkuCreate,
    SkuCreated,
    SkuPage,
    SkuUpdate,
)

router = APIRouter(prefix="/catalog", tags=["katalog"])

CatalogAuth = Annotated[AuthContext, Depends(require_roles("owner", "warehouse"))]

# ---------- Matolar ----------


@router.get("/fabrics")
async def list_fabrics(
    ctx: CatalogAuth, search: str | None = None, include_inactive: bool = False
) -> list[FabricOut]:
    return await service.list_fabrics(ctx, search, include_inactive)


@router.post("/fabrics", status_code=201)
async def create_fabric(body: FabricIn, ctx: CatalogAuth) -> dict[str, int]:
    return {"id": (await service.create_fabric(ctx, body)).id}


@router.patch("/fabrics/{fabric_id}", status_code=204)
async def update_fabric(fabric_id: int, body: FabricIn, ctx: CatalogAuth) -> None:
    await service.update_fabric(ctx, fabric_id, body)


@router.post("/fabrics/{fabric_id}/deactivate", status_code=204)
async def deactivate_fabric(fabric_id: int, ctx: CatalogAuth) -> None:
    await service.set_fabric_active(ctx, fabric_id, False)


@router.post("/fabrics/{fabric_id}/activate", status_code=204)
async def activate_fabric(fabric_id: int, ctx: CatalogAuth) -> None:
    await service.set_fabric_active(ctx, fabric_id, True)


# ---------- Ranglar va gullar (bir xil amallar, ikki ro'yxat) ----------


def _attribute_routes(kind: service.Kind) -> None:
    @router.get(f"/{kind}", name=f"list_{kind}")
    async def list_attributes(
        ctx: CatalogAuth, search: str | None = None, include_inactive: bool = False
    ) -> list[AttributeOut]:
        return await service.list_attributes(ctx, kind, search, include_inactive)

    @router.post(f"/{kind}", status_code=201, name=f"create_{kind}")
    async def create_attribute(body: AttributeIn, ctx: CatalogAuth) -> dict[str, int]:
        return {"id": (await service.create_attribute(ctx, kind, body)).id}

    @router.patch(f"/{kind}/{{attribute_id}}", status_code=204, name=f"update_{kind}")
    async def update_attribute(attribute_id: int, body: AttributeIn, ctx: CatalogAuth) -> None:
        await service.update_attribute(ctx, kind, attribute_id, body)

    @router.post(f"/{kind}/{{attribute_id}}/deactivate", status_code=204, name=f"deactivate_{kind}")
    async def deactivate_attribute(attribute_id: int, ctx: CatalogAuth) -> None:
        await service.set_attribute_active(ctx, kind, attribute_id, False)

    @router.post(f"/{kind}/{{attribute_id}}/activate", status_code=204, name=f"activate_{kind}")
    async def activate_attribute(attribute_id: int, ctx: CatalogAuth) -> None:
        await service.set_attribute_active(ctx, kind, attribute_id, True)


_attribute_routes("colors")
_attribute_routes("patterns")


# ---------- SKU ----------


@router.get("/skus")
async def list_skus(
    ctx: CatalogAuth,
    fabric_id: int | None = None,
    color_id: int | None = None,
    pattern_id: int | None = None,
    no_price: bool = False,
    include_inactive: bool = False,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SkuPage:
    return await service.list_skus(
        ctx,
        fabric_id=fabric_id,
        color_id=color_id,
        pattern_id=pattern_id,
        no_price=no_price,
        include_inactive=include_inactive,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.post("/skus", status_code=201)
async def create_skus(body: SkuCreate, ctx: CatalogAuth) -> SkuCreated:
    """Odatda SKU kirimda o'zi yaratiladi; bu yerda narxni oldindan qo'yish uchun qo'lda ham qo'shiladi."""
    return await service.create_skus(ctx, body)


@router.post("/skus/price")
async def bulk_price(body: BulkPriceIn, ctx: CatalogAuth) -> dict[str, int]:
    """Ommaviy narx: tanlangan SKU'larga bitta tavsiya narx."""
    return {"changed": await service.bulk_price(ctx, body)}


@router.get("/skus/{sku_id}")
async def get_sku(sku_id: int, ctx: CatalogAuth) -> SkuCard:
    return await service.get_sku(ctx, sku_id)


@router.patch("/skus/{sku_id}", status_code=204)
async def update_sku(sku_id: int, body: SkuUpdate, ctx: CatalogAuth) -> None:
    await service.update_sku(ctx, sku_id, body)


@router.post("/skus/{sku_id}/deactivate", status_code=204)
async def deactivate_sku(sku_id: int, ctx: CatalogAuth) -> None:
    await service.set_sku_active(ctx, sku_id, False)


@router.post("/skus/{sku_id}/activate", status_code=204)
async def activate_sku(sku_id: int, ctx: CatalogAuth) -> None:
    await service.set_sku_active(ctx, sku_id, True)
