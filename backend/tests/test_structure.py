"""02-tuzilma: do'konlar, skladlar, xodimlar, PIN, parolni yangilash, faolsizlantirish."""
import httpx
import pytest

from app.core.security import pin_lookup
from tests.conftest import PASSWORD, random_phone


async def _login(client: httpx.AsyncClient, phone: str, password: str = PASSWORD) -> httpx.Response:
    return await client.post("/api/auth/login", json={"phone": phone, "password": password})


async def _headers(client: httpx.AsyncClient, phone: str, password: str = PASSWORD) -> dict[str, str]:
    return {"Authorization": f"Bearer {(await _login(client, phone, password)).json()['access_token']}"}


@pytest.fixture
def owner(client, new_account):
    """Asosiy ega bo'lib kirgan brauzer: (business_id, headers)."""

    async def _enter() -> tuple[int, dict[str, str]]:
        business_id, _, phone = await new_account(is_primary_owner=True)
        return business_id, await _headers(client, phone)

    return _enter


async def _events(client, headers) -> list[str]:
    page = await client.get("/api/audit-logs", params={"category": "staff"}, headers=headers)
    return [item["event_code"] for item in page.json()["items"]]


# ---------- Do'konlar va skladlar ----------


async def test_create_edit_and_list_locations(client, owner):
    _, headers = await owner()

    store = await client.post(
        "/api/locations",
        json={"type": "store", "name": " Chorsu do'koni ", "address": "Chorsu", "phone": "+998 71 200 00 01"},
        headers=headers,
    )
    warehouse = await client.post(
        "/api/locations", json={"type": "warehouse", "name": "Asosiy sklad"}, headers=headers
    )
    assert (store.status_code, warehouse.status_code) == (201, 201)

    edited = await client.patch(
        f"/api/locations/{store.json()['id']}",
        json={"name": "Chorsu do'koni", "address": "Chorsu bozori, 12-rasta", "phone": ""},
        headers=headers,
    )
    assert edited.status_code == 204

    rows = (await client.get("/api/locations", headers=headers)).json()
    assert [(r["type"], r["name"], r["address"], r["phone"]) for r in rows] == [
        ("store", "Chorsu do'koni", "Chorsu bozori, 12-rasta", None),
        ("warehouse", "Asosiy sklad", None, None),
    ]
    assert await _events(client, headers) == [
        "location.updated",
        "location.created",
        "location.created",
    ]


async def test_location_name_is_unique_within_its_type(client, owner):
    _, headers = await owner()
    body = {"type": "store", "name": "Chorsu"}
    assert (await client.post("/api/locations", json=body, headers=headers)).status_code == 201

    same = await client.post("/api/locations", json=body | {"name": "CHORSU"}, headers=headers)
    assert (same.status_code, same.json()["code"]) == (409, "name_taken")
    # Sklad boshqa ro'yxat — shu nom bilan bo'lishi mumkin
    as_warehouse = await client.post(
        "/api/locations", json={"type": "warehouse", "name": "Chorsu"}, headers=headers
    )
    assert as_warehouse.status_code == 201

    short = await client.post("/api/locations", json={"type": "store", "name": "A"}, headers=headers)
    bad_phone = await client.post(
        "/api/locations", json={"type": "store", "name": "Yangi", "phone": "123"}, headers=headers
    )
    assert short.status_code == 422
    assert bad_phone.json()["fields"] == {"phone": "invalid_phone"}


async def test_other_business_cannot_touch_my_locations(browser, owner, new_account, new_location):
    business_id, _ = await owner()
    mine = await new_location(business_id)
    _, _, stranger_phone = await new_account(is_primary_owner=True)
    stranger = browser()
    headers = await _headers(stranger, stranger_phone)

    edit = await stranger.patch(f"/api/locations/{mine}", json={"name": "Buzildi"}, headers=headers)
    close = await stranger.post(f"/api/locations/{mine}/deactivate", headers=headers)

    assert (edit.status_code, close.status_code) == (404, 404)
    assert (await stranger.get("/api/locations", headers=headers)).json() == []


