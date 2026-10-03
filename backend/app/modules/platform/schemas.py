"""Platforma paneli API'sining shakllari."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.modules.auth.schemas import AuthOut

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]

# ---------- Ikki bosqichli tasdiqlash ----------


class ChallengeIn(BaseModel):
    challenge_token: str


class CodeIn(ChallengeIn):
    # Tasdiqlash ilovasidagi 6 xonali kod yoki zaxira kod ("abcd-efgh")
    code: str = Field(min_length=6, max_length=20)


class TwoFactorSetupOut(BaseModel):
    secret: str  # qo'lda kiritish uchun
    otpauth_uri: str  # QR kod uchun


class TwoFactorConfirmedOut(AuthOut):
    recovery_codes: list[str]  # faqat bir marta ko'rsatiladi


# ---------- Bizneslar ----------


class OwnerBrief(BaseModel):
    full_name: str
    phone: str | None


class BusinessRow(BaseModel):
    id: int
    name: str
    status: Literal["active", "blocked"]
    created_at: datetime
    last_activity_at: datetime | None
    stores_count: int
    staff_count: int
    owner: OwnerBrief | None  # asosiy ega


class OwnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str | None
    is_primary_owner: bool
    is_active: bool


class StatusEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: Literal["block", "unblock", "owner_change"]
    reason: str
    created_at: datetime


class BusinessDetail(BusinessRow):
    owners: list[OwnerOut]
    events: list[StatusEventOut]  # bloklash va egani almashtirish tarixi, eng yangisi birinchi


class BusinessCreateIn(BaseModel):
    name: Name
    owner_full_name: Name
    owner_phone: str = Field(max_length=32)


class BusinessCreatedOut(BaseModel):
    id: int
    name: str
    owner_phone: str
    temp_password: str  # faqat bir marta ko'rsatiladi; egasi birinchi kirishda almashtiradi


class ReasonIn(BaseModel):
    reason: Reason


class PrimaryOwnerIn(BaseModel):
    user_id: int
    reason: Reason


class OwnerPhoneIn(BaseModel):
    phone: str = Field(max_length=32)


class TempPasswordOut(BaseModel):
    temp_password: str


class OwnerPasswordOut(BaseModel):
    """Platforma egasi ko'rishi uchun biznes egasining paroli. Saqlanmagan bo'lsa — None."""

    password: str | None
