"""06-sotuv: sotuv ekrani, sotuvni yozish, nasiya, bekor qilish, qaytarish, ro'yxat."""
import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select, update

from app.core.db import system_session
from app.modules.credit.models import Debt
from app.modules.sales.models import Sale
from tests.conftest import PASSWORD
from tests.shop import TODAY_DATE, login

D = Decimal


async def _inbox(s, headers=None) -> list[dict]:
    response = await s.client.get("/api/notifications", headers=headers or s.headers)
    return response.json()["items"]


async def _set(s, **settings) -> None:
    current = (await s.client.get("/api/settings", headers=s.headers)).json()
    saved = await s.client.put("/api/settings", json={**current, **settings}, headers=s.headers)
    assert saved.status_code == 200, saved.text


async def _price(s, batch: int, price: int | None, unit: str = "m") -> None:
    """Partiyaning SKU'siga tavsiya narx qo'yadi."""
    card = (await s.client.get(f"/api/batches/{batch}", headers=s.headers)).json()
    await s.client.patch(
        f"/api/catalog/skus/{card['sku']['id']}", json={"price": price, "price_unit": unit}, headers=s.headers
    )


# ====================== Sotuv ekrani ======================


async def test_sale_screen_lists_what_the_store_can_sell(shop, seller, keeper):
    s = await shop()
    old = await s.in_store(0, "200")  # M101-01, do'konda 200 m, koeffitsient 4 (matodan)
    new = await s.in_store(0, "100", 2)
    other = await s.in_store(1, "50", 1, kg="125")  # 500 m / 125 kg = 4 m/kg
    await _price(s, old, 45000)
    await _price(s, other, 240_000, "kg")
    nodira = await seller(s)

    context = (await s.client.get("/api/sales/context", headers=nodira)).json()

    assert (context["store"]["name"], context["sell_by_kg"], context["credit_enabled"]) == (
        "Chorsu do'koni", True, True,
    )  # fmt: skip
    red, blue = context["items"]
    assert (red["sku"]["code"], [b["id"] for b in red["batches"]]) == ("M101-01", [old, new])  # eskisi birinchi
    assert [(b["qty_m"], b["m_per_kg"], b["recommended_price_per_m"]) for b in red["batches"]] == [
        ("200.00", "4.0000", 45000), ("100.00", "4.0000", 45000),
    ]  # fmt: skip
    # Narx kg da: 240 000 ÷ 4 m = 60 000 so'm / m
    assert blue["batches"][0]["recommended_price_per_m"] == 60000
    assert "cost" not in str(context)  # tannarx sotuvchiga yuborilmaydi

    # Biznes egasi do'konni o'zi tanlaydi; omborchi sotmaydi
    assert (await s.client.get("/api/sales/context", headers=s.headers)).json()["fields"] == {
        "store_id": "required"
    }
    mine = await s.client.get("/api/sales/context", params={"store_id": s.store}, headers=s.headers)
    assert len(mine.json()["items"]) == 2
    assert (await s.client.get("/api/sales/context", headers=await keeper(s))).status_code == 403


async def test_kg_price_is_rounded_as_the_business_wants(shop):
    s = await shop()
    batch = await s.in_store(0, "200", kg="178.5")  # 500 ÷ 178.5 = 2.8011 m/kg
    await _price(s, batch, 240_000, "kg")

    async def recommended() -> int:
        context = await s.client.get("/api/sales/context", params={"store_id": s.store}, headers=s.headers)
        return context.json()["items"][0]["batches"][0]["recommended_price_per_m"]

    assert await recommended() == 86000  # 85 680.6 → 1 000 gacha
    await _set(s, price_rounding=100)
    assert await recommended() == 85700
    await _set(s, price_rounding=1)
    assert await recommended() == 85681


async def test_seller_needs_a_store_device(shop, client, new_user):
    from app.core.security import hash_password
    from tests.conftest import random_phone

    s = await shop()
    phone = random_phone()
    await new_user(s.business_id, role="seller", phone=phone, password_hash=hash_password(PASSWORD))
    without_device = await login(client, phone, PASSWORD)

    response = await s.client.get("/api/sales/context", headers=without_device)
    assert (response.status_code, response.json()["code"]) == (403, "store_required")