async def test_deactivated_store_loses_its_devices(browser, client, new_account, new_location, new_user):
    business_id, _, phone = await new_account(is_primary_owner=True)
    store = await new_location(business_id)
    await new_user(business_id, role="seller", all_locations=True, pin_lookup=pin_lookup(business_id, "1234"))
    tablet = browser()
    bound = await tablet.post(
        "/api/devices", json={"store_id": store, "name": "Kassa"}, headers=await _headers(tablet, phone)
    )
    assert bound.status_code == 201
    seller = await tablet.post("/api/auth/pin", json={"pin": "1234"})
    seller_headers = {"Authorization": f"Bearer {seller.json()['access_token']}"}
    headers = await _headers(client, phone)

    assert (await client.post(f"/api/locations/{store}/deactivate", headers=headers)).status_code == 204

    assert (await tablet.get("/api/auth/me", headers=seller_headers)).status_code == 401
    assert (await tablet.get("/api/auth/device")).json()["bound"] is False
    assert (await client.get("/api/devices", headers=headers)).json() == []
    assert (await client.get("/api/locations", headers=headers)).json() == []
    everything = await client.get("/api/locations", params={"include_inactive": True}, headers=headers)
    assert [r["is_active"] for r in everything.json()] == [False]

    assert (await client.post(f"/api/locations/{store}/activate", headers=headers)).status_code == 204
    assert [r["is_active"] for r in (await client.get("/api/locations", headers=headers)).json()] == [True]


# ---------- Xodim qo'shish ----------


async def test_add_warehouse_keeper_with_selected_warehouses(browser, client, owner, new_location):
    business_id, headers = await owner()
    first = await new_location(business_id, type="warehouse", name="1-sklad")
    await new_location(business_id, type="warehouse", name="2-sklad")
    phone = random_phone()

    created = await client.post(
        "/api/users",
        json={
            "full_name": "Dilshod Rahimov",
            "role": "warehouse",
            "phone": phone,
            "password": "vaqtincha1",
            "location_ids": [first],
        },
        headers=headers,
    )

    assert created.status_code == 201
    assert created.json()["location_ids"] == [first]
    assert created.json()["all_locations"] is False
    # Parolni ega qo'ygan — xodim birinchi kirishda almashtiradi
    keeper = await _login(browser(), phone, "vaqtincha1")
    assert keeper.json()["user"]["must_change_password"] is True
    # Sklad ro'yxatida omborchi ko'rinadi — faqat o'ziga biriktirilganida
    warehouses = (await client.get("/api/locations", params={"type": "warehouse"}, headers=headers)).json()
    assert [(w["name"], w["staff"]) for w in warehouses] == [
        ("1-sklad", ["Dilshod Rahimov"]),
        ("2-sklad", []),
    ]


async def test_add_seller_with_pin_and_stores(browser, client, new_account, new_location):
    business_id, _, owner_phone = await new_account(is_primary_owner=True)
    headers = await _headers(client, owner_phone)
    allowed = await new_location(business_id, name="1-do'kon")
    other = await new_location(business_id, name="2-do'kon")

    created = await client.post(
        "/api/users",
        json={
            "full_name": "Nodira Yusupova",
            "role": "seller",
            "phone": "+998901234567",  # sotuvchida telefon saqlanmaydi
            "pin": "4321",
            "location_ids": [allowed],
        },
        headers=headers,
    )
    assert created.status_code == 201
    assert (created.json()["phone"], created.json()["has_pin"]) == (None, True)

    async def pin_on(store_id: int) -> int:
        tablet = browser()
        await tablet.post(
            "/api/devices",
            json={"store_id": store_id, "name": "Kassa"},
            headers=await _headers(tablet, owner_phone),
        )
        return (await tablet.post("/api/auth/pin", json={"pin": "4321"})).status_code

    assert await pin_on(allowed) == 200
    assert await pin_on(other) == 401  # bu do'kon unga ruxsat etilmagan


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"role": "warehouse", "phone": "123", "password": "parol123", "all_locations": True}, "phone"),
        ({"role": "warehouse", "phone": "+998901112200", "all_locations": True}, "password"),
        ({"role": "warehouse", "phone": "+998901112200", "password": "parol123"}, "location_ids"),
        ({"role": "seller", "all_locations": True}, "pin"),
        ({"role": "seller", "pin": "12", "all_locations": True}, "pin"),
        ({"role": "seller", "pin": "1234"}, "location_ids"),
    ],
)
async def test_staff_validation(client, owner, body, field):
    _, headers = await owner()

    response = await client.post("/api/users", json={"full_name": "Yangi Xodim"} | body, headers=headers)

    assert response.status_code == 422
    assert list(response.json()["fields"]) == [field]


