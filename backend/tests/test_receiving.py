"""04-kirim: kirim hujjati, partiyalar, skladdagi qoldiq, tuzatish va bekor qilish."""
import asyncio
from datetime import timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import delete, update
from sqlalchemy.exc import DBAPIError

from app.core.db import system_session
from app.modules.inventory.models import StockMovement
from tests.conftest import PASSWORD
from tests.shop import TODAY, TODAY_DATE, login


async def _headers(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    return await login(client, phone, PASSWORD)


# ---------- Kirim yaratish ----------


async def test_receipt_creates_batches_and_puts_meters_into_the_warehouse(shop):
    s = await shop()

    created = await s.receive(
        s.line(0, rolls_count=10, meters="500.5", kg="125.125"),
        s.line(1, rolls_count=4, meters="200", cost_per_m=45000, pattern_id=s.pattern),
        note=" Dushanba yuki ",
    )
    assert created.status_code == 201, created.text
    card = await s.card(created.json()["id"])

    assert (card["number"], card["note"], card["status"]) == ("KR-00001", "Dushanba yuki", "active")
    assert (card["warehouse"]["name"], card["created_by"]["name"]) == ("Asosiy sklad", "Akmal Ega")
    first, second = card["lines"]
    assert [(b["number"], b["sku"]["code"]) for b in card["lines"]] == [
        ("P-000001", "M101-01"),  # SKU katalogda yo'q edi — kirim o'zi yaratdi
        ("P-000002", "M101-02-G1"),
    ]
    assert (first["rolls_count"], first["meters_labeled"], first["kg"]) == (10, "500.50", "125.125")
    assert (first["amount"], second["amount"]) == (15_015_000, 9_000_000)
    assert (card["total_m"], card["total_amount"]) == ("700.50", 24_015_000)
    assert (first["qty_m"], first["has_movement"], first["can_edit"]) == ("500.50", False, True)

    assert await s.stock(first["id"]) == (Decimal("500.50"), Decimal("500.50"))
    assert await s.movements(second["id"]) == [("receipt", Decimal("200.00"))]
    assert [(e["event_code"], e["data"], e["location"]["name"]) for e in await s.events()] == [
        ("receipt.created", {"name": "KR-00001", "batches": 2, "meters": "700.50"}, "Asosiy sklad")
    ]


async def test_coefficient_comes_from_kg_then_from_the_line_then_from_the_fabric(shop):
    s = await shop()
    created = await s.receive(
        s.line(0, meters="500", kg="100", m_per_kg="9"),  # ikkalasi bor — metr ÷ kg
        s.line(0, meters="500", m_per_kg="4.5"),  # kg yo'q — qatorda kiritilgani
        s.line(0, meters="500"),  # hech biri yo'q — matoning standarti
        s.line(0, meters="100", kg="3"),  # yaxlitlash: 33.3333
    )
    lines = (await s.card(created.json()["id"]))["lines"]
    assert [b["m_per_kg"] for b in lines] == ["5.0000", "4.5000", "4.0000", "33.3333"]


async def test_price_can_be_set_while_receiving(shop):
    s = await shop()
    created = await s.receive(s.line(0, price=55000, price_unit="m"), s.line(1))
    priced, untouched = (await s.card(created.json()["id"]))["lines"]

    assert (priced["sku"]["price"], priced["sku"]["price_unit"]) == (55000, "m")
    assert untouched["sku"]["price"] is None
    sku = await s.client.get(f"/api/catalog/skus/{priced['sku']['id']}", headers=s.headers)
    assert [(h["old_price"], h["new_price"]) for h in sku.json()["history"]] == [(None, 55000)]
    prices = await s.client.get("/api/audit-logs", params={"category": "price"}, headers=s.headers)
    assert [e["event_code"] for e in prices.json()["items"]] == ["sku.price_changed"]


async def test_numbers_are_continuous_and_separate_per_business(shop):
    first, second = await shop(), await shop()

    await first.receive(first.line(0), first.line(1))
    again = await first.receive(first.line(0))
    other = await second.receive(second.line(0))

    assert [b["number"] for b in (await first.card(again.json()["id"]))["lines"]] == ["P-000003"]
    card = await second.card(other.json()["id"])
    assert (card["number"], card["lines"][0]["number"]) == ("KR-00001", "P-000001")


async def test_simultaneous_receipts_never_share_a_number(shop):
    s = await shop()
    responses = await asyncio.gather(*(s.receive(s.line(0), s.line(1)) for _ in range(5)))
    assert {r.status_code for r in responses} == {201}

    cards = [await s.card(r.json()["id"]) for r in responses]
    numbers = [b["number"] for card in cards for b in card["lines"]]
    assert sorted(numbers) == [f"P-{n:06d}" for n in range(1, 11)]
    assert sorted(card["number"] for card in cards) == [f"KR-{n:05d}" for n in range(1, 6)]


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"meters": "0"}, "meters"),
        ({"meters": "10.123"}, "meters"),
        ({"rolls_count": 0}, "rolls_count"),
        ({"kg": "0"}, "kg"),
        ({"cost_per_m": -1}, "cost_per_m"),
        ({"fabric_id": 999_999}, "fabric_id"),
        ({"color_id": 999_999}, "color_id"),
        ({"pattern_id": 999_999}, "pattern_id"),
    ],
)
async def test_line_validation(shop, change, field):
    s = await shop()
    response = await s.receive(s.line(0, **change))
    assert response.status_code == 422
    assert field in response.json()["fields"]


