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
    login: str | None  # do'kon qurilmasini ochadigan login (faqat do'konda; parol qaytmaydi)
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


# Do'kon logini: lotin harf, raqam, nuqta, chiziqcha, pastki chiziq; 3–32 belgi; harf yoki raqamdan
# boshlanadi. Kichik harfda saqlanadi (naqsh kichik harfga o'tkazishdan oldin tekshiriladi)
StoreLogin = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$"
    ),
]


class StoreAccessIn(BaseModel):
    """Do'kon logini va paroli. Parol birinchi o'rnatishda majburiy; keyin bo'sh qolsa — eskisi qoladi."""

    login: StoreLogin
    password: str | None = Field(default=None, min_length=6, max_length=128)


class StoreSecretOut(BaseModel):
    password: str | None  # saqlanmagan bo'lsa None


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