async def test_locations_must_match_role_and_business(client, owner, new_account, new_location):
    business_id, headers = await owner()
    other_business, _, _ = await new_account()
    store = await new_location(business_id)
    foreign_store = await new_location(other_business)

    async def add_seller(location_id: int) -> httpx.Response:
        return await client.post(
            "/api/users",
            json={"full_name": "Sotuvchi", "role": "seller", "pin": "1111", "location_ids": [location_id]},
            headers=headers,
        )

    keeper_on_store = await client.post(
        "/api/users",
        json={
            "full_name": "Omborchi",
            "role": "warehouse",
            "phone": random_phone(),
            "password": "parol123",
            "location_ids": [store],  # do'kon — omborchiga sklad kerak
        },
        headers=headers,
    )
    assert keeper_on_store.json()["fields"] == {"location_ids": "invalid"}
    assert (await add_seller(foreign_store)).json()["fields"] == {"location_ids": "invalid"}
    assert (await add_seller(store)).status_code == 201


async def test_phone_and_pin_must_be_unique(client, owner, new_account):
    _, headers = await owner()
    _, _, foreign_phone = await new_account()  # boshqa biznesdagi raqam ham band hisoblanadi

    def keeper(phone: str) -> dict:
        return {"full_name": "Omborchi", "role": "warehouse", "phone": phone, "password": "parol123", "all_locations": True}

    def seller(pin: str) -> dict:
        return {"full_name": "Sotuvchi", "role": "seller", "pin": pin, "all_locations": True}

    taken = await client.post("/api/users", json=keeper(foreign_phone), headers=headers)
    assert (taken.status_code, taken.json()["code"]) == (409, "phone_taken")

    assert (await client.post("/api/users", json=seller("1111"), headers=headers)).status_code == 201
    same_pin = await client.post("/api/users", json=seller("1111"), headers=headers)
    assert (same_pin.status_code, same_pin.json()["code"]) == (409, "pin_taken")
    assert (await client.post("/api/users", json=seller("2222"), headers=headers)).status_code == 201
    # Muvaffaqiyatsiz urinishlar hech narsa yaratmagan
    staff = (await client.get("/api/users", headers=headers)).json()
    assert sorted(u["role"] for u in staff) == ["owner", "seller", "seller"]


# ---------- Egalar ----------


async def test_only_primary_owner_manages_owners(browser, client, owner):
    _, headers = await owner()
    co_phone, second_phone = random_phone(), random_phone()

    def co_owner(phone: str) -> dict:
        return {"full_name": "Sherik Ega", "role": "owner", "phone": phone, "password": "parol123"}

    created = await client.post("/api/users", json=co_owner(co_phone), headers=headers)
    assert created.status_code == 201
    assert created.json()["all_locations"] is True

    # Sherik-ega o'zi parol qo'yib kiradi; u boshqa egalarni boshqara olmaydi
    co_browser = browser()
    co_headers = await _headers(co_browser, co_phone, "parol123")
    await co_browser.post(
        "/api/auth/me/password",
        json={"old_password": "parol123", "new_password": "yangi-parol"},
        headers=co_headers,
    )
    denied = await co_browser.post("/api/users", json=co_owner(second_phone), headers=co_headers)
    assert (denied.status_code, denied.json()["code"]) == (403, "primary_owner_only")
    # Lekin oddiy xodim qo'sha oladi
    seller = await co_browser.post(
        "/api/users",
        json={"full_name": "Sotuvchi", "role": "seller", "pin": "1234", "all_locations": True},
        headers=co_headers,
    )
    assert seller.status_code == 201

    staff = (await client.get("/api/users", headers=headers)).json()
    primary = next(u for u in staff if u["is_primary_owner"])
    protected = await co_browser.post(f"/api/users/{primary['id']}/deactivate", headers=co_headers)
    assert (protected.status_code, protected.json()["code"]) == (403, "primary_owner_protected")
    myself = await client.post(f"/api/users/{primary['id']}/deactivate", headers=headers)
    assert (myself.status_code, myself.json()["code"]) == (400, "cannot_deactivate_self")


# ---------- Tahrirlash, PIN, parol, faolsizlantirish ----------


