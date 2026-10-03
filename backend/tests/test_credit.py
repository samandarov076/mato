"""07-nasiya: mijozlar, qarz to'lovi, hisobdan chiqarish, muddati o'tgan qarz xabari."""
import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.core.db import system_session
from app.modules.credit.models import Debt, DebtPayment
from app.worker import remind_overdue_debts
from tests.shop import TODAY_DATE


async def _credit(s, customer: int, batch: int, meters: str = "10", headers=None, **fields) -> int:
    """Nasiya sotuv (1 m = 45 000 so'm). Sotuv id sini qaytaradi."""
    sold = await s.sell_to(
        (batch, meters, 45000), headers=headers, payment_type="credit", customer_id=customer, **fields
    )
    assert sold.status_code == 201, sold.text
    return sold.json()["id"]


async def _debt_id(sale: int) -> int:
    async with system_session() as db:
        return await db.scalar(select(Debt.id).where(Debt.sale_id == sale))


async def _age(sale: int, days: int) -> None:
    """Qarzni `days` kun oldin berilgandek qiladi (muddati — 30 kun)."""
    created = datetime.now(UTC) - timedelta(days=days)
    async with system_session() as db:
        await db.execute(
            update(Debt)
            .where(Debt.sale_id == sale)
            .values(created_at=created, due_date=TODAY_DATE - timedelta(days=days - 30))
        )


