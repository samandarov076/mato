"""Kirish: telefon + parol, sessiyalar, darhol chiqarish, parolni almashtirish, rol tekshiruvi."""
import asyncio
from typing import Annotated

import httpx
import pyotp
import pytest
from fastapi import APIRouter, Depends
from sqlalchemy import select, update

from app.core import ratelimit
from app.core.db import system_session
from app.core.deps import Auth, AuthContext, require_roles
from app.core.models import AuditLog
from app.core.security import hash_password
from app.main import app
from app.modules.auth.models import User
from app.modules.platform.models import Business
from tests.conftest import PASSWORD, random_phone

# Faqat testlar uchun yo'llar: asosiy himoya va rol tekshiruvini sinash
_test_router = APIRouter(prefix="/api/_test")


@_test_router.get("/any")
async def _any_role(ctx: Auth) -> dict:
    return {"user_id": ctx.user.id}


@_test_router.get("/owner-only")
async def _owner_only(ctx: Annotated[AuthContext, Depends(require_roles("owner"))]) -> dict:
    return {"user_id": ctx.user.id}


app.include_router(_test_router)


async def _login(client: httpx.AsyncClient, phone: str, password: str = PASSWORD) -> httpx.Response:
    return await client.post("/api/auth/login", json={"phone": phone, "password": password})