async def test_edit_staff_and_removing_a_store_ends_open_sessions(
    browser, client, new_account, new_location
):
    business_id, _, owner_phone = await new_account(is_primary_owner=True)
    headers = await _headers(client, owner_phone)
    first, second = await new_location(business_id, name="1"), await new_location(business_id, name="2")
    seller = (
        await client.post(
            "/api/users",
            json={"full_name": "Nodira", "role": "seller", "pin": "1234", "location_ids": [first, second]},
            headers=headers,
        )
    ).json()
    tablet = browser()
    await tablet.post(
        "/api/devices", json={"store_id": first, "name": "Kassa"}, headers=await _headers(tablet, owner_phone)
    )
    session = await tablet.post("/api/auth/pin", json={"pin": "1234"})
    seller_headers = {"Authorization": f"Bearer {session.json()['access_token']}"}

    edited = await client.patch(
        f"/api/users/{seller['id']}",
        json={"full_name": "Nodira Yusupova", "location_ids": [second]},
        headers=headers,
    )

    assert edited.status_code == 200
    assert (edited.json()["full_name"], edited.json()["location_ids"]) == ("Nodira Yusupova", [second])
    assert (await tablet.get("/api/auth/me", headers=seller_headers)).status_code == 401
    assert (await tablet.post("/api/auth/pin", json={"pin": "1234"})).status_code == 401  # 1-do'kon olib qo'yilgan


async def test_owner_sets_new_pin(browser, client, new_account, new_location):
    business_id, _, owner_phone = await new_account(is_primary_owner=True)
    headers = await _headers(client, owner_phone)
    store = await new_location(business_id)

    async def add(pin: str) -> int:
        body = {"full_name": f"Sotuvchi {pin}", "role": "seller", "pin": pin, "all_locations": True}
        return (await client.post("/api/users", json=body, headers=headers)).json()["id"]

    first, _ = await add("1111"), await add("2222")
    tablet = browser()
    await tablet.post(
        "/api/devices", json={"store_id": store, "name": "Kassa"}, headers=await _headers(tablet, owner_phone)
    )

    busy = await client.post(f"/api/users/{first}/pin", json={"pin": "2222"}, headers=headers)
    assert (busy.status_code, busy.json()["code"]) == (409, "pin_taken")  # "band" xabarini faqat ega ko'radi

    assert (await client.post(f"/api/users/{first}/pin", json={"pin": "3333"}, headers=headers)).status_code == 204
    assert (await tablet.post("/api/auth/pin", json={"pin": "1111"})).status_code == 401
    assert (await tablet.post("/api/auth/pin", json={"pin": "3333"})).status_code == 200


async def test_owner_resets_staff_password(browser, client, owner):
    _, headers = await owner()
    phone = random_phone()
    keeper = (
        await client.post(
            "/api/users",
            json={"full_name": "Omborchi", "role": "warehouse", "phone": phone, "password": "eski-parol", "all_locations": True},
            headers=headers,
        )
    ).json()
    keeper_browser = browser()
    keeper_headers = await _headers(keeper_browser, phone, "eski-parol")

    reset = await client.post(f"/api/users/{keeper['id']}/password", json={"password": "yangi-parol"}, headers=headers)

    assert reset.status_code == 204
    assert (await keeper_browser.get("/api/auth/me", headers=keeper_headers)).status_code == 401
    assert (await _login(keeper_browser, phone, "eski-parol")).status_code == 401
    relogin = await _login(keeper_browser, phone, "yangi-parol")
    assert relogin.json()["user"]["must_change_password"] is True
    short = await client.post(f"/api/users/{keeper['id']}/password", json={"password": "123"}, headers=headers)
    assert short.status_code == 422


async def test_deactivate_and_reactivate_staff(browser, client, owner):
    _, headers = await owner()
    phone = random_phone()
    keeper = (
        await client.post(
            "/api/users",
            json={"full_name": "Omborchi", "role": "warehouse", "phone": phone, "password": "parol123", "all_locations": True},
            headers=headers,
        )
    ).json()
    keeper_browser = browser()
    keeper_headers = await _headers(keeper_browser, phone, "parol123")

    assert (await client.post(f"/api/users/{keeper['id']}/deactivate", headers=headers)).status_code == 204

    assert (await keeper_browser.get("/api/auth/me", headers=keeper_headers)).status_code == 401
    assert (await _login(keeper_browser, phone, "parol123")).json()["code"] == "account_inactive"
    listed = next(u for u in (await client.get("/api/users", headers=headers)).json() if u["id"] == keeper["id"])
    assert listed["is_active"] is False  # o'chirilmagan — ro'yxatda turibdi

    assert (await client.post(f"/api/users/{keeper['id']}/activate", headers=headers)).status_code == 204
    assert (await _login(keeper_browser, phone, "parol123")).status_code == 200
    assert await _events(client, headers) == ["user.activated", "user.deactivated", "user.created"]


