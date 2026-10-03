"""Kirish API'sining so'rov va javob shakllari."""
import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

_PHONE_RE = re.compile(r"^\+998\d{9}$")


def normalize_phone(value: str) -> str | None:
    """'+998 90 123 45 67' → '+998901234567'. Format noto'g'ri bo'lsa None."""
    phone = re.sub(r"[\s\-()]", "", value)
    return phone if _PHONE_RE.fullmatch(phone) else None


class LoginIn(BaseModel):
    phone: str = Field(max_length=32)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str | None
    role: Literal["platform_owner", "owner", "warehouse", "seller"]
    is_primary_owner: bool
    language: Literal["uz", "en", "ru"]
    must_change_password: bool


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    autolock_minutes: int  # do'kon qurilmasi shuncha daqiqa harakatsiz tursa qulflanadi


class StoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class MeOut(BaseModel):
    user: UserOut
    business: BusinessOut | None
    store: StoreOut | None = None  # do'kon qurilmasidan kirilgan bo'lsa — qaysi do'kon


class AuthOut(MeOut):
    access_token: str
    expires_in: int  # soniya


class TwoFactorOut(BaseModel):
    """Platforma egasi parolni to'g'ri kiritdi — sessiya o'rniga ikkinchi bosqichga yo'llanma."""

    # required — tasdiqlash ilovasidagi kod so'raladi; setup — ilova hali ulanmagan, avval ulash kerak
    two_factor: Literal["required", "setup"]
    challenge_token: str


class LanguageIn(BaseModel):
    language: Literal["uz", "en", "ru"]


class ChangePasswordIn(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


# ---------- Do'kon qurilmasi ----------


class PinIn(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


class DeviceBindIn(BaseModel):
    store_id: int
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class DeviceOut(BaseModel):
    id: int
    name: str
    store: StoreOut
    created_at: datetime
    last_seen_at: datetime | None


class DeviceStatusOut(BaseModel):
    """Bu brauzer do'kon qurilmasimi. bound=false bo'lsa qolgan maydonlar bo'sh."""

    bound: bool
    device_name: str | None = None
    store: StoreOut | None = None
    business: BusinessOut | None = None
