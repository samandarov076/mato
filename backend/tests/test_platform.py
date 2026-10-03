"""Platforma egasi: ikki bosqichli kirish va bizneslar paneli."""
import httpx
import pyotp
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import system_session
from app.core.models import AuditLog
from app.core.security import hash_password
from tests.conftest import PASSWORD, random_phone


async def _login(client: httpx.AsyncClient, phone: str, password: str = PASSWORD) -> httpx.Response:
    return await client.post("/api/auth/login", json={"phone": phone, "password": password})


def _bearer(response: httpx.Response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def new_platform_owner(new_user):
    """Platforma egasi. with_2fa=True — tasdiqlash ilovasi allaqachon ulangan. (phone, secret) qaytaradi."""

    async def _new(with_2fa: bool = True) -> tuple[str, str | None]:
        phone = random_phone()
        secret = pyotp.random_base32() if with_2fa else None
        await new_user(
            None,
            role="platform_owner",
            phone=phone,
            password_hash=hash_password(PASSWORD),
            totp_secret=secret,
        )
        return phone, secret

    return _new


@pytest.fixture
def required_2fa(monkeypatch):
    """Serverda ikki bosqichli kirish majburiy (PLATFORM_2FA_REQUIRED=true)."""
    monkeypatch.setattr(get_settings(), "platform_2fa_required", True)


@pytest.fixture
def platform(browser, new_platform_owner):
    """Platforma paneliga kirgan brauzer va tayyor sarlavhalar."""

    async def _enter() -> tuple[httpx.AsyncClient, dict[str, str]]:
        phone, secret = await new_platform_owner()
        client = browser()
        challenge = (await _login(client, phone)).json()["challenge_token"]
        verified = await client.post(
            "/api/auth/2fa/verify",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        assert verified.status_code == 200
        return client, _bearer(verified)

    return _enter


async def _create(client, headers, **overrides) -> httpx.Response:
    body = {
        "name": "Ipak yo'li matolari",
        "owner_full_name": "Jasur Toshmatov",
        "owner_phone": random_phone(),
    } | overrides
    return await client.post("/api/platform/businesses", json=body, headers=headers)


# ---------- Ikki bosqichli kirish ----------


async def test_without_an_app_the_password_is_enough(client, new_platform_owner):
    """Standart: ikki bosqichli kirish ixtiyoriy — ilova ulanmagan bo'lsa, parol bilan panel ochiladi."""
    phone, _ = await new_platform_owner(with_2fa=False)

    login = await _login(client, phone)

    assert login.status_code == 200
    assert "two_factor" not in login.json()
    assert login.json()["user"]["role"] == "platform_owner"
    listed = await client.get("/api/platform/businesses", headers=_bearer(login))
    assert listed.status_code == 200
    status = await client.get("/api/platform/2fa", headers=_bearer(login))
    assert status.json() == {"enabled": False, "recovery_left": 0, "required": False}


async def test_owner_turns_two_factor_on_and_off_in_the_profile(client, new_platform_owner):
    phone, _ = await new_platform_owner(with_2fa=False)
    headers = _bearer(await _login(client, phone))

    secret = (await client.post("/api/platform/2fa/setup", headers=headers)).json()["secret"]
    wrong = await client.post("/api/platform/2fa/enable", json={"code": "000000"}, headers=headers)
    assert (wrong.status_code, wrong.json()["code"]) == (401, "invalid_code")
    enabled = await client.post(
        "/api/platform/2fa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=headers
    )
    assert enabled.status_code == 200
    codes = enabled.json()["recovery_codes"]
    assert len(codes) == 10

    # Endi kirishda kod so'raladi
    assert (await _login(client, phone)).json()["two_factor"] == "required"
    status = await client.get("/api/platform/2fa", headers=headers)
    assert status.json() == {"enabled": True, "recovery_left": 10, "required": False}

    # O'chirish uchun kod kerak — sessiyaning o'zi yetmaydi
    refused = await client.post("/api/platform/2fa/disable", json={"code": "000000"}, headers=headers)
    assert refused.json()["code"] == "invalid_code"
    disabled = await client.post("/api/platform/2fa/disable", json={"code": codes[0]}, headers=headers)
    assert disabled.status_code == 204

    assert "two_factor" not in (await _login(client, phone)).json()
    status = await client.get("/api/platform/2fa", headers=headers)
    assert status.json() == {"enabled": False, "recovery_left": 0, "required": False}


async def test_required_two_factor_cannot_be_turned_off(client, new_platform_owner, required_2fa):
    phone, secret = await new_platform_owner()
    challenge = (await _login(client, phone)).json()["challenge_token"]
    headers = _bearer(
        await client.post(
            "/api/auth/2fa/verify",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
    )

    response = await client.post(
        "/api/platform/2fa/disable", json={"code": pyotp.TOTP(secret).now()}, headers=headers
    )

    assert (response.status_code, response.json()["code"]) == (403, "two_factor_required")


async def test_first_login_requires_connecting_an_authenticator_app(
    client, new_platform_owner, required_2fa
):
    phone, _ = await new_platform_owner(with_2fa=False)

    login = await _login(client, phone)
    assert login.json()["two_factor"] == "setup"
    challenge = login.json()["challenge_token"]

    setup = await client.post("/api/auth/2fa/setup", json={"challenge_token": challenge})
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/mato-savdo:")

    wrong = await client.post(
        "/api/auth/2fa/confirm", json={"challenge_token": challenge, "code": "000000"}
    )
    assert (wrong.status_code, wrong.json()["code"]) == (401, "invalid_code")

    confirmed = await client.post(
        "/api/auth/2fa/confirm",
        json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["user"]["role"] == "platform_owner"
    assert body["business"] is None
    assert len(body["recovery_codes"]) == 10 and len(set(body["recovery_codes"])) == 10
    listed = await client.get("/api/platform/businesses", headers=_bearer(confirmed))
    assert listed.status_code == 200

    # Keyingi kirishda ilova so'ralmaydi — faqat kod
    assert (await _login(client, phone)).json()["two_factor"] == "required"
    again = await client.post("/api/auth/2fa/setup", json={"challenge_token": challenge})
    assert (again.status_code, again.json()["code"]) == (409, "two_factor_already_set")


async def test_login_with_authenticator_code_and_session_refresh(client, new_platform_owner):
    phone, secret = await new_platform_owner()
    login = await _login(client, phone)
    assert login.json()["two_factor"] == "required"

    verified = await client.post(
        "/api/auth/2fa/verify",
        json={"challenge_token": login.json()["challenge_token"], "code": pyotp.TOTP(secret).now()},
    )

    assert verified.status_code == 200
    refreshed = await client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["user"]["role"] == "platform_owner"
    assert (await client.post("/api/auth/logout")).status_code == 204
    gone = await client.get("/api/platform/businesses", headers=_bearer(verified))
    assert gone.status_code == 401


async def test_recovery_code_works_exactly_once(client, new_platform_owner, required_2fa):
    phone, _ = await new_platform_owner(with_2fa=False)
    challenge = (await _login(client, phone)).json()["challenge_token"]
    secret = (
        await client.post("/api/auth/2fa/setup", json={"challenge_token": challenge})
    ).json()["secret"]
    codes = (
        await client.post(
            "/api/auth/2fa/confirm",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
    ).json()["recovery_codes"]

    async def use(code: str) -> httpx.Response:
        token = (await _login(client, phone)).json()["challenge_token"]
        return await client.post(
            "/api/auth/2fa/verify", json={"challenge_token": token, "code": code}
        )

    assert (await use(codes[0].upper())).status_code == 200  # telefon yo'qolgan — zaxira kod bilan
    assert (await use(codes[0])).json()["code"] == "invalid_code"  # ikkinchi marta ishlamaydi
    assert (await use(codes[1])).status_code == 200


async def test_wrong_codes_are_limited(client, new_platform_owner):
    phone, secret = await new_platform_owner()
    challenge = (await _login(client, phone)).json()["challenge_token"]

    async def attempt(code: str) -> httpx.Response:
        return await client.post(
            "/api/auth/2fa/verify", json={"challenge_token": challenge, "code": code}
        )

    for _ in range(4):
        assert (await attempt("000000")).json()["code"] == "invalid_code"
    fifth = await attempt("000000")
    assert (fifth.status_code, fifth.json()["code"]) == (429, "too_many_attempts")
    assert (await attempt(pyotp.TOTP(secret).now())).status_code == 429  # to'g'ri kod ham o'tmaydi


async def test_second_step_needs_a_valid_challenge(client, new_account):
    _, _, owner_phone = await new_account()
    business_login = await _login(client, owner_phone)

    for token in ("yaroqsiz", business_login.json()["access_token"]):
        response = await client.post(
            "/api/auth/2fa/verify", json={"challenge_token": token, "code": "123456"}
        )
        assert (response.status_code, response.json()["code"]) == (401, "challenge_expired")


async def test_challenge_token_is_not_a_session(client, new_platform_owner):
    phone, _ = await new_platform_owner()
    challenge = (await _login(client, phone)).json()["challenge_token"]

    response = await client.get(
        "/api/platform/businesses", headers={"Authorization": f"Bearer {challenge}"}
    )

    assert response.status_code == 401


# ---------- Panel faqat platforma egasi uchun ----------


async def test_business_users_cannot_open_platform_panel(client, new_account):
    _, _, phone = await new_account()
    headers = _bearer(await _login(client, phone))

    listed = await client.get("/api/platform/businesses", headers=headers)
    created = await _create(client, headers)

    assert (listed.status_code, listed.json()["code"]) == (403, "forbidden")
    assert created.status_code == 403
    assert (await client.get("/api/platform/businesses")).status_code == 401


async def test_platform_owner_cannot_open_business_data(platform):
    client, headers = await platform()

    for path in ("/api/settings", "/api/audit-logs", "/api/devices", "/api/auth/me"):
        assert (await client.get(path, headers=headers)).status_code == 401, path


# ---------- Biznes qo'shish ----------


async def test_create_business_gives_owner_a_temporary_password(platform, browser):
    client, headers = await platform()
    phone = random_phone()
    spaced = f"{phone[:4]} {phone[4:6]} {phone[6:9]} {phone[9:11]} {phone[11:]}"

    created = await _create(client, headers, name="  Ipak yo'li matolari ", owner_phone=spaced)

    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Ipak yo'li matolari"
    assert body["owner_phone"] == phone
    assert len(body["temp_password"]) == 10

    # Egasi vaqtinchalik parol bilan kiradi va uni almashtirishi shart
    owner_browser = browser()
    owner_login = await _login(owner_browser, phone, body["temp_password"])
    assert owner_login.status_code == 200
    assert owner_login.json()["user"]["must_change_password"] is True
    assert owner_login.json()["user"]["is_primary_owner"] is True
    assert owner_login.json()["business"]["name"] == "Ipak yo'li matolari"


async def test_create_business_validation(platform):
    client, headers = await platform()
    taken = random_phone()
    assert (await _create(client, headers, owner_phone=taken)).status_code == 201

    duplicate = await _create(client, headers, owner_phone=taken)
    assert (duplicate.status_code, duplicate.json()["code"]) == (409, "phone_taken")

    bad_phone = await _create(client, headers, owner_phone="12345")
    assert bad_phone.status_code == 422
    assert bad_phone.json()["fields"] == {"owner_phone": "invalid_phone"}

    short = await _create(client, headers, name="A")
    assert short.status_code == 422
    assert list(short.json()["fields"]) == ["name"]


# ---------- Ro'yxat va kartochka ----------


async def test_list_shows_owner_counts_and_supports_search(platform, new_location, new_user):
    client, headers = await platform()
    phone = random_phone()
    unique = f"Qidiruv-{phone[-7:]}"
    business_id = (await _create(client, headers, name=unique, owner_phone=phone)).json()["id"]
    await new_location(business_id, name="1-do'kon")
    await new_location(business_id, name="2-do'kon")
    await new_location(business_id, type="warehouse", name="Sklad")
    await new_user(business_id, role="seller")
    await new_user(business_id, role="seller", is_active=False)

    async def found(**params) -> list[dict]:
        response = await client.get("/api/platform/businesses", params=params, headers=headers)
        assert response.status_code == 200
        return response.json()

    by_name = await found(search=unique.lower())
    assert [b["id"] for b in by_name] == [business_id]
    row = by_name[0]
    assert row["owner"] == {"full_name": "Jasur Toshmatov", "phone": phone}
    assert (row["stores_count"], row["staff_count"], row["status"]) == (2, 2, "active")

    assert business_id in [b["id"] for b in await found(search=phone[-7:])]  # telefon bo'yicha
    assert await found(search=unique, status="blocked") == []

    newest_first = [b["created_at"] for b in await found()]
    assert newest_first == sorted(newest_first, reverse=True)
    # Faollik bo'yicha: eng yaqinda ishlaganlar tepada, hali ishlamaganlar oxirida
    by_activity = [b["last_activity_at"] for b in await found(sort="last_activity_at")]
    active = [value for value in by_activity if value]
    assert active == sorted(active, reverse=True)
    assert by_activity == active + [None] * (len(by_activity) - len(active))


async def test_business_card_and_unknown_business(platform):
    client, headers = await platform()
    business_id = (await _create(client, headers)).json()["id"]

    card = await client.get(f"/api/platform/businesses/{business_id}", headers=headers)

    assert card.status_code == 200
    assert [o["is_primary_owner"] for o in card.json()["owners"]] == [True]
    assert card.json()["events"] == []
    missing = await client.get("/api/platform/businesses/999999999", headers=headers)
    assert (missing.status_code, missing.json()["code"]) == (404, "business_not_found")


# ---------- Bloklash ----------


async def test_block_kicks_everyone_out_and_unblock_restores_access(platform, browser):
    client, headers = await platform()
    phone = random_phone()
    created = (await _create(client, headers, owner_phone=phone)).json()
    business_id, password = created["id"], created["temp_password"]
    owner_browser = browser()
    owner_headers = _bearer(await _login(owner_browser, phone, password))
    url = f"/api/platform/businesses/{business_id}"

    no_reason = await client.post(f"{url}/block", json={"reason": " "}, headers=headers)
    assert no_reason.status_code == 422

    blocked = await client.post(
        f"{url}/block", json={"reason": "To'lov qilinmadi"}, headers=headers
    )
    assert blocked.status_code == 204

    # Xodimlar darhol chiqarilgan va qayta kira olmaydi
    assert (await owner_browser.get("/api/auth/me", headers=owner_headers)).status_code == 401
    assert (await owner_browser.post("/api/auth/refresh")).status_code == 401
    assert (await _login(owner_browser, phone, password)).json()["code"] == "business_blocked"
    twice = await client.post(f"{url}/block", json={"reason": "yana"}, headers=headers)
    assert (twice.status_code, twice.json()["code"]) == (409, "status_unchanged")

    unblocked = await client.post(
        f"{url}/unblock", json={"reason": "To'lov keldi"}, headers=headers
    )
    assert unblocked.status_code == 204
    assert (await _login(owner_browser, phone, password)).status_code == 200  # hammasi joyida

    card = (await client.get(url, headers=headers)).json()
    assert card["status"] == "active"
    assert [(e["action"], e["reason"]) for e in card["events"]] == [
        ("unblock", "To'lov keldi"),
        ("block", "To'lov qilinmadi"),
    ]


# ---------- Egalar ----------


async def test_reset_owner_password(platform, browser):
    client, headers = await platform()
    phone = random_phone()
    created = (await _create(client, headers, owner_phone=phone)).json()
    business_id, old_password = created["id"], created["temp_password"]
    owner_browser = browser()
    owner_headers = _bearer(await _login(owner_browser, phone, old_password))
    owner_id = (
        await client.get(f"/api/platform/businesses/{business_id}", headers=headers)
    ).json()["owners"][0]["id"]

    reset = await client.post(
        f"/api/platform/businesses/{business_id}/owners/{owner_id}/reset-password",
        headers=headers,
    )

    assert reset.status_code == 200
    new_password = reset.json()["temp_password"]
    assert new_password != old_password
    assert (await owner_browser.get("/api/auth/me", headers=owner_headers)).status_code == 401
    assert (await _login(owner_browser, phone, old_password)).status_code == 401
    relogin = await _login(owner_browser, phone, new_password)
    assert relogin.json()["user"]["must_change_password"] is True
    # Biznes jurnalida ham ko'rinadi
    async with system_session() as s:
        events = (
            await s.scalars(select(AuditLog.event_code).where(AuditLog.business_id == business_id))
        ).all()
    assert "password.reset_by_platform" in events

    wrong_business = (await _create(client, headers)).json()["id"]
    foreign = await client.post(
        f"/api/platform/businesses/{wrong_business}/owners/{owner_id}/reset-password",
        headers=headers,
    )
    assert (foreign.status_code, foreign.json()["code"]) == (404, "owner_not_found")


async def test_change_primary_owner_to_a_co_owner(platform, new_user):
    client, headers = await platform()
    business_id = (await _create(client, headers)).json()["id"]
    co_owner = await new_user(business_id, role="owner", full_name="Sherik Ega")
    inactive = await new_user(business_id, role="owner", is_active=False)
    seller = await new_user(business_id, role="seller")
    url = f"/api/platform/businesses/{business_id}"

    async def change(user_id: int) -> httpx.Response:
        return await client.post(
            f"{url}/primary-owner",
            json={"user_id": user_id, "reason": "Egasi almashdi"},
            headers=headers,
        )

    assert (await change(seller)).json()["code"] == "owner_not_found"
    assert (await change(inactive)).json()["code"] == "invalid_owner"

    assert (await change(co_owner)).status_code == 204

    card = (await client.get(url, headers=headers)).json()
    primary = [o for o in card["owners"] if o["is_primary_owner"]]
    assert [o["id"] for o in primary] == [co_owner]
    assert card["owner"]["full_name"] == "Sherik Ega"
    assert [(e["action"], e["reason"]) for e in card["events"]] == [
        ("owner_change", "Egasi almashdi")
    ]
    assert (await change(co_owner)).json()["code"] == "invalid_owner"  # u allaqachon asosiy ega


async def test_update_owner_phone(platform, browser):
    client, headers = await platform()
    old_phone, new_phone, taken = random_phone(), random_phone(), random_phone()
    created = (await _create(client, headers, owner_phone=old_phone)).json()
    await _create(client, headers, owner_phone=taken)
    url = f"/api/platform/businesses/{created['id']}"
    owner_id = (await client.get(url, headers=headers)).json()["owners"][0]["id"]

    conflict = await client.patch(
        f"{url}/owners/{owner_id}", json={"phone": taken}, headers=headers
    )
    assert (conflict.status_code, conflict.json()["code"]) == (409, "phone_taken")

    updated = await client.patch(
        f"{url}/owners/{owner_id}", json={"phone": new_phone}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()["phone"] == new_phone

    owner_browser = browser()
    assert (await _login(owner_browser, old_phone, created["temp_password"])).status_code == 401
    assert (await _login(owner_browser, new_phone, created["temp_password"])).status_code == 200


# ---------- Biznes egasining parolini ko'rish ----------


async def _reveal(client, headers, business_id: int, owner_id: int) -> httpx.Response:
    return await client.post(
        f"/api/platform/businesses/{business_id}/owners/{owner_id}/reveal-password", headers=headers
    )


async def test_platform_owner_sees_the_business_owners_current_password(platform, browser):
    client, headers = await platform()
    phone = random_phone()
    created = (await _create(client, headers, owner_phone=phone)).json()
    business_id, temp_password = created["id"], created["temp_password"]
    owner_id = (
        await client.get(f"/api/platform/businesses/{business_id}", headers=headers)
    ).json()["owners"][0]["id"]

    assert (await _reveal(client, headers, business_id, owner_id)).json() == {"password": temp_password}

    # Ega o'z parolini qo'ygach — yangisi ko'rinadi
    owner_browser = browser()
    changed = await owner_browser.post(
        "/api/auth/me/password",
        json={"old_password": temp_password, "new_password": "egasining-paroli"},
        headers=_bearer(await _login(owner_browser, phone, temp_password)),
    )
    assert changed.status_code == 204
    assert (await _reveal(client, headers, business_id, owner_id)).json() == {"password": "egasining-paroli"}

    # Qayta tiklangach — yangi vaqtinchalik parol
    reset = await client.post(
        f"/api/platform/businesses/{business_id}/owners/{owner_id}/reset-password", headers=headers
    )
    assert (await _reveal(client, headers, business_id, owner_id)).json() == {
        "password": reset.json()["temp_password"]
    }

    # Har ko'rish biznesning o'z jurnaliga yoziladi; biznes kartochkasida parol yo'q
    async with system_session() as s:
        events = (
            await s.scalars(select(AuditLog.event_code).where(AuditLog.business_id == business_id))
        ).all()
    assert events.count("password.viewed_by_platform") == 3
    card = (await client.get(f"/api/platform/businesses/{business_id}", headers=headers)).text
    assert "egasining-paroli" not in card and "_enc" not in card

    wrong_business = (await _create(client, headers)).json()["id"]
    foreign = await _reveal(client, headers, wrong_business, owner_id)
    assert (foreign.status_code, foreign.json()["code"]) == (404, "owner_not_found")


async def test_business_users_cannot_reveal_through_the_platform(client, new_account):
    business_id, user_id, phone = await new_account(is_primary_owner=True)
    headers = _bearer(await _login(client, phone))

    denied = await _reveal(client, headers, business_id, user_id)

    assert denied.status_code == 403


async def test_platform_owners_own_password_is_never_stored_readable(platform, new_platform_owner, client):
    from app.modules.auth.models import User

    phone, secret = await new_platform_owner()
    challenge = (await _login(client, phone)).json()["challenge_token"]
    verified = await client.post(
        "/api/auth/2fa/verify",
        json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
    )
    assert verified.status_code == 200

    async with system_session() as s:
        stored = await s.scalar(select(User.password_enc).where(User.phone == phone))
    assert stored is None


# ---------- Biznes nomini o'zgartirish ----------


async def test_platform_owner_renames_a_business(platform, new_account):
    business_id, _, _ = await new_account()
    client, headers = await platform()

    response = await client.patch(
        f"/api/platform/businesses/{business_id}", json={"name": "Yangi nom"}, headers=headers
    )

    assert response.status_code == 204
    detail = await client.get(f"/api/platform/businesses/{business_id}", headers=headers)
    assert detail.json()["name"] == "Yangi nom"
    async with system_session() as s:
        codes = (await s.scalars(select(AuditLog.event_code).where(AuditLog.business_id == business_id))).all()
    assert "business.renamed_by_platform" in codes
    missing = await client.patch(
        "/api/platform/businesses/999999999", json={"name": "Yangi nom"}, headers=headers
    )
    assert missing.status_code == 404


async def test_business_owner_cannot_use_platform_rename(client, new_account):
    business_id, _, phone = await new_account(is_primary_owner=True)
    headers = _bearer(await _login(client, phone))

    response = await client.patch(
        f"/api/platform/businesses/{business_id}", json={"name": "Yangi nom"}, headers=headers
    )

    assert response.status_code == 403
