"""Biznes sozlamalari, harakatlar jurnali va tanlov ro'yxatlari (do'konlar, xodimlar)."""
import httpx
import pytest

from app.core.audit import log_event
from app.core.db import tenant_session
from tests.conftest import PASSWORD

DEFAULTS = {
    "sell_by_kg": True,
    "credit_enabled": True,
    "credit_days": 30,
    "low_stock_default": None,
    "price_rounding": 1000,
    "autolock_minutes": 30,
    "daily_summary_time": "21:00:00",
}


async def _headers(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"phone": phone, "password": PASSWORD})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _journal(client, headers, **params) -> dict:
    response = await client.get("/api/audit-logs", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# ---------- Sozlamalar ----------


async def test_owner_reads_default_settings(client, new_account):
    _, _, phone = await new_account()

    response = await client.get("/api/settings", headers=await _headers(client, phone))

    assert response.status_code == 200
    assert response.json() == DEFAULTS


async def test_owner_changes_settings_and_change_is_logged(client, new_account):
    _, user_id, phone = await new_account()
    headers = await _headers(client, phone)
    wanted = DEFAULTS | {"credit_days": 45, "low_stock_default": "50.5", "price_rounding": 100}

    saved = await client.put("/api/settings", json=wanted, headers=headers)

    assert saved.status_code == 200
    assert saved.json() == wanted | {"low_stock_default": "50.50"}
    assert (await client.get("/api/settings", headers=headers)).json() == saved.json()

    entry = (await _journal(client, headers, category="staff"))["items"][0]
    assert entry["event_code"] == "settings.changed"
    assert entry["user"]["id"] == user_id
    assert entry["data"]["changes"] == {
        "credit_days": {"old": 30, "new": 45},
        "low_stock_default": {"old": None, "new": "50.50"},
        "price_rounding": {"old": 1000, "new": 100},
    }


async def test_saving_unchanged_settings_writes_nothing_to_journal(client, new_account):
    _, _, phone = await new_account()
    headers = await _headers(client, phone)

    assert (await client.put("/api/settings", json=DEFAULTS, headers=headers)).status_code == 200

    assert (await _journal(client, headers, category="staff"))["items"] == []


@pytest.mark.parametrize(
    "bad",
    [
        {"credit_days": 0},
        {"price_rounding": 10},
        {"autolock_minutes": 0},
        {"low_stock_default": "-5"},
        {"sell_by_kg": None},
    ],
)
async def test_invalid_settings_are_rejected(client, new_account, bad):
    _, _, phone = await new_account()
    headers = await _headers(client, phone)

    response = await client.put("/api/settings", json=DEFAULTS | bad, headers=headers)

    assert response.status_code == 422
    assert list(response.json()["fields"]) == list(bad)
    assert (await client.get("/api/settings", headers=headers)).json() == DEFAULTS


@pytest.mark.parametrize("role", ["warehouse", "seller"])
@pytest.mark.parametrize("path", ["/api/settings", "/api/audit-logs", "/api/locations", "/api/users"])
async def test_owner_only_pages_are_closed_to_other_roles(client, new_account, role, path):
    _, _, phone = await new_account(role=role)

    response = await client.get(path, headers=await _headers(client, phone))

    assert (response.status_code, response.json()["code"]) == (403, "forbidden")


async def test_settings_of_one_business_do_not_affect_another(browser, new_account):
    _, _, phone_a = await new_account()
    _, _, phone_b = await new_account()
    a, b = browser(), browser()

    changed = await a.put(
        "/api/settings",
        json=DEFAULTS | {"autolock_minutes": 5},
        headers=await _headers(a, phone_a),
    )

    assert changed.status_code == 200
    assert (await b.get("/api/settings", headers=await _headers(b, phone_b))).json() == DEFAULTS


# ---------- Jurnal ----------


async def test_journal_shows_events_newest_first_with_user_and_location(
    client, new_account, new_location
):
    business_id, user_id, phone = await new_account()
    store_id = await new_location(business_id, name="Chorsu do'koni")
    headers = await _headers(client, phone)
    async with tenant_session(business_id) as s:
        log_event(
            s,
            business_id=business_id,
            user_id=user_id,
            location_id=store_id,
            category="sale",
            event_code="sale.created",
            data={"total": 150000},
        )

    items = (await _journal(client, headers))["items"]

    assert [i["event_code"] for i in items] == ["sale.created", "login.success"]
    assert items[0]["user"]["full_name"] == "Test Xodim"
    assert items[0]["location"] == {"id": store_id, "name": "Chorsu do'koni", "type": "store"}
    assert items[0]["data"] == {"total": 150000}
    assert items[1]["location"] is None


async def test_journal_filters(client, new_account, new_user, new_location):
    business_id, owner_id, phone = await new_account()
    seller_id = await new_user(business_id, role="seller")
    store_id = await new_location(business_id)
    headers = await _headers(client, phone)
    async with tenant_session(business_id) as s:
        log_event(
            s,
            business_id=business_id,
            user_id=seller_id,
            location_id=store_id,
            category="sale",
            event_code="sale.created",
        )
        log_event(
            s,
            business_id=business_id,
            user_id=owner_id,
            category="price",
            event_code="price.changed",
        )

    async def codes(**params) -> list[str]:
        return [i["event_code"] for i in (await _journal(client, headers, **params))["items"]]

    assert await codes(category="sale") == ["sale.created"]
    assert await codes(user_id=seller_id) == ["sale.created"]
    assert await codes(location_id=store_id) == ["sale.created"]
    assert await codes(user_id=owner_id, category="price") == ["price.changed"]
    assert len(await codes(date_from="2020-01-01", date_to="2099-12-31")) == 3
    assert await codes(date_to="2020-01-01") == []
    assert await codes(date_from="2099-01-01") == []
    bad = await client.get("/api/audit-logs", params={"category": "boshqa"}, headers=headers)
    assert bad.status_code == 422


async def test_journal_is_paged_with_cursor(client, new_account):
    business_id, _, phone = await new_account()
    headers = await _headers(client, phone)
    # Bitta tranzaksiyada — vaqti bir xil yozuvlar ham to'g'ri tartibda va takrorsiz chiqishi kerak
    async with tenant_session(business_id) as s:
        for n in range(1, 6):
            log_event(s, business_id=business_id, category="stock", event_code=f"sinov.{n}")
            await s.flush()

    seen, cursor = [], None
    for _ in range(5):
        params = {"category": "stock", "limit": 2} | ({"cursor": cursor} if cursor else {})
        page = await _journal(client, headers, **params)
        seen += [i["event_code"] for i in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break

    assert seen == ["sinov.5", "sinov.4", "sinov.3", "sinov.2", "sinov.1"]
    broken = await client.get("/api/audit-logs", params={"cursor": "buzuq"}, headers=headers)
    assert (broken.status_code, broken.json()["code"]) == (400, "invalid_cursor")


async def test_journal_shows_only_own_business(browser, new_account):
    business_a, _, phone_a = await new_account()
    _, _, phone_b = await new_account()
    a, b = browser(), browser()
    headers_a, headers_b = await _headers(a, phone_a), await _headers(b, phone_b)
    async with tenant_session(business_a) as s:
        log_event(s, business_id=business_a, category="sale", event_code="faqat.a")

    assert "faqat.a" in [i["event_code"] for i in (await _journal(a, headers_a))["items"]]
    assert "faqat.a" not in [i["event_code"] for i in (await _journal(b, headers_b))["items"]]


# ---------- Tanlov ro'yxatlari ----------


async def test_location_and_user_lists_show_only_own_business(
    client, new_account, new_user, new_location
):
    business_id, owner_id, phone = await new_account()
    other_business, _, _ = await new_account()
    store = await new_location(business_id, name="Chorsu do'koni")
    warehouse = await new_location(business_id, type="warehouse", name="Asosiy sklad")
    closed = await new_location(business_id, name="Yopilgan do'kon", is_active=False)
    await new_location(other_business, name="Begona do'kon")
    seller = await new_user(business_id, role="seller", full_name="Aziz Sotuvchi", is_active=False)
    headers = await _headers(client, phone)

    async def location_ids(**params) -> list[int]:
        response = await client.get("/api/locations", params=params, headers=headers)
        return [row["id"] for row in response.json()]

    assert await location_ids() == [store, warehouse]
    assert await location_ids(type="store") == [store]
    assert await location_ids(type="store", include_inactive=True) == [store, closed]

    users = (await client.get("/api/users", headers=headers)).json()
    assert {u["id"] for u in users} == {owner_id, seller}
    listed = next(u for u in users if u["id"] == seller)
    assert (listed["full_name"], listed["role"], listed["is_active"]) == (
        "Aziz Sotuvchi",
        "seller",
        False,
    )


async def test_journal_can_leave_out_a_category(client, new_account):
    """Kirish-chiqish yozuvlari ko'p — jurnal standart holatda ularsiz ochiladi (`exclude_category=login`)."""
    business_id, user_id, phone = await new_account()
    headers = await _headers(client, phone)  # "login.success" yozildi
    async with tenant_session(business_id) as s:
        log_event(
            s, business_id=business_id, user_id=user_id, category="sale", event_code="sale.created", data={}
        )

    everything = (await _journal(client, headers))["items"]
    assert {entry["category"] for entry in everything} == {"login", "sale"}

    quiet = (await _journal(client, headers, exclude_category="login"))["items"]
    assert [entry["event_code"] for entry in quiet] == ["sale.created"]

    # Sahifalashda ham istisno saqlanadi; noto'g'ri qiymat — 422
    paged = await _journal(client, headers, exclude_category="login", limit=1)
    assert [entry["category"] for entry in paged["items"]] == ["sale"] and paged["next_cursor"] is None
    bad = await client.get("/api/audit-logs", params={"exclude_category": "boshqa"}, headers=headers)
    assert bad.status_code == 422
