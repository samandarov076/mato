"""Do'kon logini: biznes egasi do'konga login/parol beradi, planshet shu bilan do'kon qurilmasi bo'ladi,
sotuvchilar PIN bilan kiradi. Ega planshetga o'z paroli bilan kirmaydi."""
import uuid

import httpx
import pytest
from sqlalchemy import select, update

from app.core.db import system_session
from app.core.models import AuditLog
from app.core.security import pin_lookup
from app.modules.platform.models import Business
from tests.conftest import PASSWORD

PIN = "1234"
STORE_PASSWORD = "dokon-parol-1"


def _bearer(response: httpx.Response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _login_name() -> str:
    return f"chorsu-{uuid.uuid4().hex[:8]}"


async def _owner_headers(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"phone": phone, "password": PASSWORD})
    assert response.status_code == 200
    return _bearer(response)


async def _store_login(client: httpx.AsyncClient, login: str, password: str = STORE_PASSWORD):
    return await client.post("/api/auth/store-login", json={"login": login, "password": password})


async def _events(business_id: int) -> list[str]:
    async with system_session() as s:
        rows = await s.scalars(
            select(AuditLog.event_code)
            .where(AuditLog.business_id == business_id)
            .order_by(AuditLog.id)
        )
        return list(rows)


@pytest.fixture
def store_with_login(client, new_account, new_location):
    """Biznes + do'kon + do'konga berilgan login. (business_id, store_id, login, egasi sarlavhalari)."""

    async def _new(**location):
        business_id, _, phone = await new_account()
        store_id = await new_location(business_id, name="Chorsu do'koni", **location)
        headers = await _owner_headers(client, phone)
        login = _login_name()
        response = await client.put(
            f"/api/locations/{store_id}/access",
            json={"login": login, "password": STORE_PASSWORD},
            headers=headers,
        )
        assert response.status_code == 204
        return business_id, store_id, login, headers

    return _new


async def test_store_login_turns_the_browser_into_a_store_device(
    browser, client, store_with_login, new_user
):
    business_id, store_id, login, headers = await store_with_login()
    seller_id = await new_user(
        business_id, role="seller", pin_lookup=pin_lookup(business_id, PIN), all_locations=True
    )
    tablet = browser()

    response = await _store_login(tablet, login.upper())  # katta-kichik harf farqsiz

    assert response.status_code == 200
    assert response.json()["bound"] is True
    assert response.json()["store"] == {"id": store_id, "name": "Chorsu do'koni"}
    assert "access_token" not in response.json()  # login sessiya ochmaydi — faqat qurilmani
    assert (await tablet.get("/api/auth/device")).json()["bound"] is True

    pin = await tablet.post("/api/auth/pin", json={"pin": PIN})
    assert pin.status_code == 200
    assert pin.json()["user"]["id"] == seller_id

    # Qurilma egasining ro'yxatida — uzsa, darhol ishlamay qoladi
    devices = (await client.get("/api/devices", headers=headers)).json()
    assert [d["store"]["id"] for d in devices] == [store_id]
    assert devices[0]["name"].startswith(login)
    revoked = await client.post(f"/api/devices/{devices[0]['id']}/revoke", headers=headers)
    assert revoked.status_code == 204
    assert (await tablet.get("/api/auth/device")).json()["bound"] is False
    assert {"location.login_set", "device.bound_by_login"} <= set(await _events(business_id))


async def test_wrong_store_credentials_are_rejected_and_limited(browser, store_with_login):
    _, _, login, _ = await store_with_login()
    tablet = browser()

    unknown = await _store_login(tablet, _login_name())
    wrong = await _store_login(tablet, login, "xato-parol")

    assert (unknown.status_code, unknown.json()["code"]) == (401, "invalid_store_credentials")
    assert (wrong.status_code, wrong.json()["code"]) == (401, "invalid_store_credentials")
    for _ in range(9):
        await _store_login(tablet, login, "xato-parol")
    blocked = await _store_login(tablet, login)  # to'g'ri parol ham blok paytida o'tmaydi
    assert (blocked.status_code, blocked.json()["code"]) == (429, "too_many_attempts")
    assert (await tablet.get("/api/auth/device")).json()["bound"] is False


async def test_login_is_unique_across_businesses_and_validated(
    client, store_with_login, new_account, new_location
):
    _, _, taken, _ = await store_with_login()
    business_id, _, phone = await new_account()
    headers = await _owner_headers(client, phone)
    store_id = await new_location(business_id)
    warehouse_id = await new_location(business_id, type="warehouse")

    async def put(location_id: int, **body):
        return await client.put(f"/api/locations/{location_id}/access", json=body, headers=headers)

    duplicate = await put(store_id, login=taken.upper(), password=STORE_PASSWORD)
    assert (duplicate.status_code, duplicate.json()["code"]) == (409, "login_taken")
    for bad in ("ab", "bo'sh joy", "-chorsu", "a" * 33):
        assert (await put(store_id, login=bad, password=STORE_PASSWORD)).status_code == 422, bad
    no_password = await put(store_id, login=_login_name())
    assert no_password.json()["fields"] == {"password": "required"}
    warehouse = await put(warehouse_id, login=_login_name(), password=STORE_PASSWORD)
    assert (warehouse.status_code, warehouse.json()["code"]) == (400, "store_only")

    # Login o'zgarsa, parol bo'sh qolishi mumkin — eskisi saqlanadi
    assert (await put(store_id, login=_login_name(), password=STORE_PASSWORD)).status_code == 204
    renamed = _login_name()
    assert (await put(store_id, login=renamed)).status_code == 204
    stores = (await client.get("/api/locations?type=store", headers=headers)).json()
    assert [s["login"] for s in stores if s["id"] == store_id] == [renamed]