async def _card(s, customer: int, headers=None) -> dict:
    response = await s.client.get(f"/api/customers/{customer}", headers=headers or s.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _pay(s, customer: int, amount: int, headers=None, **fields):
    return s.client.post(
        f"/api/customers/{customer}/payments",
        json={"amount": amount, "method": "cash", **fields},
        headers=headers or s.headers,
    )


async def _inbox(s, event: str) -> list[dict]:
    response = await s.client.get("/api/notifications", headers=s.headers)
    return [n["data"] for n in response.json()["items"] if n["event_code"] == event]


# ====================== Mijozlar ro'yxati ======================


async def test_customers_list_shows_debt_age_and_last_payment(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer("Sardor Usta", "+998901234567")
    tikuv = await s.customer("Tikuv sexi", "+998935550011")
    await s.customer("Yangi mijoz", "+998977770000")  # qarzsiz
    old = await _credit(s, sardor, batch, "10")  # 450 000
    await _credit(s, sardor, batch, "2")  # 90 000
    await _credit(s, tikuv, batch, "20", initial_payment=100_000, initial_payment_method="cash")  # 800 000
    await _age(old, 45)  # 15 kun muddati o'tgan
    assert (await _pay(s, tikuv, 50_000)).status_code == 201

    async def page(**params) -> dict:
        return (await s.client.get("/api/customers", params=params, headers=s.headers)).json()

    def names(data: dict) -> list[str]:
        return [c["name"] for c in data["items"]]

    everyone = await page()
    assert [(c["name"], c["debt"], c["overdue"], c["oldest_days"]) for c in everyone["items"]] == [
        ("Sardor Usta", 540_000, 450_000, 45),
        ("Tikuv sexi", 750_000, 0, 0),
        ("Yangi mijoz", 0, 0, None),
    ]
    assert (everyone["total"], everyone["debt_total"], everyone["overdue_total"]) == (3, 1_290_000, 450_000)
    assert [c["last_payment_at"] is not None for c in everyone["items"]] == [False, True, False]

    assert names(await page(only="debtors")) == ["Sardor Usta", "Tikuv sexi"]
    overdue = await page(only="overdue")
    assert (names(overdue), overdue["debt_total"]) == (["Sardor Usta"], 540_000)
    assert names(await page(sort="debt")) == ["Tikuv sexi", "Sardor Usta", "Yangi mijoz"]
    assert names(await page(sort="oldest")) == ["Sardor Usta", "Tikuv sexi", "Yangi mijoz"]
    assert names(await page(search="555 00")) == ["Tikuv sexi"]
    assert names(await page(search="usta")) == ["Sardor Usta"]
    assert names(await page(limit=1, offset=1)) == ["Tikuv sexi"]


async def test_customer_card_lists_debts_payments_and_writeoffs(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    nodira = await seller(s)
    first = await _credit(
        s, sardor, batch, "10", headers=nodira, initial_payment=50_000, initial_payment_method="card"
    )
    second = await _credit(s, sardor, batch, "2")
    await _age(first, 40)
    await _pay(s, sardor, 100_000, headers=nodira, method="card")
    await s.client.post(
        f"/api/debts/{await _debt_id(second)}/writeoff",
        json={"amount": 10_000, "reason": "Brak chiqdi"},
        headers=s.headers,
    )

    card = await _card(s, sardor, nodira)  # sotuvchi ham mijoz qarzini ko'radi

    assert (card["name"], card["debt"], card["overdue"], card["oldest_days"]) == (
        "Sardor Usta", 380_000, 300_000, 40,
    )  # fmt: skip
    assert [
        (d["sale_number"], d["store"], d["seller"], d["sale_total"], d["initial_payment"], d["amount"])
        for d in card["debts"]
    ] == [
        ("S-000001", "Chorsu do'koni", "Nodira Sotuvchi", 450_000, 50_000, 400_000),
        ("S-000002", "Chorsu do'koni", "Akmal Ega", 90_000, 0, 90_000),
    ]
    assert [(d["paid"], d["written_off"], d["remaining"], d["overdue"], d["days"]) for d in card["debts"]] == [
        (100_000, 0, 300_000, True, 40),
        (0, 10_000, 80_000, False, 0),
    ]
    assert card["debts"][1]["due_date"] == (TODAY_DATE + timedelta(days=30)).isoformat()
    assert [(p["amount"], p["method"], p["user"], p["store"], p["allocations"]) for p in card["payments"]] == [
        (
            100_000, "card", "Nodira Sotuvchi", "Chorsu do'koni",
            [{"sale_id": first, "sale_number": "S-000001", "amount": 100_000}],
        )
    ]  # fmt: skip
    assert [(w["amount"], w["reason"], w["user"], w["sale_number"]) for w in card["writeoffs"]] == [
        (10_000, "Brak chiqdi", "Akmal Ega", "S-000002")
    ]


# ====================== To'lov ======================


async def test_payment_closes_the_oldest_debt_first(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    first = await _credit(s, sardor, batch, "2")  # 90 000
    second = await _credit(s, sardor, batch, "4")  # 180 000
    await _age(first, 10)

    paid = await _pay(s, sardor, 150_000, method="card")

    assert paid.status_code == 201
    assert paid.json() == {"id": paid.json()["id"], "amount": 150_000, "debt": 120_000}
    card = await _card(s, sardor)
    # Eskisi to'liq yopildi (90 000), qolgan 60 000 keyingisiga tushdi; yopilgani ro'yxat oxirida
    assert [(d["sale_number"], d["paid"], d["remaining"]) for d in card["debts"]] == [
        ("S-000002", 60_000, 120_000), ("S-000001", 90_000, 0),
    ]  # fmt: skip
    assert card["payments"][0]["allocations"] == [
        {"sale_id": first, "sale_number": "S-000001", "amount": 90_000},
        {"sale_id": second, "sale_number": "S-000002", "amount": 60_000},
    ]
    # Ega qurilmasiz qabul qildi — pul qarz berilgan do'konga yoziladi
    async with system_session() as db:
        store = await db.scalar(select(DebtPayment.store_id).where(DebtPayment.id == paid.json()["id"]))
    assert store == s.store
    event = (await s.events("debt", category="credit"))[0]
    assert (event["event_code"], event["data"], event["location"]["name"]) == (
        "debt.paid", {"name": "Sardor Usta", "amount": 150_000, "method": "card"}, "Chorsu do'koni",
    )  # fmt: skip
    found = await s.client.get("/api/customers/search", params={"q": "sardor"}, headers=s.headers)
    assert found.json()[0]["debt"] == 120_000


async def test_payment_cannot_exceed_the_debt(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    first = await _credit(s, sardor, batch, "2")  # 90 000
    second = await _credit(s, sardor, batch, "4")  # 180 000

    too_much = await _pay(s, sardor, 270_001)
    assert (too_much.status_code, too_much.json()["code"], too_much.json()["debt"]) == (
        409, "payment_too_large", 270_000,
    )  # fmt: skip
    assert (await _pay(s, sardor, 0)).status_code == 422
    assert (await _pay(s, sardor, 1000, method="transfer")).status_code == 422

    # Sotuvchi aniq sotuvni tanlaydi — faqat o'sha qarz yopiladi
    chosen = await _debt_id(second)
    over = await _pay(s, sardor, 180_001, debt_id=chosen)
    assert (over.status_code, over.json()["debt"]) == (409, 180_000)
    assert (await _pay(s, sardor, 180_000, debt_id=chosen)).status_code == 201
    card = await _card(s, sardor)
    assert [(d["sale_number"], d["remaining"]) for d in card["debts"]] == [("S-000001", 90_000), ("S-000002", 0)]
    # Yopilgan yoki begona qarzga to'lab bo'lmaydi
    assert (await _pay(s, sardor, 1000, debt_id=chosen)).json()["code"] == "debt_not_found"
    assert (await _pay(s, sardor, 1000, debt_id=999_999)).status_code == 404
    assert (await _pay(s, 999_999, 1000)).json()["code"] == "customer_not_found"

    # Qarzi yo'q mijozdan to'lov olinmaydi
    assert (await _pay(s, sardor, 90_000, debt_id=await _debt_id(first))).status_code == 201
    nothing = await _pay(s, sardor, 1)
    assert (nothing.status_code, nothing.json()["debt"]) == (409, 0)


async def test_two_payments_at_once_never_overpay(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    await _credit(s, sardor, batch, "2")  # 90 000

    results = await asyncio.gather(*(_pay(s, sardor, 60_000) for _ in range(3)))

    assert sorted(r.status_code for r in results) == [201, 409, 409]
    assert (await _card(s, sardor))["debt"] == 30_000


async def test_paid_debt_blocks_cancelling_and_limits_return_offset(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    sale = await _credit(s, sardor, batch, "10")  # 450 000
    await _pay(s, sardor, 400_000)  # qarz 50 000 qoldi

    cancel = await s.client.post(f"/api/sales/{sale}/cancel", json={"reason": "Xato"}, headers=s.headers)
    assert (cancel.status_code, cancel.json()["code"]) == (409, "debt_has_payments")

    # Qaytarish: 180 000 dan faqat 50 000 qarzdan ayriladi, qolgani — mijoz to'lagan pul
    line = (await s.sale(sale))["lines"][0]["id"]
    back = await s.client.post(
        f"/api/sales/{sale}/returns", json={"lines": [{"sale_line_id": line, "meters": "4"}]}, headers=s.headers
    )
    assert (back.json()["debt_amount"], back.json()["refund"]) == (50_000, 130_000)
    card = await _card(s, sardor)
    assert (card["debt"], card["debts"][0]["returned"], card["debts"][0]["remaining"]) == (0, 50_000, 0)


# ====================== Hisobdan chiqarish ======================


async def test_writeoff_needs_a_reason_and_tells_the_owners(shop, seller):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    nodira = await seller(s)
    sale = await _credit(s, sardor, batch, "10")  # 450 000
    debt = await _debt_id(sale)

    def write_off(headers=nodira, **body):
        return s.client.post(f"/api/debts/{debt}/writeoff", json=body, headers=headers)

    assert (await write_off(amount=1000)).status_code == 422
    assert (await write_off(amount=1000, reason="  ")).status_code == 422
    too_much = await write_off(amount=450_001, reason="Kechirildi")
    assert (too_much.status_code, too_much.json()["code"], too_much.json()["debt"]) == (
        409, "writeoff_too_large", 450_000,
    )  # fmt: skip

    assert (await write_off(amount=50_000, reason="Mato nuqsonli chiqdi")).status_code == 204

    card = await _card(s, sardor)
    assert (card["debt"], card["debts"][0]["written_off"], card["debts"][0]["remaining"]) == (
        400_000, 50_000, 400_000,
    )  # fmt: skip
    assert await _inbox(s, "debt.written_off") == [
        {
            "customer_id": sardor, "customer": "Sardor Usta", "amount": 50_000,
            "reason": "Mato nuqsonli chiqdi", "number": "S-000001", "by": "Nodira Sotuvchi",
        }
    ]  # fmt: skip
    event = (await s.events("debt", category="credit"))[0]
    assert (event["event_code"], event["data"]) == (
        "debt.written_off",
        {"name": "Sardor Usta", "amount": 50_000, "reason": "Mato nuqsonli chiqdi", "sale": "S-000001"},
    )

    # Ega o'zi chiqarsa — o'ziga xabar kelmaydi; qolganini to'liq chiqarsa bo'ladi
    assert (await write_off(s.headers, amount=400_000, reason="Mijoz ko'chib ketdi")).status_code == 204
    assert len(await _inbox(s, "debt.written_off")) == 1
    assert (await _card(s, sardor))["debt"] == 0
    closed = await write_off(amount=1, reason="yana")
    assert (closed.status_code, closed.json()["debt"]) == (409, 0)


# ====================== Mijozni tahrirlash ======================


async def test_edit_and_deactivate_customer(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer("Sardor Usta", "+998901234567")
    tikuv = await s.customer("Tikuv sexi", "+998935550011")

    def edit(customer: int, **body):
        return s.client.patch(f"/api/customers/{customer}", json=body, headers=s.headers)

    def active(customer: int, value: bool):
        return s.client.post(f"/api/customers/{customer}/active", json={"is_active": value}, headers=s.headers)

    saved = await edit(sardor, name="Sardor Usta (Chorsu)", phone="+998 90 123 45 68", note="tikuv sexi")
    assert saved.status_code == 204
    card = await _card(s, sardor)
    assert (card["name"], card["phone"], card["note"]) == ("Sardor Usta (Chorsu)", "+998901234568", "tikuv sexi")

    taken = await edit(sardor, name="Sardor", phone="+998935550011")
    assert (taken.status_code, taken.json()["code"], taken.json()["name"]) == (
        409, "customer_phone_taken", "Tikuv sexi",
    )  # fmt: skip
    assert (await edit(sardor, name="Sardor", phone="123")).json()["fields"] == {"phone": "invalid_phone"}
    assert (await edit(sardor, name="S", phone="+998901234568")).status_code == 422
    assert (await edit(999_999, name="Sardor", phone="+998901234568")).status_code == 404

    # Qarzi bor mijoz faolsizlantirilmaydi
    await _credit(s, tikuv, batch, "2")
    refused = await active(tikuv, False)
    assert (refused.status_code, refused.json()["code"]) == (409, "customer_has_debt")
    await _pay(s, tikuv, 90_000)
    assert (await active(tikuv, False)).status_code == 204

    listed = await s.client.get("/api/customers", headers=s.headers)
    assert [c["name"] for c in listed.json()["items"]] == ["Sardor Usta (Chorsu)"]
    found = await s.client.get("/api/customers/search", params={"q": "tikuv"}, headers=s.headers)
    assert found.json() == []
    # Faolsiz mijozga nasiya berilmaydi; tarixi saqlanadi va qayta faollashtirsa bo'ladi
    refused = await s.sell_to((batch, "1", 45000), payment_type="credit", customer_id=tikuv)
    assert refused.json()["fields"] == {"customer_id": "invalid"}
    everyone = await s.client.get("/api/customers", params={"include_inactive": True}, headers=s.headers)
    assert [(c["name"], c["is_active"]) for c in everyone.json()["items"]] == [
        ("Sardor Usta (Chorsu)", True), ("Tikuv sexi", False),
    ]  # fmt: skip
    assert (await active(tikuv, True)).status_code == 204
    assert [e["event_code"] for e in await s.events("customer", category="credit")][:3] == [
        "customer.activated", "customer.deactivated", "customer.updated",
    ]  # fmt: skip


# ====================== Muddati o'tgan qarz ======================


async def test_overdue_debt_is_reported_once_and_closed_when_paid(shop):
    s = await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    await _credit(s, sardor, batch, "2")  # muddati o'tmagan — xabar kelmaydi
    late = await _credit(s, sardor, batch, "10")  # 450 000
    await _age(late, 31)  # muddati kecha o'tdi

    await remind_overdue_debts()
    await remind_overdue_debts()  # ikkinchi marta xabar kelmaydi

    assert await _inbox(s, "debt.overdue") == [
        {
            "customer_id": sardor, "customer": "Sardor Usta", "amount": 450_000, "number": "S-000002",
            "due_date": (TODAY_DATE - timedelta(days=1)).isoformat(),
        }
    ]  # fmt: skip
    unread = await s.client.get("/api/notifications/unread-count", headers=s.headers)
    assert unread.json()["count"] == 1

    # Qarz to'liq yopilsa — xabar o'zi o'qilgan bo'ladi
    await _pay(s, sardor, 450_000, debt_id=await _debt_id(late))
    unread = await s.client.get("/api/notifications/unread-count", headers=s.headers)
    assert unread.json()["count"] == 0


# ====================== Ruxsatlar ======================


async def test_credit_is_closed_to_keepers_and_other_businesses(shop, keeper, client):
    s, stranger = await shop(), await shop()
    batch = await s.in_store(0, "200")
    sardor = await s.customer()
    debt = await _debt_id(await _credit(s, sardor, batch, "2"))
    dilshod = await keeper(s)

    for headers, status in ((dilshod, 403), (stranger.headers, 404)):
        assert (await client.get(f"/api/customers/{sardor}", headers=headers)).status_code == status
        assert (await _pay(s, sardor, 1000, headers=headers)).status_code == status
        written = await client.post(
            f"/api/debts/{debt}/writeoff", json={"amount": 1000, "reason": "x"}, headers=headers
        )
        assert written.status_code == status
        edited = await client.patch(
            f"/api/customers/{sardor}", json={"name": "Boshqa", "phone": "+998901234567"}, headers=headers
        )
        assert edited.status_code == status
    assert (await client.get("/api/customers", headers=dilshod)).status_code == 403
    assert (await client.get("/api/customers", headers=stranger.headers)).json()["total"] == 0
    assert (await client.get("/api/customers")).status_code == 401
    assert (await _card(s, sardor))["debt"] == 90_000
