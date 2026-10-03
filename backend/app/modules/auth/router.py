"""Kirish API'si: /api/auth/... va do'kon qurilmalari: /api/devices/..."""
from typing import Annotated

from fastapi import APIRouter, Cookie, Response

from app.core.audit import log_event
from app.core.config import get_settings
from app.core.deps import AuthBasic, OwnerAuth
from app.core.errors import AppError
from app.modules.auth import device_service, service
from app.modules.auth.schemas import (
    AuthOut,
    BusinessOut,
    ChangePasswordIn,
    DeviceBindIn,
    DeviceOut,
    DeviceStatusOut,
    LoginIn,
    MeOut,
    MeUpdateIn,
    PinIn,
    StoreLoginIn,
    StoreOut,
    TwoFactorOut,
    UserOut,
)

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["kirish"])
devices_router = APIRouter(prefix="/devices", tags=["do'kon qurilmalari"])

# Uzoq muddatli tokenlar faqat httpOnly cookie'da — sahifadagi JavaScript ularni o'qiy olmaydi.
# Qisqa muddatli token (access) javobda qaytadi va brauzer xotirasida turadi.
REFRESH_COOKIE = "mato_refresh"  # foydalanuvchi sessiyasi
DEVICE_COOKIE = "mato_device"  # "bu brauzer — falon do'konning qurilmasi"
# Cookie faqat kerakli yo'llarga yuboriladi: sessiya — /api/auth, qurilma — /api/auth va /api/devices
_COOKIE_PATHS = {REFRESH_COOKIE: "/api/auth", DEVICE_COOKIE: "/api"}
_DEVICE_COOKIE_MAX_AGE = 5 * 365 * 86400  # uzilmaguncha amal qiladi

RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]
DeviceCookie = Annotated[str | None, Cookie(alias=DEVICE_COOKIE)]


def _set_cookie(response: Response, name: str, token: str, max_age: int) -> None:
    response.set_cookie(
        name,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.app_env != "dev",
        samesite="strict",
        path=_COOKIE_PATHS[name],
    )


def _delete_cookie(response: Response, name: str) -> None:
    response.delete_cookie(name, path=_COOKIE_PATHS[name])


def _auth_out(issued: service.Issued) -> AuthOut:
    return AuthOut(
        access_token=issued.access_token,
        expires_in=settings.access_token_minutes * 60,
        user=UserOut.model_validate(issued.user),
        business=BusinessOut.model_validate(issued.business) if issued.business else None,
        store=StoreOut.model_validate(issued.store) if issued.store else None,
    )


def respond_with_session(response: Response, issued: service.Issued) -> AuthOut:
    """Sessiya cookie'sini qo'yadi va javobni tayyorlaydi (platforma kirishi ham shundan foydalanadi)."""
    _set_cookie(response, REFRESH_COOKIE, issued.refresh_token, issued.refresh_max_age)
    return _auth_out(issued)


_respond = respond_with_session


# ---------- Kirish va sessiya ----------


@router.post("/login")
async def login(body: LoginIn, response: Response) -> AuthOut | TwoFactorOut:
    result = await service.login(body.phone, body.password)
    if isinstance(result, service.TwoFactorChallenge):
        return TwoFactorOut(
            two_factor="setup" if result.setup_required else "required",
            challenge_token=result.token,
        )
    return _respond(response, result)


@router.post("/pin")
async def pin_login(body: PinIn, response: Response, device: DeviceCookie = None) -> AuthOut:
    """Do'kon qurilmasida sotuvchining 4 xonali PIN bilan kirishi."""
    return _respond(response, await device_service.pin_login(device, body.pin))


@router.post("/store-login")
async def store_login(
    body: StoreLoginIn, response: Response, previous: DeviceCookie = None
) -> DeviceStatusOut:
    """Do'kon logini bilan SHU brauzerni do'kon qurilmasiga aylantiradi — keyin PIN ekrani ochiladi.

    Sessiya ochilmaydi: login faqat qurilmani bog'laydi, ma'lumotlarga sotuvchi PIN bilan kiradi.
    """
    device, store, business, token = await device_service.store_login(
        body.login, body.password, previous
    )
    _set_cookie(response, DEVICE_COOKIE, token, _DEVICE_COOKIE_MAX_AGE)
    _delete_cookie(response, REFRESH_COOKIE)  # shu brauzerda kimdir kirgan bo'lsa — chiqariladi
    return DeviceStatusOut(
        bound=True,
        device_name=device.name,
        store=StoreOut.model_validate(store),
        business=BusinessOut.model_validate(business),
    )