async def test_other_business_store_access_cannot_be_changed(client, store_with_login, new_account):
    _, foreign_store, _, _ = await store_with_login()
    _, _, phone = await new_account()
    headers = await _owner_headers(client, phone)

    response = await client.put(
        f"/api/locations/{foreign_store}/access",
        json={"login": _login_name(), "password": STORE_PASSWORD},
        headers=headers,
    )

    assert response.status_code == 404


@pytest.mark.parametrize("role", ["warehouse", "seller"])
async def test_only_owner_manages_store_login(client, new_account, new_location, role):
    business_id, _, phone = await new_account(role=role)
    store_id = await new_location(business_id)
    headers = await _owner_headers(client, phone)

    response = await client.put(
        f"/api/locations/{store_id}/access",
        json={"login": _login_name(), "password": STORE_PASSWORD},
        headers=headers,
    )

    assert response.status_code == 403


async def test_owner_sees_and_clears_the_store_password(browser, client, store_with_login):
    business_id, store_id, login, headers = await store_with_login()
    tablet = browser()
    assert (await _store_login(tablet, login)).status_code == 200

    revealed = await client.post(f"/api/locations/{store_id}/access/reveal", headers=headers)
    assert revealed.json() == {"password": STORE_PASSWORD}

    cleared = await client.delete(f"/api/locations/{store_id}/access", headers=headers)
    assert cleared.status_code == 204
    again = await _store_login(browser(), login)
    assert again.json()["code"] == "invalid_store_credentials"
    # Avval ochilgan qurilma o'z tokeni bilan ishlayveradi — kerak bo'lsa ega uni uzadi
    assert (await tablet.get("/api/auth/device")).json()["bound"] is True
    events = await _events(business_id)
    assert "location.password_viewed" in events and "location.login_cleared" in events


async def test_inactive_store_or_blocked_business_cannot_log_in(browser, store_with_login):
    _, _, inactive_login, _ = await store_with_login(is_active=False)
    business_id, _, blocked_login, _ = await store_with_login()
    async with system_session() as s:
        await s.execute(update(Business).where(Business.id == business_id).values(status="blocked"))

    inactive = await _store_login(browser(), inactive_login)
    blocked = await _store_login(browser(), blocked_login)

    assert (inactive.status_code, inactive.json()["code"]) == (403, "store_inactive")
    assert (blocked.status_code, blocked.json()["code"]) == (403, "business_blocked")


async def test_pin_guessing_is_limited_per_store_across_new_devices(
    browser, store_with_login, new_user
):
    """Login bilan yangi qurilma ochib, har birida 5 tadan PIN sinab bo'lmaydi: do'kon bo'yicha 20 ta xato."""
    business_id, _, login, _ = await store_with_login()
    await new_user(
        business_id, role="seller", pin_lookup=pin_lookup(business_id, PIN), all_locations=True
    )

    for _ in range(5):  # 5 ta qurilma × 4 ta xato = 20
        tablet = browser()
        assert (await _store_login(tablet, login)).status_code == 200
        for _ in range(4):
            await tablet.post("/api/auth/pin", json={"pin": "0000"})

    fresh = browser()
    assert (await _store_login(fresh, login)).status_code == 200
    response = await fresh.post("/api/auth/pin", json={"pin": PIN})  # to'g'ri PIN ham kutadi
    assert (response.status_code, response.json()["code"]) == (429, "pin_locked")


async def test_repeated_store_pin_blocks_grow_and_owners_are_told(
    browser, client, store_with_login, new_user
):
    """Do'kon bloki takrorlansa muddat o'sadi: 15 daqiqa → 1 soat → 24 soat; har blok egalarga xabar."""
    from app.core.redis import get_redis

    business_id, store_id, login, headers = await store_with_login()
    await new_user(
        business_id, role="seller", pin_lookup=pin_lookup(business_id, PIN), all_locations=True
    )

    waits = []
    for _ in range(4):
        for _ in range(5):  # 5 ta qurilma × 4 ta xato = 20
            tablet = browser()
            assert (await _store_login(tablet, login)).status_code == 200
            for _ in range(4):
                last = await tablet.post("/api/auth/pin", json={"pin": "0000"})
        assert (last.status_code, last.json()["code"]) == (429, "pin_locked")
        waits.append(last.json()["retry_after"])
        # Blok muddati o'tdi (kutib o'tirmaymiz) — hujumchi yana urinadi
        await get_redis().delete(f"rl:pin-store:block:{store_id}")
        # To'g'ri PIN bilan kirish do'kon hisobini nolga tushirmaydi
        assert (await tablet.post("/api/auth/pin", json={"pin": PIN})).status_code == 200

    assert waits == [15 * 60, 60 * 60, 24 * 3600, 24 * 3600]
    inbox = (await client.get("/api/notifications", headers=headers)).json()["items"]
    told = [n["data"] for n in inbox if n["event_code"] == "pin.store_locked"]
    assert sorted(item["minutes"] for item in told) == [15, 60, 1440, 1440]
    assert {(item["store"], item["store_id"]) for item in told} == {("Chorsu do'koni", store_id)}
    assert (await _events(business_id)).count("pin.locked") == 4
