"""Tuzilma API'si: do'konlar va skladlar (/api/locations), xodimlar (/api/users). Faqat biznes egalari."""
from typing import Literal

from fastapi import APIRouter

from app.core.deps import OwnerAuth
from app.modules.auth.schemas import PinIn
from app.modules.structure import service
from app.modules.structure.schemas import (
    LocationCreate,
    LocationOut,
    LocationUpdate,
    PasswordIn,
    StaffCreate,
    StaffOut,
    StaffSecretOut,
    StaffUpdate,
    StoreAccessIn,
    StoreSecretOut,
)

router = APIRouter(tags=["tuzilma"])

# ---------- Do'konlar va skladlar ----------


@router.get("/locations")
async def list_locations(
    ctx: OwnerAuth,
    type: Literal["store", "warehouse"] | None = None,
    include_inactive: bool = False,
) -> list[LocationOut]:
    return await service.list_locations(ctx, type, include_inactive)


@router.post("/locations", status_code=201)
async def create_location(body: LocationCreate, ctx: OwnerAuth) -> dict[str, int]:
    return {"id": (await service.create_location(ctx, body)).id}


@router.patch("/locations/{location_id}", status_code=204)
async def update_location(location_id: int, body: LocationUpdate, ctx: OwnerAuth) -> None:
    await service.update_location(ctx, location_id, body)


@router.post("/locations/{location_id}/deactivate", status_code=204)
async def deactivate_location(location_id: int, ctx: OwnerAuth) -> None:
    """Joy o'chirilmaydi — faolsizlantiriladi. Do'kon bo'lsa, qurilmalari uziladi."""
    await service.set_location_active(ctx, location_id, False)


@router.post("/locations/{location_id}/activate", status_code=204)
async def activate_location(location_id: int, ctx: OwnerAuth) -> None:
    await service.set_location_active(ctx, location_id, True)


@router.put("/locations/{location_id}/access", status_code=204)
async def set_store_access(location_id: int, body: StoreAccessIn, ctx: OwnerAuth) -> None:
    """Do'kon logini va paroli — do'kon qurilmasi shu bilan ochiladi, keyin sotuvchilar PIN bilan kiradi."""
    await service.set_store_access(ctx, location_id, body)


@router.delete("/locations/{location_id}/access", status_code=204)
async def clear_store_access(location_id: int, ctx: OwnerAuth) -> None:
    await service.clear_store_access(ctx, location_id)


@router.post("/locations/{location_id}/access/reveal")
async def reveal_store_password(location_id: int, ctx: OwnerAuth) -> StoreSecretOut:
    """Do'kon parolini ko'rsatadi (jurnalga yoziladi)."""
    return await service.reveal_store_password(ctx, location_id)


# ---------- Xodimlar ----------


@router.get("/users")
async def list_staff(ctx: OwnerAuth) -> list[StaffOut]:
    """Biznesning barcha xodimlari (faolsizlari ham — ular jurnalda uchraydi)."""
    return await service.list_staff(ctx)


@router.post("/users", status_code=201)
async def create_staff(body: StaffCreate, ctx: OwnerAuth) -> StaffOut:
    return await service.create_staff(ctx, body)


@router.patch("/users/{user_id}")
async def update_staff(user_id: int, body: StaffUpdate, ctx: OwnerAuth) -> StaffOut:
    return await service.update_staff(ctx, user_id, body)


@router.post("/users/{user_id}/password", status_code=204)
async def reset_password(user_id: int, body: PasswordIn, ctx: OwnerAuth) -> None:
    """Xodim parolini unutganda: ega yangi parol qo'yadi, xodim birinchi kirishda almashtiradi."""
    await service.reset_password(ctx, user_id, body.password)


@router.post("/users/{user_id}/reveal")
async def reveal_secret(user_id: int, ctx: OwnerAuth) -> StaffSecretOut:
    """Xodimning parolini yoki PIN'ini ko'rsatadi. POST — chunki har ko'rish jurnalga yoziladi."""
    return await service.reveal_secret(ctx, user_id)


@router.post("/users/{user_id}/pin", status_code=204)
async def set_pin(user_id: int, body: PinIn, ctx: OwnerAuth) -> None:
    await service.set_pin(ctx, user_id, body.pin)


@router.post("/users/{user_id}/deactivate", status_code=204)
async def deactivate_staff(user_id: int, ctx: OwnerAuth) -> None:
    await service.set_staff_active(ctx, user_id, False)


@router.post("/users/{user_id}/activate", status_code=204)
async def activate_staff(user_id: int, ctx: OwnerAuth) -> None:
    await service.set_staff_active(ctx, user_id, True)