async def test_receipt_validation(shop, new_location):
    s = await shop()
    store = await new_location(s.business_id, "store", name="Do'kon")
    tomorrow = (TODAY_DATE + timedelta(days=2)).isoformat()

    to_store = await s.receive(warehouse_id=store)  # kirim faqat skladga
    assert to_store.json()["fields"] == {"warehouse_id": "invalid"}
    assert (await s.receive(receipt_date=tomorrow)).json()["fields"] == {"receipt_date": "future"}
    empty = await s.client.post(
        "/api/receipts",
        json={"warehouse_id": s.warehouse, "receipt_date": TODAY, "lines": []},
        headers=s.headers,
    )
    assert empty.status_code == 422

    # Hech narsa yozilmadi va raqamlar sarflanmadi
    assert (await s.card((await s.receive()).json()["id"]))["number"] == "KR-00001"


async def test_inactive_catalog_items_cannot_be_received(shop):
    s = await shop()
    created = await s.receive(s.line(0))
    sku = (await s.card(created.json()["id"]))["lines"][0]["sku"]["id"]

    await s.client.post(f"/api/catalog/skus/{sku}/deactivate", headers=s.headers)
    inactive_sku = await s.receive(s.line(0))
    assert (inactive_sku.status_code, inactive_sku.json()["code"]) == (409, "sku_inactive")

    await s.client.post(f"/api/catalog/colors/{s.colors[1]}/deactivate", headers=s.headers)
    assert (await s.receive(s.line(1))).json()["fields"] == {"color_id": "invalid"}


# ---------- Ro'yxat ----------