async def test_reactivating_seller_fails_if_pin_was_taken_meanwhile(client, owner):
    _, headers = await owner()

    async def add(name: str) -> int:
        body = {"full_name": name, "role": "seller", "pin": "1234", "all_locations": True}
        return (await client.post("/api/users", json=body, headers=headers)).json()["id"]

    old = await add("Eski sotuvchi")
    await client.post(f"/api/users/{old}/deactivate", headers=headers)
    await add("Yangi sotuvchi")  # bo'shagan PIN'ni oldi

    back = await client.post(f"/api/users/{old}/activate", headers=headers)
    assert (back.status_code, back.json()["code"]) == (409, "pin_taken")
    # Avval yangi PIN, keyin faollashtirish
    assert (await client.post(f"/api/users/{old}/pin", json={"pin": "9999"}, headers=headers)).status_code == 204
    assert (await client.post(f"/api/users/{old}/activate", headers=headers)).status_code == 204


@pytest.mark.parametrize("role", ["warehouse", "seller"])
async def test_only_owners_manage_structure(client, new_account, role):
    _, _, phone = await new_account(role=role)
    headers = await _headers(client, phone)

    add_store = await client.post("/api/locations", json={"type": "store", "name": "Yangi"}, headers=headers)
    add_user = await client.post(
        "/api/users",
        json={"full_name": "Yangi", "role": "seller", "pin": "1234", "all_locations": True},
        headers=headers,
    )

    assert (add_store.status_code, add_user.status_code) == (403, 403)


# ---------- Parol va PIN'ni ko'rish ----------


async def _reveal(client, headers, user_id: int) -> httpx.Response:
    return await client.post(f"/api/users/{user_id}/reveal", headers=headers)


async def test_owner_sees_the_current_password_and_pin_of_staff(client, owner):
    _, headers = await owner()
    keeper = await client.post(
        "/api/users",
        json={"full_name": "Dilshod Omborchi", "role": "warehouse", "phone": random_phone(),
              "password": "parol123", "all_locations": True},
        headers=headers,
    )
    seller = await client.post(
        "/api/users",
        json={"full_name": "Nodira Sotuvchi", "role": "seller", "pin": "1111", "all_locations": True},
        headers=headers,
    )
    keeper_id, seller_id = keeper.json()["id"], seller.json()["id"]

    assert (await _reveal(client, headers, keeper_id)).json() == {"password": "parol123", "pin": None}
    assert (await _reveal(client, headers, seller_id)).json() == {"password": None, "pin": "1111"}

    # Yangilangach — yangisi ko'rinadi
    await client.post(f"/api/users/{keeper_id}/password", json={"password": "yangi-parol"}, headers=headers)
    await client.post(f"/api/users/{seller_id}/pin", json={"pin": "2222"}, headers=headers)
    assert (await _reveal(client, headers, keeper_id)).json()["password"] == "yangi-parol"
    assert (await _reveal(client, headers, seller_id)).json()["pin"] == "2222"

    # Har ko'rish jurnalga yoziladi; ro'yxatda esa parol ham, PIN ham yo'q
    assert (await _events(client, headers)).count("user.secret_viewed") == 4
    listed = (await client.get("/api/users", headers=headers)).text
    assert "parol" not in listed and "2222" not in listed and "_enc" not in listed


async def test_stored_secrets_are_encrypted_not_plain(client, owner):
    from sqlalchemy import select

    from app.core.db import system_session
    from app.modules.auth.models import User

    _, headers = await owner()
    created = await client.post(
        "/api/users",
        json={"full_name": "Omborchi", "role": "warehouse", "phone": random_phone(),
              "password": "juda-maxfiy-parol", "all_locations": True},
        headers=headers,
    )

    async with system_session() as s:
        stored = await s.scalar(select(User.password_enc).where(User.id == created.json()["id"]))
    assert stored and "juda-maxfiy-parol" not in stored


