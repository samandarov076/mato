"""Do'kon qurilmasi: bog'lash, uzish, sotuvchining PIN bilan kirishi, xato PIN'lar cheklovi."""
from dataclasses import dataclass

import httpx
import pytest
from sqlalchemy import select, update

from app.core.db import system_session
from app.core.models import AuditLog
from app.core.security import pin_lookup
from app.modules.auth.models import User
from app.modules.platform.models import Business
from app.modules.structure.models import Location, UserLocation
from tests.conftest import PASSWORD

PIN = "1234"


def _bearer(response: httpx.Response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _owner_headers(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"phone": phone, "password": PASSWORD})
    assert response.status_code == 200
    return _bearer(response)


async def _pin(client: httpx.AsyncClient, pin: str = PIN) -> httpx.Response:
    return await client.post("/api/auth/pin", json={"pin": pin})


async def _events(business_id: int) -> list[tuple[str, int | None]]:
    async with system_session() as s:
        rows = await s.execute(
            select(AuditLog.event_code, AuditLog.location_id)
            .where(AuditLog.business_id == business_id)
            .order_by(AuditLog.id)
        )
        return [tuple(row) for row in rows]


@dataclass
class Shop:
    business_id: int
    owner_phone: str
    store_id: int
    device_id: int
    tablet: httpx.AsyncClient  # do'konga bog'langan qurilma


@pytest.fixture
def new_shop(browser, new_account, new_location):
    """Biznes + do'kon + shu do'konga bog'langan qurilma (ega o'z paroli bilan bog'lagan)."""

    async def _new() -> Shop:
        business_id, _, phone = await new_account()
        store_id = await new_location(business_id, name="Chorsu do'koni")
        tablet = browser()
        bound = await tablet.post(
            "/api/devices",
            json={"store_id": store_id, "name": "Kassa"},
            headers=await _owner_headers(tablet, phone),
        )
        assert bound.status_code == 201
        return Shop(business_id, phone, store_id, bound.json()["id"], tablet)

    return _new


@pytest.fixture
def new_seller(new_user):
    async def _new(business_id: int, pin: str = PIN, **fields) -> int:
        fields.setdefault("all_locations", True)
        return await new_user(
            business_id, role="seller", pin_lookup=pin_lookup(business_id, pin), **fields
        )

    return _new


# ---------- Bog'lash ----------


async def test_owner_binds_this_browser_to_a_store(client, new_account, new_location):
    business_id, _, phone = await new_account()
    store_id = await new_location(business_id, name="Chorsu do'koni")
    headers = await _owner_headers(client, phone)

    response = await client.post(
        "/api/devices", json={"store_id": store_id, "name": "  1-do'kon kassasi  "}, headers=headers
    )

    assert response.status_code == 201
    assert response.json()["name"] == "1-do'kon kassasi"
    assert response.json()["store"] == {"id": store_id, "name": "Chorsu do'koni"}
    device_cookie = next(c for c in response.headers.get_list("set-cookie") if "mato_device=" in c)
    assert "HttpOnly" in device_cookie and "SameSite=strict" in device_cookie

    # Qurilma endi do'konniki: egasining sessiyasi unda tugagan
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    assert (await client.post("/api/auth/refresh")).status_code == 401

    status = (await client.get("/api/auth/device")).json()
    assert status["bound"] is True
    assert status["device_name"] == "1-do'kon kassasi"
    assert status["store"]["name"] == "Chorsu do'koni"
    assert ("device.bound", store_id) in await _events(business_id)


async def test_unbound_browser_is_not_a_device(client):
    assert (await client.get("/api/auth/device")).json() == {
        "bound": False,
        "device_name": None,
        "store": None,
        "business": None,
    }
    response = await _pin(client)
    assert (response.status_code, response.json()["code"]) == (401, "device_not_bound")


@pytest.mark.parametrize("role", ["warehouse", "seller"])
async def test_only_owner_can_bind_devices(client, new_account, new_location, role):
    business_id, _, phone = await new_account(role=role)
    store_id = await new_location(business_id)
    headers = await _owner_headers(client, phone)

    response = await client.post(
        "/api/devices", json={"store_id": store_id, "name": "Kassa"}, headers=headers
    )

    assert response.status_code == 403
    assert (await client.get("/api/devices", headers=headers)).status_code == 403