async def test_list_shows_totals_and_filters(shop, keeper, new_location):
    s = await shop()
    second_warehouse = await new_location(s.business_id, "warehouse", name="Ikkinchi sklad")
    week_ago = (TODAY_DATE - timedelta(days=7)).isoformat()
    dilshod = await keeper(s)

    await s.receive(s.line(0), s.line(1, meters="100", cost_per_m=10000))
    await s.receive(s.line(0), receipt_date=week_ago, warehouse_id=second_warehouse)
    await s.receive(s.line(0), headers=dilshod)

    async def rows(**params) -> list[dict]:
        page = await s.client.get("/api/receipts", params=params, headers=s.headers)
        return page.json()["items"]

    everything = await rows()
    assert [(r["number"], r["batches_count"], r["total_m"], r["total_amount"]) for r in everything] == [
        ("KR-00003", 1, "500.00", 15_000_000),
        ("KR-00001", 2, "600.00", 16_000_000),
        ("KR-00002", 1, "500.00", 15_000_000),  # sanasi eskiroq — pastda
    ]
    assert [r["number"] for r in await rows(warehouse_id=second_warehouse)] == ["KR-00002"]
    assert [r["number"] for r in await rows(date_from=TODAY)] == ["KR-00003", "KR-00001"]
    assert [r["number"] for r in await rows(date_to=week_ago)] == ["KR-00002"]
    by_dilshod = [r for r in everything if r["created_by"]["name"] == "Dilshod Omborchi"]
    assert [r["number"] for r in await rows(created_by=by_dilshod[0]["created_by"]["id"])] == ["KR-00003"]

    page = (await s.client.get("/api/receipts", params={"limit": 1, "offset": 1}, headers=s.headers)).json()
    assert (page["total"], [r["number"] for r in page["items"]]) == (3, ["KR-00001"])

    options = (await s.client.get("/api/receipts/options", headers=s.headers)).json()
    assert [w["name"] for w in options["warehouses"]] == ["Asosiy sklad", "Ikkinchi sklad"]
    assert [c["name"] for c in options["creators"]] == ["Akmal Ega", "Dilshod Omborchi"]


# ---------- Omborchi: faqat o'z skladlari ----------


async def test_keeper_works_only_with_assigned_warehouses(shop, keeper, new_location):
    s = await shop()
    other = await new_location(s.business_id, "warehouse", name="Begona sklad")
    foreign = await s.receive(warehouse_id=other)
    dilshod = await keeper(s, [s.warehouse])

    mine = await s.receive(headers=dilshod)
    assert mine.status_code == 201
    denied = await s.receive(warehouse_id=other, headers=dilshod)
    assert (denied.status_code, denied.json()["code"]) == (403, "location_forbidden")

    listed = (await s.client.get("/api/receipts", headers=dilshod)).json()
    assert [r["warehouse"]["name"] for r in listed["items"]] == ["Asosiy sklad"]
    hidden = await s.client.get(f"/api/receipts/{foreign.json()['id']}", headers=dilshod)
    assert hidden.status_code == 404
    options = (await s.client.get("/api/receipts/options", headers=dilshod)).json()
    assert [w["name"] for w in options["warehouses"]] == ["Asosiy sklad"]


async def test_seller_and_strangers_have_no_access(shop, client, new_account):
    s = await shop()
    receipt = (await s.receive()).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]
    _, _, seller_phone = await new_account(role="seller")
    seller = await _headers(client, seller_phone)
    stranger = (await shop()).headers
    edit = {"rolls_count": 1, "meters": "1", "cost_per_m": 1}

    assert (await client.get("/api/receipts", headers=seller)).status_code == 403
    assert (await client.post("/api/receipts", json={}, headers=seller)).status_code == 403
    assert (await client.get("/api/receipts")).status_code == 401
    # Boshqa biznes: bu kirim va partiya u uchun mavjud emas
    assert (await client.get(f"/api/receipts/{receipt}", headers=stranger)).status_code == 404
    assert (await client.patch(f"/api/batches/{batch}", json=edit, headers=stranger)).status_code == 404
    assert (await client.post(f"/api/receipts/{receipt}/cancel", headers=stranger)).status_code == 404
    assert (await client.get("/api/receipts", headers=stranger)).json()["total"] == 0
    assert await s.stock(batch) == (Decimal("500.00"), Decimal("500.00"))


# ---------- Tuzatish ----------