async def test_staff_changing_own_password_keeps_it_visible_to_the_owner(browser, client, owner):
    _, headers = await owner()
    phone = random_phone()
    created = await client.post(
        "/api/users",
        json={"full_name": "Omborchi", "role": "warehouse", "phone": phone,
              "password": "parol123", "all_locations": True},
        headers=headers,
    )
    keeper = browser()
    changed = await keeper.post(
        "/api/auth/me/password",
        json={"old_password": "parol123", "new_password": "o'zim-qo'ygan"},
        headers=await _headers(keeper, phone, "parol123"),
    )
    assert changed.status_code == 204

    assert (await _reveal(client, headers, created.json()["id"])).json()["password"] == "o'zim-qo'ygan"


async def test_password_set_before_the_feature_appears_after_next_login(browser, client, owner, new_user):
    from app.core.security import hash_password

    business_id, headers = await owner()
    phone = random_phone()
    # Eski foydalanuvchi: faqat xesh bor, shifrlangan nusxa yo'q
    keeper_id = await new_user(
        business_id, role="warehouse", phone=phone, all_locations=True,
        password_hash=hash_password(PASSWORD),
    )
    assert (await _reveal(client, headers, keeper_id)).json() == {"password": None, "pin": None}

    # Xato parol bilan urinish hech narsa saqlamaydi
    assert (await _login(browser(), phone, "xato-parol")).status_code == 401
    assert (await _reveal(client, headers, keeper_id)).json()["password"] is None

    assert (await _login(browser(), phone)).status_code == 200
    assert (await _reveal(client, headers, keeper_id)).json()["password"] == PASSWORD


async def test_old_pin_appears_after_the_seller_enters_it(seller, shop):
    opened = await shop()
    await seller(opened, pin="4321")  # sotuvchi faqat xesh bilan yaratiladi va PIN bilan kiradi
    staff = (await opened.client.get("/api/users", headers=opened.headers)).json()
    seller_id = next(u["id"] for u in staff if u["role"] == "seller")

    shown = await _reveal(opened.client, opened.headers, seller_id)

    assert shown.json() == {"password": None, "pin": "4321"}


async def test_who_may_reveal(browser, client, owner, new_account, keeper, shop):
    _, headers = await owner()
    co_phone = random_phone()
    co_owner = await client.post(
        "/api/users",
        json={"full_name": "Sherik Ega", "role": "owner", "phone": co_phone, "password": "parol123"},
        headers=headers,
    )
    second = await client.post(
        "/api/users",
        json={"full_name": "Ikkinchi Sherik", "role": "owner", "phone": random_phone(), "password": "parol456"},
        headers=headers,
    )
    worker = await client.post(
        "/api/users",
        json={"full_name": "Omborchi", "role": "warehouse", "phone": random_phone(),
              "password": "parol789", "all_locations": True},
        headers=headers,
    )

    # Asosiy ega: sherik-eganikini ko'radi; o'zinikini (asosiy eganikini) — hech kim
    assert (await _reveal(client, headers, co_owner.json()["id"])).json()["password"] == "parol123"
    everyone = (await client.get("/api/users", headers=headers)).json()
    primary_id = next(u["id"] for u in everyone if u["is_primary_owner"])
    own = await _reveal(client, headers, primary_id)
    assert (own.status_code, own.json()["code"]) == (403, "primary_owner_protected")

    # Sherik-ega: oddiy xodimnikini ko'radi, boshqa eganikini — yo'q
    co_browser = browser()
    co_headers = await _headers(co_browser, co_phone, "parol123")
    await co_browser.post(  # ega qo'ygan parol bilan ishlab bo'lmaydi — avval o'zinikini qo'yadi
        "/api/auth/me/password",
        json={"old_password": "parol123", "new_password": "sherik-parol"},
        headers=co_headers,
    )
    assert (await _reveal(co_browser, co_headers, worker.json()["id"])).json()["password"] == "parol789"
    denied = await _reveal(co_browser, co_headers, second.json()["id"])
    assert (denied.status_code, denied.json()["code"]) == (403, "primary_owner_only")

    # Boshqa biznes egasi bu xodimni umuman ko'rmaydi (RLS)
    stranger = browser()
    _, _, stranger_phone = await new_account(is_primary_owner=True)
    foreign = await _reveal(stranger, await _headers(stranger, stranger_phone), worker.json()["id"])
    assert (foreign.status_code, foreign.json()["code"]) == (404, "user_not_found")

    # Omborchi va sotuvchi — hech kimnikini
    opened = await shop()
    keeper_headers = await keeper(opened)
    staff = (await opened.client.get("/api/users", headers=opened.headers)).json()
    assert (await _reveal(opened.client, keeper_headers, staff[0]["id"])).status_code == 403