async def test_device_can_be_bound_only_to_own_active_store(client, new_account, new_location):
    business_id, _, phone = await new_account()
    other_business, _, _ = await new_account()
    headers = await _owner_headers(client, phone)
    targets = {
        "boshqa biznes do'koni": await new_location(other_business),
        "sklad": await new_location(business_id, type="warehouse"),
        "faolsiz do'kon": await new_location(business_id, is_active=False),
        "mavjud emas": 999_999_999,
    }

    for label, store_id in targets.items():
        response = await client.post(
            "/api/devices", json={"store_id": store_id, "name": "Kassa"}, headers=headers
        )
        assert (response.status_code, response.json()["code"]) == (404, "store_not_found"), label

    short = await client.post(
        "/api/devices", json={"store_id": targets["sklad"], "name": "K"}, headers=headers
    )
    assert short.status_code == 422


async def test_rebinding_the_same_browser_replaces_the_old_device(browser, new_shop, new_location):
    shop = await new_shop()
    second_store = await new_location(shop.business_id, name="Ikkinchi do'kon")

    rebound = await shop.tablet.post(
        "/api/devices",
        json={"store_id": second_store, "name": "Kassa"},
        headers=await _owner_headers(shop.tablet, shop.owner_phone),
    )
    assert rebound.status_code == 201

    laptop = browser()
    devices = await laptop.get(
        "/api/devices", headers=await _owner_headers(laptop, shop.owner_phone)
    )
    assert [d["store"]["id"] for d in devices.json()] == [second_store]


# ---------- PIN bilan kirish ----------


async def test_seller_logs_in_with_pin(new_shop, new_seller):
    shop = await new_shop()
    seller_id = await new_seller(shop.business_id, full_name="Nodira Yusupova")

    response = await _pin(shop.tablet)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == seller_id
    assert body["user"]["role"] == "seller"
    assert body["store"] == {"id": shop.store_id, "name": "Chorsu do'koni"}
    assert body["business"]["autolock_minutes"] == 30

    me = await shop.tablet.get("/api/auth/me", headers=_bearer(response))
    assert me.status_code == 200
    assert me.json()["store"]["id"] == shop.store_id
    # Jurnalda kirish do'kon bilan birga yozilgan
    assert ("login.success", shop.store_id) in await _events(shop.business_id)


async def test_wrong_pin_is_rejected(new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)

    response = await _pin(shop.tablet, "0000")

    assert (response.status_code, response.json()["code"]) == (401, "invalid_pin")
    assert (await _pin(shop.tablet, "12a4")).status_code == 422
    assert (await _pin(shop.tablet, "12345")).status_code == 422


async def test_pin_works_only_in_stores_allowed_for_the_seller(new_shop, new_seller, new_location):
    shop = await new_shop()
    other_store = await new_location(shop.business_id, name="Boshqa do'kon")
    seller_id = await new_seller(shop.business_id, all_locations=False)

    async def allow(location_id: int) -> None:
        async with system_session() as s:
            s.add(
                UserLocation(
                    user_id=seller_id, location_id=location_id, business_id=shop.business_id
                )
            )

    await allow(other_store)
    assert (await _pin(shop.tablet)).json()["code"] == "invalid_pin"

    await allow(shop.store_id)
    assert (await _pin(shop.tablet)).status_code == 200


async def test_pin_of_inactive_seller_or_other_business_does_not_work(new_shop, new_seller):
    shop = await new_shop()
    other = await new_shop()
    await new_seller(shop.business_id, pin="1111", is_active=False)
    await new_seller(other.business_id, pin="2222")

    assert (await _pin(shop.tablet, "1111")).json()["code"] == "invalid_pin"
    assert (await _pin(shop.tablet, "2222")).json()["code"] == "invalid_pin"
    assert (await _pin(other.tablet, "2222")).status_code == 200


async def test_pin_login_is_refused_for_blocked_business(new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)
    async with system_session() as s:
        await s.execute(
            update(Business).where(Business.id == shop.business_id).values(status="blocked")
        )

    response = await _pin(shop.tablet)

    assert (response.status_code, response.json()["code"]) == (403, "business_blocked")


# ---------- Xato PIN'lar cheklovi ----------


async def test_five_wrong_pins_lock_the_device_for_five_minutes(new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)

    for _ in range(4):
        assert (await _pin(shop.tablet, "0000")).json()["code"] == "invalid_pin"
    fifth = await _pin(shop.tablet, "0000")

    assert (fifth.status_code, fifth.json()["code"]) == (429, "pin_locked")
    assert fifth.json()["retry_after"] == 5 * 60
    # Blok paytida to'g'ri PIN ham qabul qilinmaydi
    locked = await _pin(shop.tablet)
    assert locked.status_code == 429
    assert 0 < locked.json()["retry_after"] <= 5 * 60
    assert (await _events(shop.business_id)).count(("pin.locked", shop.store_id)) == 1