@router.post("/refresh")
async def refresh(response: Response, token: RefreshCookie = None) -> AuthOut:
    return _respond(response, await service.refresh(token))


@router.post("/logout", status_code=204)
async def logout(response: Response, token: RefreshCookie = None) -> None:
    """Chiqish; do'kon qurilmasida — qulflash (qurilma bog'langanicha qoladi)."""
    await service.logout(token)
    _delete_cookie(response, REFRESH_COOKIE)


@router.get("/device")
async def device_status(response: Response, device: DeviceCookie = None) -> DeviceStatusOut:
    """Bu brauzer do'kon qurilmasimi — interfeys PIN ekranini ko'rsatish-ko'rsatmaslikni shundan biladi."""
    found = await device_service.device_status(device)
    if found is None:
        if device:  # qurilma uzilgan — eskirgan cookie tozalanadi
            _delete_cookie(response, DEVICE_COOKIE)
        return DeviceStatusOut(bound=False)
    row, store, business = found
    return DeviceStatusOut(
        bound=True,
        device_name=row.name,
        store=StoreOut.model_validate(store),
        business=BusinessOut.model_validate(business),
    )


# ---------- Profil ----------


@router.get("/me")
async def me(ctx: AuthBasic) -> MeOut:
    return MeOut(
        user=UserOut.model_validate(ctx.user),
        business=BusinessOut.model_validate(ctx.business),
        store=StoreOut.model_validate(ctx.store) if ctx.store else None,
    )


@router.patch("/me")
async def update_me(body: MeUpdateIn, ctx: AuthBasic) -> UserOut:
    """O'z profilini o'zgartirish: til va (sotuvchidan boshqa) o'z ismi. Faqat berilgan maydonlar o'zgaradi."""
    if body.language is not None:
        ctx.user.language = body.language
    if body.full_name is not None and body.full_name != ctx.user.full_name:
        # Sotuvchining ismini ega boshqaradi (PIN bilan kiradi, profil sahifasi yo'q)
        if ctx.user.role == "seller":
            raise AppError(403, "forbidden")
        log_event(
            ctx.db,
            business_id=ctx.user.business_id,
            user_id=ctx.user.id,
            category="staff",
            event_code="user.name_changed",
            data={"old": ctx.user.full_name, "new": body.full_name},
        )
        ctx.user.full_name = body.full_name
    return UserOut.model_validate(ctx.user)


@router.post("/me/password", status_code=204)
async def change_password(body: ChangePasswordIn, ctx: AuthBasic) -> None:
    await service.change_password(
        ctx.db, ctx.user, ctx.session_id, body.old_password, body.new_password
    )


# ---------- Do'kon qurilmalari (faqat biznes egasi) ----------


def _device_out(device, store) -> DeviceOut:
    return DeviceOut(
        id=device.id,
        name=device.name,
        store=StoreOut.model_validate(store),
        created_at=device.created_at,
        last_seen_at=device.last_seen_at,
    )


@devices_router.get("")
async def list_devices(ctx: OwnerAuth) -> list[DeviceOut]:
    return [_device_out(device, store) for device, store in await device_service.list_devices(ctx)]


@devices_router.post("", status_code=201)
async def bind_device(
    body: DeviceBindIn, response: Response, ctx: OwnerAuth, previous: DeviceCookie = None
) -> DeviceOut:
    """SHU brauzerni do'konga bog'laydi. Egasining sessiyasi bu qurilmada tugaydi — keyin faqat PIN."""
    device, store, token = await device_service.bind_device(ctx, body.store_id, body.name, previous)
    _set_cookie(response, DEVICE_COOKIE, token, _DEVICE_COOKIE_MAX_AGE)
    _delete_cookie(response, REFRESH_COOKIE)
    return _device_out(device, store)


@devices_router.post("/{device_id}/revoke", status_code=204)
async def revoke_device(device_id: int, ctx: OwnerAuth) -> None:
    """Qurilmani uzadi (masalan, yo'qolganda) — u darhol ishlamay qoladi."""
    await device_service.revoke_device(ctx, device_id)