def _bearer(response: httpx.Response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _events(business_id: int) -> list[str]:
    async with system_session() as s:
        rows = await s.scalars(
            select(AuditLog.event_code)
            .where(AuditLog.business_id == business_id)
            .order_by(AuditLog.id)
        )
        return list(rows)


# ---------- Kirish ----------


async def test_login_returns_token_user_and_business(client, new_account):
    business_id, user_id, phone = await new_account()

    response = await _login(client, phone)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == user_id
    assert body["user"]["role"] == "owner"
    assert body["business"]["id"] == business_id
    assert "password_hash" not in body["user"]
    # Uzoq muddatli token JavaScript'ga ko'rinmaydigan cookie'da
    cookie = response.headers["set-cookie"]
    assert "mato_refresh=" in cookie and "HttpOnly" in cookie and "SameSite=strict" in cookie

    me = await client.get("/api/auth/me", headers=_bearer(response))
    assert me.status_code == 200
    assert me.json()["user"]["phone"] == phone


async def test_login_accepts_phone_with_spaces(client, new_account):
    _, _, phone = await new_account()
    spaced = f"{phone[:4]} {phone[4:6]} {phone[6:9]} {phone[9:11]} {phone[11:]}"

    assert (await _login(client, spaced)).status_code == 200


@pytest.mark.parametrize("case", ["wrong_password", "unknown_phone", "bad_format"])
async def test_login_failure_does_not_reveal_what_was_wrong(client, new_account, case):
    _, _, phone = await new_account()
    attempts = {
        "wrong_password": (phone, "boshqa-parol"),
        "unknown_phone": (random_phone(), PASSWORD),
        "bad_format": ("12345", PASSWORD),
    }

    response = await _login(client, *attempts[case])

    assert response.status_code == 401
    assert response.json() == {"code": "invalid_credentials", "message": "invalid_credentials"}
    assert "set-cookie" not in response.headers


async def test_inactive_user_cannot_log_in(client, new_account):
    _, _, phone = await new_account(is_active=False)

    response = await _login(client, phone)

    assert response.status_code == 403
    assert response.json()["code"] == "account_inactive"
    # Parol noto'g'ri bo'lsa hisob holati oshkor qilinmaydi
    assert (await _login(client, phone, "xato")).json()["code"] == "invalid_credentials"


async def test_blocked_business_cannot_log_in(client, new_account):
    business_id, _, phone = await new_account()
    async with system_session() as s:
        await s.execute(update(Business).where(Business.id == business_id).values(status="blocked"))

    response = await _login(client, phone)

    assert response.status_code == 403
    assert response.json()["code"] == "business_blocked"


async def test_platform_owner_password_alone_does_not_open_a_session(client, new_user):
    phone = random_phone()
    await new_user(
        None,
        role="platform_owner",
        phone=phone,
        password_hash=hash_password(PASSWORD),
        totp_secret=pyotp.random_base32(),  # tasdiqlash ilovasi ulangan
    )

    response = await _login(client, phone)

    # Parol to'g'ri, lekin sessiya yo'q — faqat ikkinchi bosqichga yo'llanma (tests/test_platform.py)
    assert response.status_code == 200
    assert "access_token" not in response.json()
    assert "set-cookie" not in response.headers
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_login_attempts_are_written_to_audit_log(client, new_account):
    business_id, _, phone = await new_account()

    await _login(client, phone, "xato-parol")
    await _login(client, phone)
    await client.post("/api/auth/logout")

    assert await _events(business_id) == ["login.failed", "login.success", "logout"]


# ---------- Sessiya ----------


async def test_protected_endpoint_requires_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    bad = await client.get("/api/auth/me", headers={"Authorization": "Bearer yaroqsiz"})
    assert bad.status_code == 401
    assert bad.json()["code"] == "not_authenticated"


async def test_refresh_issues_new_access_token(client, new_account):
    _, user_id, phone = await new_account()
    await _login(client, phone)

    response = await client.post("/api/auth/refresh")  # cookie avtomatik yuboriladi

    assert response.status_code == 200
    assert response.json()["user"]["id"] == user_id
    assert (await client.get("/api/auth/me", headers=_bearer(response))).status_code == 200


async def _refresh_with(client: httpx.AsyncClient, token: str) -> tuple[httpx.Response, str | None]:
    """Boshqa oyna: shu (ehtimol eskirgan) uzoq muddatli token bilan yangilaydi. (javob, yangi token)."""
    response = await client.post("/api/auth/refresh", headers={"Cookie": f"mato_refresh={token}"})
    return response, response.cookies.get("mato_refresh")


async def test_refresh_rotates_the_refresh_token(browser, new_account):
    """Har yangilashda uzoq muddatli token almashadi; eskisi faqat qisqa vaqt (boshqa oynalar uchun) o'tadi."""
    from app.core.redis import get_redis
    from app.core.security import hash_token

    _, _, phone = await new_account()
    tab = browser()
    await _login(tab, phone)
    old = tab.cookies["mato_refresh"]

    first = await tab.post("/api/auth/refresh")
    new = tab.cookies["mato_refresh"]
    assert first.status_code == 200 and new != old

    # Boshqa oyna shu paytda eski token bilan yangilayapti — sessiya uzilmaydi va O'SHA yangi tokenni oladi
    late, given = await _refresh_with(browser(), old)
    assert (late.status_code, given) == (200, new)

    # Qisqa muhlat o'tgach eski token ishlamaydi; yangisi ishlaydi (va yana almashadi)
    await get_redis().delete(f"rt:next:{hash_token(old)}")
    assert (await _refresh_with(browser(), old))[0].status_code == 401
    assert (await tab.post("/api/auth/refresh")).status_code == 200
    assert tab.cookies["mato_refresh"] not in (old, new)

    # Chiqish yangi token bilan ham sessiyani tugatadi
    assert (await tab.post("/api/auth/logout")).status_code == 204
    assert (await tab.post("/api/auth/refresh")).status_code == 401


async def test_logout_with_a_just_rotated_token_still_ends_the_session(browser, new_account):
    """Yangilash javobi yo'lda yo'qolgan (brauzerda eski token qolgan) bo'lsa ham chiqish sessiyani tugatadi."""
    _, _, phone = await new_account()
    tab = browser()
    await _login(tab, phone)
    old = tab.cookies["mato_refresh"]
    _, new = await _refresh_with(browser(), old)  # token almashdi, lekin `tab` buni bilmaydi
    assert new and new != old

    assert (await tab.post("/api/auth/logout")).status_code == 204  # eski token bilan

    assert (await _refresh_with(browser(), new))[0].status_code == 401


async def test_many_tabs_refreshing_at_once_keep_the_session(browser, new_account):
    """Bir nechta oyna bir vaqtda yangilasa — hammasi bitta yangi tokenni oladi, sessiya uzilmaydi."""
    _, _, phone = await new_account()
    first = browser()
    await _login(first, phone)
    old = first.cookies["mato_refresh"]

    results = await asyncio.gather(*(_refresh_with(browser(), old) for _ in range(4)))

    assert [response.status_code for response, _ in results] == [200] * 4
    tokens = {token for _, token in results}
    assert len(tokens) == 1 and old not in tokens
    assert (await _refresh_with(browser(), tokens.pop()))[0].status_code == 200


def test_credentials_key_is_required_outside_dev():
    """Ishlab chiqishdan tashqarida `CREDENTIALS_KEY` bo'sh (yoki SECRET_KEY bilan bir xil) bo'lsa ilova ishga tushmaydi."""
    from pydantic import ValidationError

    from app.core.config import Settings

    base = {
        "database_url": "postgresql+asyncpg://mato_app:p@db/mato",
        "database_system_url": "postgresql+asyncpg://mato_system:p@db/mato",
        "database_owner_url": "postgresql+asyncpg://mato:p@db/mato",
        "secret_key": "s" * 32,
        "_env_file": None,
    }
    assert Settings(**base, app_env="dev", credentials_key="").credentials_key == ""
    assert Settings(**base, app_env="prod", credentials_key="k" * 32).credentials_key == "k" * 32
    for bad in ("", "   ", "s" * 32):
        with pytest.raises(ValidationError, match="CREDENTIALS_KEY"):
            Settings(**base, app_env="prod", credentials_key=bad)
    # Serverda tizim roli jadvallar egasi bo'lmasligi kerak
    with pytest.raises(ValidationError, match="DATABASE_SYSTEM_URL"):
        Settings(
            **(base | {"database_system_url": base["database_owner_url"]}),
            app_env="prod",
            credentials_key="k" * 32,
        )


async def test_refresh_without_cookie_is_rejected(client):
    response = await client.post("/api/auth/refresh")

    assert response.status_code == 401
    assert response.json()["code"] == "session_expired"


async def test_logout_ends_session_immediately(client, new_account):
    _, _, phone = await new_account()
    login = await _login(client, phone)

    assert (await client.post("/api/auth/logout")).status_code == 204

    # Token muddati tugamagan bo'lsa ham endi ishlamaydi
    assert (await client.get("/api/auth/me", headers=_bearer(login))).status_code == 401
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_deactivated_user_is_kicked_out_immediately(client, new_account):
    _, user_id, phone = await new_account()
    login = await _login(client, phone)
    async with system_session() as s:
        await s.execute(update(User).where(User.id == user_id).values(is_active=False))

    me = await client.get("/api/auth/me", headers=_bearer(login))

    assert me.status_code == 401
    assert me.json()["code"] == "session_expired"
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_blocked_business_kicks_out_its_users_immediately(client, new_account):
    business_id, _, phone = await new_account()
    login = await _login(client, phone)
    async with system_session() as s:
        await s.execute(update(Business).where(Business.id == business_id).values(status="blocked"))

    assert (await client.get("/api/auth/me", headers=_bearer(login))).status_code == 401
    assert (await client.post("/api/auth/refresh")).status_code == 401


# ---------- Profil: til va parol ----------


async def test_user_can_change_language(client, new_account):
    _, user_id, phone = await new_account()
    login = await _login(client, phone)

    response = await client.patch("/api/auth/me", json={"language": "ru"}, headers=_bearer(login))

    assert response.status_code == 200
    assert response.json()["language"] == "ru"
    async with system_session() as s:
        assert (await s.get(User, user_id)).language == "ru"
    bad = await client.patch("/api/auth/me", json={"language": "de"}, headers=_bearer(login))
    assert bad.status_code == 422


async def test_change_password(client, new_account):
    business_id, _, phone = await new_account()
    login = await _login(client, phone)
    headers = _bearer(login)

    wrong = await client.post(
        "/api/auth/me/password",
        json={"old_password": "xato", "new_password": "yangi-parol"},
        headers=headers,
    )
    assert (wrong.status_code, wrong.json()["code"]) == (400, "wrong_password")

    short = await client.post(
        "/api/auth/me/password",
        json={"old_password": PASSWORD, "new_password": "12345"},
        headers=headers,
    )
    assert short.status_code == 422
    assert short.json()["fields"] == {"new_password": "string_too_short"}

    same = await client.post(
        "/api/auth/me/password",
        json={"old_password": PASSWORD, "new_password": PASSWORD},
        headers=headers,
    )
    assert (same.status_code, same.json()["code"]) == (400, "same_password")

    ok = await client.post(
        "/api/auth/me/password",
        json={"old_password": PASSWORD, "new_password": "yangi-parol"},
        headers=headers,
    )
    assert ok.status_code == 204
    assert (await _login(client, phone)).status_code == 401  # eski parol endi ishlamaydi
    assert (await _login(client, phone, "yangi-parol")).status_code == 200
    assert "password.changed" in await _events(business_id)


async def test_changing_password_ends_other_sessions_but_keeps_current(browser, new_account):
    _, _, phone = await new_account()
    phone_browser, laptop_browser = browser(), browser()
    on_phone = await _login(phone_browser, phone)
    on_laptop = await _login(laptop_browser, phone)

    changed = await laptop_browser.post(
        "/api/auth/me/password",
        json={"old_password": PASSWORD, "new_password": "yangi-parol"},
        headers=_bearer(on_laptop),
    )

    assert changed.status_code == 204
    assert (await laptop_browser.get("/api/auth/me", headers=_bearer(on_laptop))).status_code == 200
    assert (await phone_browser.get("/api/auth/me", headers=_bearer(on_phone))).status_code == 401


# ---------- Urinishlar cheklovi ----------


async def test_ten_wrong_passwords_block_the_phone_for_a_while(client, new_account):
    business_id, _, phone = await new_account()

    for _ in range(9):
        assert (await _login(client, phone, "xato")).status_code == 401
    tenth = await _login(client, phone, "xato")

    assert tenth.status_code == 429
    assert tenth.json()["code"] == "too_many_attempts"
    assert tenth.json()["retry_after"] == 15 * 60
    # Blok paytida to'g'ri parol ham qabul qilinmaydi
    blocked = await _login(client, phone)
    assert blocked.status_code == 429
    assert 0 < blocked.json()["retry_after"] <= 15 * 60
    events = await _events(business_id)
    assert events.count("login.failed") == 9
    assert events.count("login.locked") == 1


async def test_successful_login_resets_the_failure_counter(client, new_account):
    _, _, phone = await new_account()

    for _ in range(9):
        await _login(client, phone, "xato")
    assert (await _login(client, phone)).status_code == 200
    for _ in range(9):
        assert (await _login(client, phone, "xato")).status_code == 401

    assert (await _login(client, phone)).status_code == 200


async def test_block_is_per_phone_number(client, new_account):
    _, _, blocked_phone = await new_account()
    _, _, other_phone = await new_account()

    for _ in range(10):
        await _login(client, blocked_phone, "xato")

    assert (await _login(client, blocked_phone)).status_code == 429
    assert (await _login(client, other_phone)).status_code == 200


async def test_temporary_password_must_be_changed_before_working(client, new_account):
    _, _, phone = await new_account(must_change_password=True)
    login = await _login(client, phone)
    headers = _bearer(login)
    assert login.json()["user"]["must_change_password"] is True

    blocked = await client.get("/api/_test/any", headers=headers)
    assert (blocked.status_code, blocked.json()["code"]) == (403, "password_change_required")
    # Profil va parol almashtirish ochiq
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200

    await client.post(
        "/api/auth/me/password",
        json={"old_password": PASSWORD, "new_password": "yangi-parol"},
        headers=headers,
    )

    assert (await client.get("/api/_test/any", headers=headers)).status_code == 200


# ---------- Rollar ----------


@pytest.mark.parametrize(("role", "expected"), [("owner", 200), ("warehouse", 403), ("seller", 403)])
async def test_role_guard(client, new_account, role, expected):
    _, _, phone = await new_account(role=role)
    login = await _login(client, phone)

    response = await client.get("/api/_test/owner-only", headers=_bearer(login))

    assert response.status_code == expected
    if expected == 403:
        assert response.json()["code"] == "forbidden"


async def test_block_ends_by_itself_when_time_passes():
    limit = ratelimit.Limit("sinov", max_failures=2, window_seconds=60, block_seconds=1)
    subject = random_phone()

    assert await ratelimit.record_failure(limit, subject) == 0  # hali blok yo'q
    assert await ratelimit.record_failure(limit, subject) == limit.block_seconds  # blok boshlandi
    assert await ratelimit.blocked_for(limit, subject) > 0

    await asyncio.sleep(1.2)

    assert await ratelimit.blocked_for(limit, subject) == 0


# ---------- IP bo'yicha cheklov (Caddy ortidagi haqiqiy manzil) ----------


async def test_thirty_failures_from_one_ip_block_that_ip(browser, new_account):
    """Bitta IP'dan har xil raqamlarga 30 ta xato → shu IP 15 daqiqa to'xtatiladi; boshqa IP bemalol."""
    attacker = browser(ip="10.200.0.9")
    _, _, phone = await new_account()

    for _ in range(29):
        assert (await _login(attacker, random_phone(), "xato")).status_code == 401
    thirtieth = await _login(attacker, random_phone(), "xato")
    assert (thirtieth.status_code, thirtieth.json()["code"]) == (429, "too_many_attempts")
    assert thirtieth.json()["retry_after"] == 15 * 60
    # Blok paytida to'g'ri parol ham o'tmaydi — raqam bo'yicha hisob toza bo'lsa ham
    assert (await _login(attacker, phone)).status_code == 429

    assert (await _login(browser(ip="10.200.0.10"), phone)).status_code == 200


async def test_ip_counter_is_shared_by_login_store_login_and_pin(browser, new_account):
    """Uchala kirish yo'li bitta IP hisobiga tushadi — birida 10, boshqasida 20 xato ham blok beradi."""
    attacker = browser(ip="10.200.0.11")
    _, _, phone = await new_account()

    for _ in range(15):
        assert (await _login(attacker, random_phone(), "xato")).status_code == 401
    for _ in range(14):
        refused = await attacker.post(
            "/api/auth/store-login", json={"login": f"yoq{random_phone()}", "password": "xato"}
        )
        assert refused.status_code == 401
    last = await attacker.post("/api/auth/store-login", json={"login": "yoq", "password": "xato"})
    assert (last.status_code, last.json()["code"]) == (429, "too_many_attempts")
    assert (await _login(attacker, phone)).status_code == 429