async def test_lock_applies_to_one_device_only(new_shop, new_seller):
    locked_shop, other_shop = await new_shop(), await new_shop()
    await new_seller(other_shop.business_id)

    for _ in range(5):
        await _pin(locked_shop.tablet, "0000")

    assert (await _pin(locked_shop.tablet)).status_code == 429
    assert (await _pin(other_shop.tablet)).status_code == 200


async def test_correct_pin_resets_the_wrong_pin_counter(new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)

    for _ in range(4):
        await _pin(shop.tablet, "0000")
    assert (await _pin(shop.tablet)).status_code == 200
    for _ in range(4):
        assert (await _pin(shop.tablet, "0000")).json()["code"] == "invalid_pin"

    assert (await _pin(shop.tablet)).status_code == 200


# ---------- Qulflash va sessiya ----------


async def test_lock_ends_seller_session_but_device_stays_bound(new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)
    login = await _pin(shop.tablet)

    refreshed = await shop.tablet.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["store"]["id"] == shop.store_id

    assert (await shop.tablet.post("/api/auth/logout")).status_code == 204  # qulf tugmasi

    assert (await shop.tablet.get("/api/auth/me", headers=_bearer(login))).status_code == 401
    assert (await shop.tablet.post("/api/auth/refresh")).status_code == 401
    assert (await shop.tablet.get("/api/auth/device")).json()["bound"] is True
    assert ("logout", shop.store_id) in await _events(shop.business_id)  # jurnalda do'kon bilan
    assert (await _pin(shop.tablet)).status_code == 200  # boshqa (yoki o'sha) sotuvchi kira oladi


async def test_deactivated_seller_is_kicked_out_of_the_device(new_shop, new_seller):
    shop = await new_shop()
    seller_id = await new_seller(shop.business_id)
    login = await _pin(shop.tablet)
    async with system_session() as s:
        await s.execute(update(User).where(User.id == seller_id).values(is_active=False))

    assert (await shop.tablet.get("/api/auth/me", headers=_bearer(login))).status_code == 401
    assert (await _pin(shop.tablet)).json()["code"] == "invalid_pin"


# ---------- Uzish ----------


async def test_revoked_device_stops_working_immediately(browser, new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)
    seller_login = await _pin(shop.tablet)
    laptop = browser()
    owner = await _owner_headers(laptop, shop.owner_phone)

    devices = (await laptop.get("/api/devices", headers=owner)).json()
    assert [d["id"] for d in devices] == [shop.device_id]
    assert devices[0]["last_seen_at"] is not None

    revoked = await laptop.post(f"/api/devices/{shop.device_id}/revoke", headers=owner)
    assert revoked.status_code == 204

    assert (await shop.tablet.get("/api/auth/me", headers=_bearer(seller_login))).status_code == 401
    assert (await shop.tablet.post("/api/auth/refresh")).status_code == 401
    assert (await _pin(shop.tablet)).json()["code"] == "device_not_bound"
    assert (await shop.tablet.get("/api/auth/device")).json()["bound"] is False
    assert (await laptop.get("/api/devices", headers=owner)).json() == []
    assert ("device.revoked", shop.store_id) in await _events(shop.business_id)
    # Ikkinchi marta uzib bo'lmaydi
    again = await laptop.post(f"/api/devices/{shop.device_id}/revoke", headers=owner)
    assert (again.status_code, again.json()["code"]) == (404, "device_not_found")


async def test_owner_cannot_see_or_revoke_devices_of_another_business(browser, new_shop):
    shop, other = await new_shop(), await new_shop()
    laptop = browser()
    owner = await _owner_headers(laptop, shop.owner_phone)

    devices = (await laptop.get("/api/devices", headers=owner)).json()
    assert [d["id"] for d in devices] == [shop.device_id]

    foreign = await laptop.post(f"/api/devices/{other.device_id}/revoke", headers=owner)
    assert foreign.status_code == 404
    assert (await other.tablet.get("/api/auth/device")).json()["bound"] is True


async def test_device_of_deactivated_store_does_not_accept_pins(new_shop, new_seller):
    shop = await new_shop()
    await new_seller(shop.business_id)
    async with system_session() as s:
        await s.execute(update(Location).where(Location.id == shop.store_id).values(is_active=False))

    assert (await _pin(shop.tablet)).json()["code"] == "device_not_bound"
