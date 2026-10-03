"""Platforma egasi: ikki bosqichli kirish (/api/auth/2fa/...) va bizneslar paneli (/api/platform/...)."""
from typing import Literal

from fastapi import APIRouter, Response

from app.core.config import get_settings
from app.core.deps import PlatformAuth
from app.core.errors import AppError
from app.modules.auth.router import respond_with_session
from app.modules.auth.schemas import AuthOut
from app.modules.platform import service, two_factor
from app.modules.platform.schemas import (
    BusinessCreatedOut,
    BusinessCreateIn,
    BusinessDetail,
    BusinessNameIn,
    BusinessRow,
    ChallengeIn,
    CodeIn,
    OwnerOut,
    OwnerPasswordOut,
    OwnerPhoneIn,
    PrimaryOwnerIn,
    ProfileCodeIn,
    ReasonIn,
    RecoveryCodesOut,
    TempPasswordOut,
    TwoFactorConfirmedOut,
    TwoFactorSetupOut,
    TwoFactorStatusOut,
)

two_factor_router = APIRouter(prefix="/auth/2fa", tags=["kirish"])
platform_router = APIRouter(prefix="/platform", tags=["platforma"])

# ---------- Ikki bosqichli tasdiqlash ----------


@two_factor_router.post("/setup")
async def begin_setup(body: ChallengeIn) -> TwoFactorSetupOut:
    """Tasdiqlash ilovasini ulashni boshlaydi: QR kod va qo'lda kiritiladigan kalit."""
    secret, uri = await two_factor.begin_setup(body.challenge_token)
    return TwoFactorSetupOut(secret=secret, otpauth_uri=uri)


@two_factor_router.post("/confirm")
async def confirm_setup(body: CodeIn, response: Response) -> TwoFactorConfirmedOut:
    """Ilovadagi birinchi kod bilan ulashni yakunlaydi; zaxira kodlar faqat shu yerda ko'rsatiladi."""
    issued, codes = await two_factor.confirm_setup(body.challenge_token, body.code)
    session = respond_with_session(response, issued)
    return TwoFactorConfirmedOut(**session.model_dump(), recovery_codes=codes)


@two_factor_router.post("/verify")
async def verify(body: CodeIn, response: Response) -> AuthOut:
    return respond_with_session(response, await two_factor.verify(body.challenge_token, body.code))


# ---------- Ikki bosqichli tasdiqlash: profildan yoqish / o'chirish ----------


@platform_router.get("/2fa")
async def two_factor_status(ctx: PlatformAuth) -> TwoFactorStatusOut:
    enabled, left = await two_factor.status(ctx.db, ctx.user)
    return TwoFactorStatusOut(
        enabled=enabled, recovery_left=left, required=get_settings().platform_2fa_required
    )


@platform_router.post("/2fa/setup")
async def two_factor_profile_setup(ctx: PlatformAuth) -> TwoFactorSetupOut:
    secret, uri = await two_factor.profile_setup(ctx.user)
    return TwoFactorSetupOut(secret=secret, otpauth_uri=uri)


@platform_router.post("/2fa/enable")
async def two_factor_enable(ctx: PlatformAuth, body: ProfileCodeIn) -> RecoveryCodesOut:
    """Ilovadagi birinchi kod bilan yoqadi; zaxira kodlar faqat shu javobda ko'rsatiladi."""
    return RecoveryCodesOut(recovery_codes=await two_factor.profile_enable(ctx.db, ctx.user, body.code))


@platform_router.post("/2fa/disable", status_code=204)
async def two_factor_disable(ctx: PlatformAuth, body: ProfileCodeIn) -> None:
    if get_settings().platform_2fa_required:
        raise AppError(403, "two_factor_required")
    await two_factor.profile_disable(ctx.db, ctx.user, body.code)


# ---------- Bizneslar ----------


@platform_router.get("/businesses")
async def list_businesses(
    ctx: PlatformAuth,
    search: str | None = None,
    status: Literal["active", "blocked"] | None = None,
    sort: Literal["created_at", "last_activity_at"] = "created_at",
) -> list[BusinessRow]:
    return await service.list_businesses(ctx.db, search=search, status=status, sort=sort)


@platform_router.post("/businesses", status_code=201)
async def create_business(body: BusinessCreateIn, ctx: PlatformAuth) -> BusinessCreatedOut:
    business, phone, temp_password = await service.create_business(
        ctx, body.name, body.owner_full_name, body.owner_phone
    )
    return BusinessCreatedOut(
        id=business.id, name=business.name, owner_phone=phone, temp_password=temp_password
    )


@platform_router.get("/businesses/{business_id}")
async def get_business(business_id: int, ctx: PlatformAuth) -> BusinessDetail:
    return await service.get_business(ctx.db, business_id)


@platform_router.post("/businesses/{business_id}/block", status_code=204)
async def block_business(business_id: int, body: ReasonIn, ctx: PlatformAuth) -> None:
    await service.set_blocked(ctx, business_id, blocked=True, reason=body.reason)


@platform_router.post("/businesses/{business_id}/unblock", status_code=204)
async def unblock_business(business_id: int, body: ReasonIn, ctx: PlatformAuth) -> None:
    await service.set_blocked(ctx, business_id, blocked=False, reason=body.reason)


@platform_router.post("/businesses/{business_id}/primary-owner", status_code=204)
async def change_primary_owner(business_id: int, body: PrimaryOwnerIn, ctx: PlatformAuth) -> None:
    await service.change_primary_owner(ctx, business_id, body.user_id, body.reason)


@platform_router.post("/businesses/{business_id}/owners/{user_id}/reset-password")
async def reset_owner_password(business_id: int, user_id: int, ctx: PlatformAuth) -> TempPasswordOut:
    return TempPasswordOut(
        temp_password=await service.reset_owner_password(ctx, business_id, user_id)
    )


@platform_router.post("/businesses/{business_id}/owners/{user_id}/reveal-password")
async def reveal_owner_password(
    business_id: int, user_id: int, ctx: PlatformAuth
) -> OwnerPasswordOut:
    """Biznes egasining hozirgi paroli. POST — chunki har ko'rish biznes jurnaliga yoziladi."""
    return OwnerPasswordOut(
        password=await service.reveal_owner_password(ctx, business_id, user_id)
    )


@platform_router.patch("/businesses/{business_id}", status_code=204)
async def rename_business(business_id: int, body: BusinessNameIn, ctx: PlatformAuth) -> None:
    """Biznes nomini o'zgartirish (biznes jurnaliga yoziladi)."""
    await service.rename_business(ctx, business_id, body.name)


@platform_router.patch("/businesses/{business_id}/owners/{user_id}")
async def update_owner(
    business_id: int, user_id: int, body: OwnerPhoneIn, ctx: PlatformAuth
) -> OwnerOut:
    """Biznes egasining telefoni o'zgarganda (u shu raqam bilan kiradi)."""
    owner = await service.update_owner_phone(ctx, business_id, user_id, body.phone)
    return OwnerOut.model_validate(owner)