# ====================== Sotuvni yozish ======================


async def test_sale_takes_meters_from_the_batch_and_keeps_a_snapshot(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "200", cost_per_m=30000)
    await _price(s, batch, 45000)
    nodira = await seller(s)

    created = await s.sell_to((batch, "2.35", 44000), headers=nodira)

    assert created.status_code == 201, created.text
    assert created.json() == {
        "id": created.json()["id"], "number": "S-000001", "total": 103_400,
        "payment_type": "cash", "duplicate": False,
    }  # fmt: skip
    assert await s.stock(batch, s.store) == (D("197.65"), D("200.00"))
    assert (await s.movements(batch))[-1] == ("sale", D("-2.35"))

    card = await s.sale(created.json()["id"], nodira)
    assert (card["store"]["name"], card["seller"]["name"], card["status"]) == (
        "Chorsu do'koni", "Nodira Sotuvchi", "completed",
    )  # fmt: skip
    line = card["lines"][0]
    assert (line["sku_label"], line["batch_number"], line["meters"], line["kg"]) == (
        "M101-01 · Atlas · Rang 01", "P-000001", "2.35", "0.588",
    )  # fmt: skip
    assert (line["price_per_m"], line["recommended_price_per_m"], line["amount"]) == (44000, 45000, 103_400)
    # Tannarx va foyda faqat biznes egasiga
    assert (line["cost_per_m"], card["profit"]) == (None, None)
    owner_view = await s.sale(created.json()["id"])
    assert (owner_view["lines"][0]["cost_per_m"], owner_view["profit"]) == (30000, 32_900)

    event = (await s.events("sale", category="sale"))[0]
    assert (event["event_code"], event["data"], event["location"]["name"]) == (
        "sale.created", {"name": "S-000001", "total": 103_400, "payment": "cash"}, "Chorsu do'koni",
    )  # fmt: skip
    async with system_session() as db:
        assert (await db.get(Sale, created.json()["id"])).device_id is not None