async def test_fixing_meters_corrects_the_stock_and_is_journaled(shop):
    s = await shop()
    receipt = (await s.receive(s.line(0, meters="5000", kg="1000"))).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]

    fixed = await s.client.patch(
        f"/api/batches/{batch}",
        json={"rolls_count": 10, "meters": "500", "kg": "100", "cost_per_m": 32000},
        headers=s.headers,
    )
    assert fixed.status_code == 204

    line = (await s.card(receipt))["lines"][0]
    assert (line["meters_labeled"], line["kg"], line["m_per_kg"], line["cost_per_m"]) == (
        "500.00", "100.000", "5.0000", 32000,
    )  # fmt: skip
    assert await s.stock(batch) == (Decimal("500.00"), Decimal("500.00"))
    assert await s.movements(batch) == [
        ("receipt", Decimal("5000.00")),
        ("correction", Decimal("-4500.00")),
    ]
    event = (await s.events())[0]
    assert (event["event_code"], event["data"]["name"]) == ("batch.updated", "P-000001")
    assert event["data"]["changes"] == {
        "meters_labeled": {"old": "5000.00", "new": "500.00"},
        "kg": {"old": "1000.000", "new": "100.000"},
        "cost_per_m": {"old": 30000, "new": 32000},
    }

    # O'zgarish bo'lmasa — jurnalga ham, harakatlarga ham hech narsa yozilmaydi
    same = {"rolls_count": 10, "meters": "500.00", "kg": "100.000", "cost_per_m": 32000}
    assert (await s.client.patch(f"/api/batches/{batch}", json=same, headers=s.headers)).status_code == 204
    assert len(await s.events()) == 2
    assert len(await s.movements(batch)) == 2


async def test_wrong_item_can_be_replaced_until_the_batch_moves(shop):
    s = await shop()
    receipt = (await s.receive(s.line(0))).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]
    body = {
        "sku": {"fabric_id": s.fabric, "color_id": s.colors[1], "pattern_id": s.pattern},
        "rolls_count": 10, "meters": "500", "cost_per_m": 30000,
    }  # fmt: skip

    assert (await s.client.patch(f"/api/batches/{batch}", json=body, headers=s.headers)).status_code == 204
    assert (await s.card(receipt))["lines"][0]["sku"]["code"] == "M101-02-G1"
    assert (await s.events())[0]["data"]["changes"] == {"sku": {"old": "M101-01", "new": "M101-02-G1"}}

    await s.sell(batch)
    body["sku"] = {"fabric_id": s.fabric, "color_id": s.colors[0]}
    locked = await s.client.patch(f"/api/batches/{batch}", json=body, headers=s.headers)
    assert (locked.status_code, locked.json()["code"]) == (409, "batch_has_movement")


async def test_after_a_sale_only_the_owner_can_fix_the_batch(shop, keeper):
    s = await shop()
    dilshod, zafar = await keeper(s), await keeper(s)
    receipt = (await s.receive(headers=dilshod)).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]
    body = {"rolls_count": 9, "meters": "450", "cost_per_m": 30000}

    async def fix(headers) -> httpx.Response:
        return await s.client.patch(f"/api/batches/{batch}", json=body, headers=headers)

    # Harakatsiz partiyani faqat kiritgan omborchi (yoki ega) tuzatadi
    stranger = await fix(zafar)
    assert (stranger.status_code, stranger.json()["code"]) == (403, "receipt_locked")
    assert (await fix(dilshod)).status_code == 204

    await s.sell(batch, "-20")
    assert (await s.card(receipt, dilshod))["lines"][0]["can_edit"] is False
    assert (await fix(dilshod)).status_code == 403

    body["meters"] = "460"
    assert (await fix(s.headers)).status_code == 204  # biznes egasi
    line = (await s.card(receipt))["lines"][0]
    assert (line["has_movement"], line["can_edit"], line["qty_m"]) == (True, True, "440.00")
    assert await s.stock(batch) == (Decimal("440.00"), Decimal("460.00"))


