"""Tuzilma API'sining shakllari: do'konlar, skladlar, xodimlar."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Address = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]

# ---------- Joylar ----------


class LocationCreate(BaseModel):
    type: Literal["store", "warehouse"]
    name: Name
    address: Address | None = None
    phone: str | None = Field(default=None, max_length=32)  # faqat do'konda


class LocationUpdate(BaseModel):
    name: Name
    address: Address | None = None
    phone: str | None = Field(default=None, max_length=32)


class LocationOut(BaseModel):
    id: int
    type: Literal["store", "warehouse"]
    name: str
    address: str | None
    phone: str | None
    is_active: bool
    devices_count: int  # do'konga bog'langan qurilmalar
    staff: list[str]  # shu joyga biriktirilgan faol xodimlar: do'konda — sotuvchilar, skladda — omborchilar


# ---------- Xodimlar ----------

StaffRole = Literal["owner", "warehouse", "seller"]


class StaffCreate(BaseModel):
    full_name: Name
    role: StaffRole
    phone: str | None = Field(default=None, max_length=32)  # sherik-ega va omborchi uchun majburiy
    password: str | None = Field(default=None, min_length=6, max_length=128)
    pin: str | None = Field(default=None, pattern=r"^\d{4}$")  # sotuvchi uchun majburiy
    all_locations: bool = False
    location_ids: list[int] = []


class StaffUpdate(BaseModel):
    full_name: Name
    phone: str | None = Field(default=None, max_length=32)
    all_locations: bool = False
    location_ids: list[int] = []


class PasswordIn(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class StaffSecretOut(BaseModel):
    """Ega ko'rishi uchun xodimning paroli yoki PIN'i. Saqlanmagan bo'lsa — None."""

    password: str | None
    pin: str | None


class StaffOut(BaseModel):
    id: int
    full_name: str
    role: StaffRole
    phone: str | None
    is_primary_owner: bool
    is_active: bool
    all_locations: bool
    location_ids: list[int]
    has_pin: bool