async def test_names_and_prices_are_frozen_at_sale_time(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    await _price(s, batch, 45000)
    sale = (await s.sell_to((batch, "10", 45000))).json()["id"]

    # Keyin katalogda nom va narx, kirimda tannarx o'zgaradi
    await s.client.patch(
        f"/api/catalog/fabrics/{s.fabric}", json={"code": "M101", "name": "Yangi nom"}, headers=s.headers
    )
    await _price(s, batch, 99000)
    await s.client.patch(
        f"/api/batches/{batch}", json={"rolls_count": 10, "meters": "500", "cost_per_m": 40000}, headers=s.headers
    )

    line = (await s.sale(sale))["lines"][0]
    assert (line["sku_label"], line["recommended_price_per_m"], line["cost_per_m"]) == (
        "M101-01 · Atlas · Rang 01", 45000, 30000,
    )  # fmt: skip


async def test_the_same_basket_is_recorded_once(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    basket = str(uuid.uuid4())

    first = await s.sell_to((batch, "10", 45000), client_uuid=basket)
    again = await s.sell_to((batch, "10", 45000), client_uuid=basket)  # internet uzilib, qayta yuborildi

    assert (first.status_code, again.status_code) == (201, 200)
    assert (again.json()["id"], again.json()["duplicate"]) == (first.json()["id"], True)
    assert await s.stock(batch, s.store) == (D("190.00"), D("200.00"))

    # Bir vaqtda kelgan takrorlar ham bitta sotuv bo'ladi
    rush = str(uuid.uuid4())
    results = await asyncio.gather(*(s.sell_to((batch, "5", 45000), client_uuid=rush) for _ in range(4)))
    assert {r.json()["id"] for r in results} == {results[0].json()["id"]}
    assert await s.stock(batch, s.store) == (D("185.00"), D("200.00"))
    listed = await s.client.get("/api/sales", headers=s.headers)
    assert [row["number"] for row in listed.json()["items"]] == ["S-000002", "S-000001"]  # raqamda bo'shliq yo'q


async def test_a_changed_basket_under_the_same_id_is_refused(shop):
    """Savat yozilgandan keyin o'zgartirilib o'sha identifikator bilan kelsa — jimgina eski sotuv qaytmaydi."""
    s = await shop()
    batch, other = await s.in_store(0, "200"), await s.in_store(1, "200")
    basket = str(uuid.uuid4())
    first = await s.sell_to((batch, "10", 45000), client_uuid=basket)
    assert first.status_code == 201

    changed = [
        await s.sell_to((batch, "10", 45000), (other, "5", 30000), client_uuid=basket),  # tovar qo'shildi
        await s.sell_to((batch, "12", 45000), client_uuid=basket),  # metr
        await s.sell_to((batch, "10", 40000), client_uuid=basket),  # narx
        await s.sell_to((batch, "10", 45000), client_uuid=basket, payment_type="card"),  # to'lov turi
    ]
    for response in changed:
        assert response.status_code == 409, response.text
        assert response.json()["code"] == "sale_basket_changed"
        assert response.json()["number"] == first.json()["number"]
    # Hech narsa qo'shimcha yozilmadi
    assert await s.stock(batch, s.store) == (D("190.00"), D("200.00"))
    assert await s.stock(other, s.store) == (D("200.00"), D("200.00"))

    # Aynan o'sha savat (metr boshqacha yozilgan bo'lsa ham: 10 = 10.00) — avvalgidek takror
    same = await s.sell_to((batch, "10.00", 45000), client_uuid=basket)
    assert (same.status_code, same.json()["duplicate"]) == (200, True)


async def test_a_repeated_credit_basket_is_still_a_duplicate(shop):
    """Nasiya savat (boshlang'ich to'lov bilan, shu jumladan to'liq to'langan) qayta kelsa — o'sha sotuv."""
    s = await shop()
    batch = await s.in_store(0, "200")
    customer = await s.customer()
    for initial in (100_000, 450_000):  # 450 000 = jami: sotuv "naqd" bo'lib yoziladi
        fields = {
            "client_uuid": str(uuid.uuid4()), "payment_type": "credit", "customer_id": customer,
            "initial_payment": initial, "initial_payment_method": "cash",
        }  # fmt: skip
        first = await s.sell_to((batch, "10", 45000), **fields)
        again = await s.sell_to((batch, "10", 45000), **fields)
        assert (first.status_code, again.status_code) == (201, 200), again.text
        assert again.json()["id"] == first.json()["id"]
        other = await s.sell_to((batch, "10", 45000), **{**fields, "initial_payment": 50_000})
        assert other.status_code == 409 and other.json()["code"] == "sale_basket_changed"


async def test_selling_more_than_recorded_needs_a_note(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "50", 1)
    nodira = await seller(s)

    refused = await s.sell_to((batch, "52", 45000), headers=nodira)
    assert (refused.status_code, refused.json()["code"], refused.json()["available"]) == (
        409, "negative_stock_note_required", "50.00",
    )  # fmt: skip
    assert await s.stock(batch, s.store) == (D("50.00"), D("50.00"))

    allowed = await s.sell_to((batch, "52", 45000, "Rulon 52 m chiqdi"), headers=nodira)
    assert allowed.status_code == 201
    assert await s.stock(batch, s.store) == (D("-2.00"), D("50.00"))
    assert (await s.sale(allowed.json()["id"]))["lines"][0]["negative_stock_note"] == "Rulon 52 m chiqdi"
    alerts = [n for n in await _inbox(s) if n["event_code"] == "sale.negative_stock"]
    assert [a["data"] for a in alerts] == [
        {
            "sale_id": allowed.json()["id"], "number": "S-000001", "batch": "P-000001",
            "store": "Chorsu do'koni", "note": "Rulon 52 m chiqdi", "by": "Nodira Sotuvchi",
        }
    ]  # fmt: skip
    # Qoldiq yetarli bo'lsa, izoh saqlanmaydi
    enough = await s.in_store(1, "50", 1)
    plain = await s.sell_to((enough, "10", 45000, "keraksiz izoh"), headers=nodira)
    assert (await s.sale(plain.json()["id"]))["lines"][0]["negative_stock_note"] is None


async def test_two_lines_of_one_batch_share_its_stock(shop):
    s = await shop()
    batch = await s.in_store(0, "50", 1)

    both = await s.sell_to((batch, "30", 45000), (batch, "30", 45000))  # jami 60 > 50

    assert (both.status_code, both.json()["available"], both.json()["line"]) == (409, "20.00", 1)


async def test_cannot_sell_a_closed_or_absent_batch(shop):
    s = await shop()
    here, elsewhere = await s.in_store(0, "50", 1), await s.batch(1)  # ikkinchisi faqat skladda
    await s.client.post(f"/api/batches/{here}/close", json={"location_id": s.store}, headers=s.headers)

    closed = await s.sell_to((here, "1", 45000))
    absent = await s.sell_to((elsewhere, "1", 45000))
    unknown = await s.sell_to((999_999, "1", 45000))
    assert [(r.status_code, r.json()["code"]) for r in (closed, absent, unknown)] == [
        (409, "batch_closed"), (409, "batch_not_here"), (404, "batch_not_found"),
    ]  # fmt: skip


@pytest.mark.parametrize(
    ("line", "field"),
    [
        ({"meters": "0"}, "meters"),
        ({"meters": "1.234"}, "meters"),
        ({"price_per_m": 0}, "price_per_m"),
        ({"kg": "0"}, "kg"),
    ],
)
async def test_sale_line_validation(shop, line, field):
    s = await shop()
    batch = await s.in_store(0, "50", 1)
    body = {
        "client_uuid": str(uuid.uuid4()), "store_id": s.store, "payment_type": "cash",
        "lines": [{"batch_id": batch, "meters": "1", "price_per_m": 45000, **line}],
    }  # fmt: skip
    response = await s.client.post("/api/sales", json=body, headers=s.headers)
    assert response.status_code == 422 and field in response.json()["fields"]


# ====================== Nasiya ======================


async def test_credit_sale_opens_a_debt_for_the_customer(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    nodira = await seller(s)

    sold = await s.sell_to(
        (batch, "10", 45000), headers=nodira,
        payment_type="credit", customer_id=sardor, initial_payment=150_000, initial_payment_method="card",
    )  # fmt: skip

    assert sold.status_code == 201, sold.text
    card = await s.sale(sold.json()["id"], nodira)
    assert (card["payment_type"], card["customer"]["name"], card["total"]) == ("credit", "Sardor Usta", 450_000)
    assert (card["initial_payment"], card["initial_payment_method"]) == (150_000, "card")
    assert card["debt"] == {
        "amount": 300_000, "remaining": 300_000, "status": "active",
        "due_date": (TODAY_DATE + timedelta(days=30)).isoformat(),
    }  # fmt: skip
    # Sotuvchi mijozning hozirgi qarzini ko'radi
    found = await s.client.get("/api/customers/search", params={"q": "sardor"}, headers=nodira)
    assert [(c["name"], c["phone"], c["debt"]) for c in found.json()] == [
        ("Sardor Usta", "+998901234567", 300_000)
    ]


async def test_credit_sale_rules(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    credit = {"payment_type": "credit", "customer_id": sardor}

    no_customer = await s.sell_to((batch, "1", 45000), payment_type="credit")
    assert no_customer.json()["fields"] == {"customer_id": "required"}
    stranger = await s.sell_to((batch, "1", 45000), payment_type="credit", customer_id=999_999)
    assert stranger.json()["fields"] == {"customer_id": "invalid"}
    too_much = await s.sell_to((batch, "1", 45000), **credit, initial_payment=45001, initial_payment_method="cash")
    assert too_much.json()["fields"] == {"initial_payment": "too_large"}
    no_method = await s.sell_to((batch, "1", 45000), **credit, initial_payment=1000)
    assert no_method.json()["fields"] == {"initial_payment_method": "required"}
    assert await s.stock(batch, s.store) == (D("200.00"), D("200.00"))

    # Boshlang'ich to'lov jami summaga teng — bu nasiya emas, oddiy sotuv
    paid = await s.sell_to((batch, "1", 45000), **credit, initial_payment=45000, initial_payment_method="card")
    card = await s.sale(paid.json()["id"])
    assert (card["payment_type"], card["customer"], card["debt"], card["initial_payment"]) == ("card", None, None, 0)

    await _set(s, credit_enabled=False)
    disabled = await s.sell_to((batch, "1", 45000), **credit)
    assert (disabled.status_code, disabled.json()["code"]) == (409, "credit_disabled")


async def test_customers_quick_add_and_search(shop, keeper):
    s = await shop()
    await s.customer("Sardor Usta", "+998 90 123 45 67")
    await s.customer("Tikuv sexi", "+998935550011")

    async def find(q: str) -> list[str]:
        found = await s.client.get("/api/customers/search", params={"q": q}, headers=s.headers)
        return [c["name"] for c in found.json()]

    assert await find("") == ["Sardor Usta", "Tikuv sexi"]
    assert await find("tikuv") == ["Tikuv sexi"]
    assert await find("123 45") == ["Sardor Usta"]  # telefonning bir qismi

    same_phone = await s.client.post(
        "/api/customers", json={"name": "Boshqa", "phone": "+998901234567"}, headers=s.headers
    )
    assert (same_phone.status_code, same_phone.json()["code"], same_phone.json()["name"]) == (
        409, "customer_phone_taken", "Sardor Usta",
    )  # fmt: skip
    bad = await s.client.post("/api/customers", json={"name": "Boshqa", "phone": "12345"}, headers=s.headers)
    assert bad.json()["fields"] == {"phone": "invalid_phone"}
    assert (await s.client.get("/api/customers/search", headers=await keeper(s))).status_code == 403
    # Boshqa biznesda shu telefon bo'sh
    other = await shop()
    await other.customer("Sardor Usta", "+998901234567")


# ====================== Bekor qilish ======================


async def test_seller_cancels_own_fresh_sale(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    nodira = await seller(s)
    aziz = await seller(s, pin="5678")
    sale = (
        await s.sell_to((batch, "10", 45000), headers=nodira, payment_type="credit", customer_id=sardor)
    ).json()["id"]

    def cancel(headers, **body):
        return s.client.post(f"/api/sales/{sale}/cancel", json=body or {"reason": "Xato kiritildi"}, headers=headers)

    assert (await cancel(nodira, reason=" ")).status_code == 422  # sabab majburiy
    foreign = await cancel(aziz)
    assert (foreign.status_code, foreign.json()["code"]) == (403, "cancel_window_passed")
    assert (await s.sale(sale, nodira))["can_cancel"] is True
    assert (await cancel(nodira)).status_code == 204

    card = await s.sale(sale)
    assert (card["status"], card["cancelled_by"], card["cancel_reason"], card["can_cancel"], card["can_return"]) == (
        "cancelled", "Nodira Sotuvchi", "Xato kiritildi", False, False,
    )  # fmt: skip
    assert card["debt"]["status"] == "cancelled"
    assert await s.stock(batch, s.store) == (D("200.00"), D("200.00"))
    assert (await s.movements(batch))[-1] == ("sale_cancel", D("10.00"))
    found = await s.client.get("/api/customers/search", params={"q": "sardor"}, headers=s.headers)
    assert found.json()[0]["debt"] == 0
    assert (await s.events("sale", category="sale"))[0]["data"] == {
        "name": "S-000001", "reason": "Xato kiritildi", "total": 450_000,
    }  # fmt: skip

    again = await cancel(s.headers)
    assert (again.status_code, again.json()["code"]) == (409, "sale_cancelled")


async def test_after_ten_minutes_only_the_owner_cancels(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "200")
    nodira = await seller(s)
    sale = (await s.sell_to((batch, "10", 45000), headers=nodira)).json()["id"]
    async with system_session() as db:
        await db.execute(
            update(Sale).where(Sale.id == sale).values(created_at=datetime.now(UTC) - timedelta(minutes=11))
        )

    body = {"reason": "Mijoz voz kechdi"}
    late = await s.client.post(f"/api/sales/{sale}/cancel", json=body, headers=nodira)
    assert (late.status_code, late.json()["code"]) == (403, "cancel_window_passed")
    assert (await s.sale(sale, nodira))["can_cancel"] is False
    assert (await s.client.post(f"/api/sales/{sale}/cancel", json=body, headers=s.headers)).status_code == 204
    assert (await s.sale(sale))["cancelled_by"] == "Akmal Ega"


async def test_cancelling_reopens_a_batch_closed_meanwhile(shop):
    s = await shop()
    batch = await s.in_store(0, "50", 1)
    sale = (await s.sell_to((batch, "50", 45000))).json()["id"]
    await s.client.post(f"/api/batches/{batch}/close", json={"location_id": s.store}, headers=s.headers)

    await s.client.post(f"/api/sales/{sale}/cancel", json={"reason": "Xato"}, headers=s.headers)

    card = (await s.client.get(f"/api/batches/{batch}", headers=s.headers)).json()
    assert [(p["status"], p["qty_m"]) for p in card["places"] if p["location"]["id"] == s.store] == [
        ("open", "50.00")
    ]


# ====================== Qaytarish ======================


async def test_return_puts_meters_back_and_refunds_money(shop, seller, keeper):
    s = await shop()
    batch = await s.in_store(0, "200")
    nodira = await seller(s)
    sale = (await s.sell_to((batch, "1.5", 3333), headers=nodira)).json()["id"]  # 4 999.5 → 5 000 so'm
    line = (await s.sale(sale))["lines"][0]["id"]

    def give_back(meters: str, headers=nodira, **body):
        return s.client.post(
            f"/api/sales/{sale}/returns",
            json={"lines": [{"sale_line_id": line, "meters": meters}], **body},
            headers=headers,
        )

    too_much = await give_back("1.6")
    assert (too_much.status_code, too_much.json()["code"], too_much.json()["available"]) == (
        409, "return_too_much", "1.50",
    )  # fmt: skip

    first = await give_back("0.5", method="card")
    assert first.status_code == 201
    assert first.json() == {"id": first.json()["id"], "amount": 1667, "debt_amount": 0, "refund": 1667}
    assert await s.stock(batch, s.store) == (D("199.00"), D("200.00"))
    card = await s.sale(sale)
    assert (card["status"], card["returned_total"]) == ("partially_returned", 1667)
    assert (card["lines"][0]["returned_m"], card["lines"][0]["returned_amount"]) == ("0.50", 1667)
    assert [(r["user"], r["amount"], r["refund"], r["method"]) for r in card["returns"]] == [
        ("Nodira Sotuvchi", 1667, 1667, "card")
    ]
    assert card["returns"][0]["lines"] == [
        {"sku_label": "M101-01 · Atlas · Rang 01", "meters": "0.50", "amount": 1667}
    ]

    # Qolganini qaytarish — summa aynan sotuv summasiga yetadi (yaxlitlash farqi qolmaydi)
    rest = await give_back("1")
    assert rest.json()["amount"] == 3333
    card = await s.sale(sale)
    assert (card["status"], card["returned_total"], card["can_return"], card["can_cancel"]) == (
        "returned", 5000, False, False,
    )  # fmt: skip
    assert (await s.movements(batch))[-2:] == [("return", D("0.50")), ("return", D("1.00"))]

    # Har qaytarish egalarga xabar va jurnalga
    alerts = [n["data"] for n in await _inbox(s) if n["event_code"] == "sale.returned"]
    assert [(a["number"], a["amount"], a["by"]) for a in alerts] == [
        ("S-000001", 3333, "Nodira Sotuvchi"), ("S-000001", 1667, "Nodira Sotuvchi"),
    ]  # fmt: skip
    assert [e["event_code"] for e in await s.events("sale", category="sale")][:2] == ["sale.returned"] * 2
    assert (await give_back("1", headers=await keeper(s))).status_code == 403  # omborchi qaytarmaydi


async def test_return_on_credit_sale_reduces_the_debt_first(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    sold = await s.sell_to(
        (batch, "10", 45000), payment_type="credit", customer_id=sardor,
        initial_payment=400_000, initial_payment_method="cash",
    )  # fmt: skip
    sale = sold.json()["id"]  # jami 450 000, qarz 50 000
    line = (await s.sale(sale))["lines"][0]["id"]

    back = await s.client.post(
        f"/api/sales/{sale}/returns",
        json={"lines": [{"sale_line_id": line, "meters": "4"}], "method": "cash"},  # 180 000 so'm
        headers=s.headers,
    )

    # 50 000 qarzdan ayrildi, qolgan 130 000 — mijoz allaqachon to'lagan, pul bilan qaytdi
    assert back.json() == {"id": back.json()["id"], "amount": 180_000, "debt_amount": 50_000, "refund": 130_000}
    card = await s.sale(sale)
    assert (card["debt"]["remaining"], card["returns"][0]["method"]) == (0, "cash")
    # Sotuvda qaytarish bor — endi uni bekor qilib bo'lmaydi
    cancel = await s.client.post(f"/api/sales/{sale}/cancel", json={"reason": "Xato"}, headers=s.headers)
    assert (cancel.status_code, cancel.json()["code"]) == (409, "sale_has_returns")


async def test_return_fully_covered_by_the_debt_needs_no_refund(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sale = (
        await s.sell_to((batch, "10", 45000), payment_type="credit", customer_id=await s.customer())
    ).json()["id"]
    line = (await s.sale(sale))["lines"][0]["id"]

    back = await s.client.post(
        f"/api/sales/{sale}/returns", json={"lines": [{"sale_line_id": line, "meters": "2"}]}, headers=s.headers
    )

    assert (back.json()["debt_amount"], back.json()["refund"]) == (90_000, 0)
    card = await s.sale(sale)
    assert (card["debt"]["remaining"], card["returns"][0]["method"]) == (360_000, None)


async def test_return_reopens_a_closed_batch(shop):
    s = await shop()
    batch = await s.in_store(0, "50", 1)
    sale = (await s.sell_to((batch, "50", 45000))).json()["id"]
    await s.client.post(f"/api/batches/{batch}/close", json={"location_id": s.store}, headers=s.headers)
    line = (await s.sale(sale))["lines"][0]["id"]

    await s.client.post(
        f"/api/sales/{sale}/returns", json={"lines": [{"sale_line_id": line, "meters": "5"}]}, headers=s.headers
    )

    card = (await s.client.get(f"/api/batches/{batch}", headers=s.headers)).json()
    place = next(p for p in card["places"] if p["location"]["id"] == s.store)
    assert (place["status"], place["qty_m"]) == ("open", "5.00")
    assert [(m["type"], m["ref_number"]) for m in card["movements"][:2]] == [
        ("return", "S-000001"), ("close", None),
    ]  # fmt: skip


# ====================== Ro'yxat ======================


async def test_sales_list_filters_and_totals(shop, seller, new_location):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    nodira = await seller(s)
    cash = (await s.sell_to((batch, "10", 45000), headers=nodira)).json()["id"]
    card = (await s.sell_to((batch, "2", 50000), payment_type="card")).json()["id"]
    credit = (await s.sell_to((batch, "1", 40000), payment_type="credit", customer_id=sardor)).json()["id"]
    cancelled = (await s.sell_to((batch, "3", 45000))).json()["id"]
    await s.client.post(f"/api/sales/{cancelled}/cancel", json={"reason": "Xato"}, headers=s.headers)
    line = (await s.sale(cash))["lines"][0]["id"]
    await s.client.post(
        f"/api/sales/{cash}/returns", json={"lines": [{"sale_line_id": line, "meters": "4"}]}, headers=s.headers
    )

    async def page(**params) -> dict:
        return (await s.client.get("/api/sales", params=params, headers=s.headers)).json()

    async def ids(**params) -> list[int]:
        return [row["id"] for row in (await page(**params))["items"]]

    everything = await page()
    assert [row["id"] for row in everything["items"]] == [cancelled, credit, card, cash]
    # 450 000 − 180 000 qaytarilgan + 100 000 + 40 000; bekor qilingani kirmaydi
    assert (everything["total"], everything["amount"]) == (4, 410_000)
    assert [row["status"] for row in everything["items"]] == [
        "cancelled", "completed", "completed", "partially_returned",
    ]  # fmt: skip
    assert await ids(payment_type="credit") == [credit]
    assert await ids(status="partially_returned") == [cash]
    assert await ids(status="cancelled") == [cancelled]
    assert await ids(status="completed") == [credit, card]
    assert await ids(search="s-000002") == [card]
    assert await ids(search="sardor") == [credit]
    assert await ids(customer_id=sardor) == [credit]
    assert await ids(date_from="2100-01-01") == []
    assert await ids(store_id=await new_location(s.business_id, "store", name="Boshqa")) == []
    assert await ids(limit=2, offset=1) == [credit, card]

    # Sotuvchi: o'z do'konining sotuvlari; "bugungi sotuvlarim" — faqat o'ziniki
    mine = await s.client.get("/api/sales", params={"mine": True}, headers=nodira)
    assert [row["id"] for row in mine.json()["items"]] == [cash]
    store_sales = await s.client.get("/api/sales", headers=nodira)
    assert store_sales.json()["total"] == 4


async def test_sellers_see_only_their_own_store(shop, seller, new_location):
    s = await shop()
    batch = await s.in_store(0, "200")
    sale = (await s.sell_to((batch, "10", 45000))).json()["id"]
    other_store = await new_location(s.business_id, "store", name="Boshqa do'kon")
    outsider = await seller(s, store=other_store, pin="9999")

    assert (await s.client.get("/api/sales", headers=outsider)).json()["total"] == 0
    assert (await s.client.get(f"/api/sales/{sale}", headers=outsider)).status_code == 404
    refund = await s.client.post(f"/api/sales/{sale}/returns", json={"lines": []}, headers=outsider)
    assert refund.status_code in (404, 422)
    # Boshqa do'kon qurilmasidan bu partiyani sotib bo'lmaydi
    elsewhere = await s.sell_to((batch, "1", 45000), headers=outsider)
    assert (elsewhere.status_code, elsewhere.json()["code"]) == (409, "batch_not_here")


async def test_other_businesses_and_keepers_have_no_access(shop, keeper, client):
    s, stranger = await shop(), await shop()
    batch = await s.in_store(0, "200")
    sale = (await s.sell_to((batch, "10", 45000))).json()["id"]
    dilshod = await keeper(s)

    assert (await client.get(f"/api/sales/{sale}", headers=stranger.headers)).status_code == 404
    assert (await client.get("/api/sales", headers=stranger.headers)).json()["total"] == 0
    cancel = await client.post(f"/api/sales/{sale}/cancel", json={"reason": "x"}, headers=stranger.headers)
    assert cancel.status_code == 404
    foreign_batch = await stranger.sell_to((batch, "1", 45000))
    assert foreign_batch.status_code == 404
    assert (await client.get("/api/sales", headers=dilshod)).status_code == 403
    assert (await s.sell_to((batch, "1", 45000), headers=dilshod)).status_code == 403
    assert (await client.get("/api/sales")).status_code == 401
    assert await s.stock(batch, s.store) == (D("190.00"), D("200.00"))


async def test_sales_feed_the_low_stock_alert(shop):
    s = await shop()
    batch = await s.in_store(0, "100", 2)
    card = (await s.client.get(f"/api/batches/{batch}", headers=s.headers)).json()
    await s.client.patch(
        f"/api/catalog/skus/{card['sku']['id']}", json={"low_stock_threshold": "50"}, headers=s.headers
    )

    await s.sell_to((batch, "60", 45000))

    low = [n["data"] for n in await _inbox(s) if n["event_code"] == "stock.low"]
    assert [(n["location"], n["qty"]) for n in low] == [("Chorsu do'koni", "40.00")]
    async with system_session() as db:
        debts = await db.scalars(select(Debt.id).where(Debt.business_id == s.business_id))
        assert debts.all() == []  # naqd sotuv qarz ochmaydi