async def test_receipt_date_and_note_can_be_fixed(shop, keeper):
    s = await shop()
    dilshod, zafar = await keeper(s), await keeper(s)
    receipt = (await s.receive(headers=dilshod)).json()["id"]
    yesterday = (TODAY_DATE - timedelta(days=1)).isoformat()
    body = {"receipt_date": yesterday, "note": "Kecha kelgan"}

    assert (await s.client.patch(f"/api/receipts/{receipt}", json=body, headers=zafar)).status_code == 403
    assert (await s.client.patch(f"/api/receipts/{receipt}", json=body, headers=dilshod)).status_code == 204
    card = await s.card(receipt)
    assert (card["receipt_date"], card["note"]) == (yesterday, "Kecha kelgan")
    assert (await s.events())[0]["event_code"] == "receipt.updated"


# ---------- Bekor qilish ----------


async def test_owner_cancels_an_untouched_receipt(shop, keeper):
    s = await shop()
    dilshod = await keeper(s)
    receipt = (await s.receive(s.line(0), s.line(1), headers=dilshod)).json()["id"]
    first, second = (line["id"] for line in (await s.card(receipt))["lines"])

    forbidden = await s.client.post(f"/api/receipts/{receipt}/cancel", headers=dilshod)
    assert forbidden.status_code == 403  # omborchi bekor qila olmaydi
    assert (await s.client.post(f"/api/receipts/{receipt}/cancel", headers=s.headers)).status_code == 204

    card = await s.card(receipt)
    assert (card["status"], card["cancelled_by"]["name"], card["can_cancel"], card["can_edit"]) == (
        "cancelled", "Akmal Ega", False, False,
    )  # fmt: skip
    assert [line["can_edit"] for line in card["lines"]] == [False, False]
    assert await s.stock(first) == (Decimal("0.00"), Decimal("0.00"))
    assert await s.movements(second) == [
        ("receipt", Decimal("500.00")),
        ("receipt_cancel", Decimal("-500.00")),
    ]
    assert (await s.events())[0]["event_code"] == "receipt.cancelled"

    # Bekor qilingan kirim qaytadan bekor qilinmaydi va tuzatilmaydi
    again = await s.client.post(f"/api/receipts/{receipt}/cancel", headers=s.headers)
    edit = await s.client.patch(
        f"/api/batches/{first}", json={"rolls_count": 1, "meters": "1", "cost_per_m": 1}, headers=s.headers
    )
    assert [(r.status_code, r.json()["code"]) for r in (again, edit)] == [(409, "receipt_cancelled")] * 2


async def test_receipt_with_sold_meters_cannot_be_cancelled(shop):
    s = await shop()
    receipt = (await s.receive(s.line(0), s.line(1))).json()["id"]
    batch = (await s.card(receipt))["lines"][1]["id"]
    await s.sell(batch)

    assert (await s.card(receipt))["can_cancel"] is False
    response = await s.client.post(f"/api/receipts/{receipt}/cancel", headers=s.headers)
    assert (response.status_code, response.json()["code"]) == (409, "batch_has_movement")
    assert (await s.card(receipt))["status"] == "active"


# ---------- Baza kafolatlari ----------


async def test_stock_movements_can_never_be_changed(shop):
    s = await shop()
    receipt = (await s.receive()).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]

    for statement in (
        update(StockMovement).where(StockMovement.batch_id == batch).values(qty_m=1),
        delete(StockMovement).where(StockMovement.batch_id == batch),
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            async with system_session() as session:  # jadval egasi ham o'zgartira olmaydi
                await session.execute(statement)
    assert await s.movements(batch) == [("receipt", Decimal("500.00"))]


async def test_stock_always_equals_the_sum_of_movements(shop):
    s = await shop()
    receipt = (await s.receive(s.line(0, meters="1000"))).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]

    # Bir vaqtda 10 ta "sotuv" — qator qulflangani uchun birortasi yo'qolmaydi
    await asyncio.gather(*(s.sell(batch, "-7.25") for _ in range(10)))

    qty, received = await s.stock(batch)
    assert (qty, received) == (Decimal("927.50"), Decimal("1000.00"))
    assert sum(q for _, q in await s.movements(batch)) == qty
