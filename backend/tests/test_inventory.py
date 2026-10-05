"""05-ombor: ko'chirish (jo'natish → qabul), qoldiq, partiya kartochkasi, yopish va metr farqi."""
import asyncio
import uuid
from decimal import Decimal

import pytest

D = Decimal


async def _stock_page(s, headers=None, **params) -> dict:
    response = await s.client.get("/api/stock", params=params, headers=headers or s.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _batch_card(s, batch_id: int, headers=None) -> dict:
    response = await s.client.get(f"/api/batches/{batch_id}", headers=headers or s.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _close(s, batch_id: int, location: int, headers=None, note=None):
    return await s.client.post(
        f"/api/batches/{batch_id}/close",
        json={"location_id": location, "note": note},
        headers=headers or s.headers,
    )


async def _reopen(s, batch_id: int, location: int, headers=None):
    return await s.client.post(
        f"/api/batches/{batch_id}/reopen", json={"location_id": location}, headers=headers or s.headers
    )


async def _in_store(s, batch_id: int, meters: str = "200", rolls: int = 4) -> int:
    """Skladdan do'konga ko'chiradi va qabul qiladi. Ko'chirish id sini qaytaradi."""
    transfer = (await s.send((batch_id, rolls, meters))).json()["id"]
    assert (await s.accept(transfer)).status_code == 204
    return transfer


# ====================== Ko'chirish ======================


async def test_transfer_takes_meters_out_then_puts_them_in(shop):
    s = await shop()
    batch = await s.batch()  # skladda 500 m, 10 rulon

    sent = await s.send((batch, 4, "200"), note="Dushanba uchun")
    assert sent.status_code == 201, sent.text
    card = await s.transfer(sent.json()["id"])
    assert (card["number"], card["status"], card["note"]) == ("K-00001", "in_transit", "Dushanba uchun")
    assert (card["source"]["name"], card["target"]["name"]) == ("Asosiy sklad", "Chorsu do'koni")
    assert (card["sent_m"], card["received_m"], card["can_receive"], card["can_cancel"]) == (
        "200.00", None, True, True,
    )  # fmt: skip
    line = card["lines"][0]
    assert (line["batch_number"], line["sent_rolls"], line["sent_m"], line["roll_m"]) == (
        "P-000001", 4, "200.00", "50.00",
    )  # fmt: skip

    # Yo'lda: skladdan chiqdi, do'konga hali kirmadi
    assert await s.stock(batch) == (D("300.00"), D("500.00"))
    assert await s.stock(batch, s.store) is None

    assert (await s.accept(card["id"])).status_code == 204
    card = await s.transfer(card["id"])
    assert (card["status"], card["received_m"], card["has_diff"]) == ("received", "200.00", False)
    assert (card["received_by"]["name"], card["can_receive"], card["can_cancel"]) == ("Akmal Ega", False, False)
    assert await s.stock(batch, s.store) == (D("200.00"), D("200.00"))
    assert await s.movements(batch) == [
        ("receipt", D("500.00")),
        ("transfer_out", D("-200.00")),
        ("transfer_in", D("200.00")),
    ]
    events = await s.events("transfer")
    assert [(e["event_code"], e["location"]["name"]) for e in events] == [
        ("transfer.received", "Chorsu do'koni"),
        ("transfer.sent", "Asosiy sklad"),
    ]
    assert events[1]["data"] == {
        "name": "K-00001", "to": "Chorsu do'koni", "batches": 1, "meters": "200.00",
    }  # fmt: skip


async def test_arriving_less_needs_a_note_and_the_gap_stays_out_of_stock(shop):
    s = await shop()
    batch = await s.batch()
    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    silent = await s.accept(transfer, **{"P-000001": (4, "188")})
    assert silent.json()["fields"] == {"note": "required"}
    assert (await s.transfer(transfer))["status"] == "in_transit"

    assert (await s.accept(transfer, note="12 m kam keldi", **{"P-000001": (4, "188")})).status_code == 204
    card = await s.transfer(transfer)
    assert (card["status"], card["has_diff"], card["received_m"], card["receive_note"]) == (
        "received", True, "188.00", "12 m kam keldi",
    )  # fmt: skip
    # Yo'qolgan 12 m hech qaysi joy qoldig'ida emas
    assert await s.stock(batch) == (D("300.00"), D("500.00"))
    assert await s.stock(batch, s.store) == (D("188.00"), D("188.00"))

    report = (await s.client.get("/api/stock/differences", headers=s.headers)).json()
    assert [(t["number"], t["sent_m"], t["received_m"], t["diff_m"], t["diff_amount"]) for t in report["transfers"]] == [
        ("K-00001", "200.00", "188.00", "12.00", 360_000)
    ]
    assert (report["transfer_m"], report["transfer_amount"], report["closures"]) == ("12.00", 360_000, [])
    assert (await s.events("transfer"))[0]["data"] == {"name": "K-00001", "diff": "12.00"}


async def test_fewer_rolls_with_the_same_meters_is_also_a_difference(shop):
    s = await shop()
    batch = await s.batch()
    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    assert (await s.accept(transfer, **{"P-000001": (3, "200")})).status_code == 422
    assert (await s.accept(transfer, note="3 rulon keldi", **{"P-000001": (3, "200")})).status_code == 204
    assert (await s.transfer(transfer))["has_diff"] is True


async def test_cannot_send_what_is_not_there(shop, new_location):
    s = await shop()
    batch = await s.batch()
    closed_store = await new_location(s.business_id, "store", name="Yopiq do'kon", is_active=False)

    too_much = await s.send((batch, 10, "500.01"))
    assert (too_much.status_code, too_much.json()["code"]) == (409, "not_enough_stock")
    assert too_much.json()["available"] == "500.00"
    assert (await s.send((batch, 1, "50"), to_location_id=s.warehouse)).json()["fields"] == {
        "to_location_id": "same"
    }
    assert (await s.send((batch, 1, "50"), to_location_id=closed_store)).json()["fields"] == {
        "to_location_id": "invalid"
    }
    assert (await s.send((batch, 1, "50"), (batch, 1, "50"))).json()["fields"] == {"lines": "duplicate"}
    # Do'konda bu partiya yo'q — u yerdan jo'natib bo'lmaydi
    from_store = await s.send((batch, 1, "50"), from_location_id=s.store, to_location_id=s.warehouse)
    assert (from_store.status_code, from_store.json()["code"]) == (409, "batch_not_open")

    assert await s.stock(batch) == (D("500.00"), D("500.00"))  # hech narsa o'zgarmadi
    sent = await s.send((batch, 1, "50"))
    assert (await s.transfer(sent.json()["id"]))["number"] == "K-00001"  # rad etilganlar raqam sarflamadi


async def test_cancelling_returns_meters_to_the_sender(shop, keeper):
    s = await shop()
    batch = await s.batch()
    dilshod, zafar = await keeper(s), await keeper(s)
    transfer = (await s.send((batch, 4, "200"), headers=dilshod)).json()["id"]

    stranger = await s.client.post(f"/api/transfers/{transfer}/cancel", headers=zafar)
    assert stranger.status_code == 403  # faqat jo'natuvchi yoki ega
    assert (await s.client.post(f"/api/transfers/{transfer}/cancel", headers=dilshod)).status_code == 204

    card = await s.transfer(transfer)
    assert (card["status"], card["cancelled_by"]["name"], card["can_receive"]) == (
        "cancelled", "Dilshod Omborchi", False,
    )  # fmt: skip
    assert await s.stock(batch) == (D("500.00"), D("500.00"))
    assert (await s.movements(batch))[-1] == ("transfer_cancel", D("200.00"))

    again = await s.client.post(f"/api/transfers/{transfer}/cancel", headers=s.headers)
    late = await s.accept(transfer)
    assert [(r.status_code, r.json()["code"]) for r in (again, late)] == [
        (409, "transfer_not_in_transit")
    ] * 2


async def test_only_the_right_people_receive(shop, keeper, seller, new_location):
    s = await shop()
    batch = await s.batch()
    other_store = await new_location(s.business_id, "store", name="Boshqa do'kon")
    transfer = (await s.send((batch, 4, "200"))).json()["id"]
    dilshod = await keeper(s)
    nodira = await seller(s)  # shu do'kon qurilmasida
    outsider = await seller(s, store=other_store, pin="9999")

    # Do'konga kelgan ko'chirishni omborchi qabul qila olmaydi; boshqa do'kon sotuvchisi uni ko'rmaydi ham
    by_keeper = await s.accept(transfer, headers=dilshod)
    assert (by_keeper.status_code, by_keeper.json()["code"]) == (403, "location_forbidden")
    assert (await s.client.get(f"/api/transfers/{transfer}", headers=outsider)).status_code == 404
    assert (await s.client.get("/api/transfers", headers=outsider)).json()["total"] == 0

    assert (await s.transfer(transfer, nodira))["can_receive"] is True
    assert (await s.accept(transfer, headers=nodira)).status_code == 204
    assert (await s.transfer(transfer))["received_by"]["name"] == "Nodira Sotuvchi"

    # Do'kondan skladga qaytarish: omborchi o'z skladiga kelganini qabul qiladi
    back = (await s.send((batch, 1, "50"), from_location_id=s.store, to_location_id=s.warehouse)).json()["id"]
    assert (await s.accept(back, headers=nodira)).status_code == 403
    assert (await s.accept(back, headers=dilshod)).status_code == 204
    assert await s.stock(batch) == (D("350.00"), D("550.00"))

    # Sotuvchi ko'chirish yarata olmaydi
    assert (await s.send((batch, 1, "10"), headers=nodira)).status_code == 403


async def test_keeper_sends_only_from_own_warehouses(shop, keeper, new_location):
    s = await shop()
    second = await new_location(s.business_id, "warehouse", name="Ikkinchi sklad")
    batch = await s.batch()
    dilshod = await keeper(s, [second])

    denied = await s.send((batch, 1, "50"), headers=dilshod)
    assert (denied.status_code, denied.json()["code"]) == (403, "location_forbidden")
    options = (await s.client.get("/api/transfers/options", headers=dilshod)).json()
    assert [p["name"] for p in options["sources"]] == ["Ikkinchi sklad"]
    assert [p["name"] for p in options["targets"]] == ["Asosiy sklad", "Ikkinchi sklad", "Chorsu do'koni"]
    sendable = await s.client.get(
        "/api/transfers/sendable", params={"location_id": s.warehouse}, headers=dilshod
    )
    assert sendable.status_code == 403


async def test_sendable_lists_open_batches_with_stock(shop):
    s = await shop()
    first, second = await s.batch(0), await s.batch(1, meters="90", rolls_count=3)
    await s.sell(second, "-90")  # tugadi

    async def numbers(**params) -> list[str]:
        rows = await s.client.get(
            "/api/transfers/sendable", params={"location_id": s.warehouse, **params}, headers=s.headers
        )
        return [(r["number"], r["qty_m"], r["rolls"], r["roll_m"]) for r in rows.json()]

    assert await numbers() == [("P-000001", "500.00", 10, "50.00")]
    assert await numbers(search="p-000002") == []
    assert first


async def test_two_people_cannot_receive_the_same_transfer(shop):
    s = await shop()
    batch = await s.batch()
    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    results = await asyncio.gather(*(s.accept(transfer) for _ in range(4)))

    assert sorted(r.status_code for r in results) == [204, 409, 409, 409]
    assert await s.stock(batch, s.store) == (D("200.00"), D("200.00"))


async def test_transfer_list_puts_waiting_ones_first(shop):
    s = await shop()
    batch = await s.batch()
    done = await _in_store(s, batch, "100", 2)
    waiting = (await s.send((batch, 1, "50"))).json()["id"]

    async def rows(**params) -> list[tuple]:
        page = await s.client.get("/api/transfers", params=params, headers=s.headers)
        return [(r["id"], r["status"], r["lines_count"], r["sent_m"]) for r in page.json()["items"]]

    assert await rows() == [(waiting, "in_transit", 1, "50.00"), (done, "received", 1, "100.00")]
    assert await rows(status="received") == [(done, "received", 1, "100.00")]
    assert len(await rows(location_id=s.store)) == 2
    assert await rows(location_id=999_999) == []


# ====================== Qoldiq ======================


async def test_stock_groups_batches_under_their_sku(shop):
    s = await shop()
    old, new = await s.batch(0), await s.batch(0, meters="300", rolls_count=5)
    other = await s.batch(1, pattern_id=s.pattern)
    await _in_store(s, old, "200", 4)
    await s.send((new, 1, "60"))  # yo'lda

    page = await _stock_page(s)
    assert page["total"] == 2
    assert [p["name"] for p in page["locations"]] == ["Asosiy sklad", "Chorsu do'koni"]
    first, second = page["items"]
    assert (first["sku"]["code"], first["sku"]["pattern_name"], first["total_m"], first["in_transit_m"]) == (
        "M101-01", None, "740.00", "60.00",
    )  # fmt: skip
    assert {t["location_id"]: t["qty_m"] for t in first["totals"]} == {
        s.warehouse: "540.00", s.store: "200.00",
    }  # fmt: skip
    assert [(b["number"], b["in_transit_m"]) for b in first["batches"]] == [
        ("P-000001", "0"), ("P-000002", "60.00"),
    ]  # fmt: skip
    assert {c["location_id"]: (c["qty_m"], c["rolls"]) for c in first["batches"][0]["stocks"]} == {
        s.warehouse: ("300.00", 6), s.store: ("200.00", 4),
    }  # fmt: skip
    assert (second["sku"]["code"], second["sku"]["pattern_name"]) == ("M101-02-G1", "Lola")
    assert other


async def test_stock_filters(shop):
    s = await shop()
    red, blue = await s.batch(0), await s.batch(1)
    await _in_store(s, red, "100", 2)
    await s.sell(red, "-120", s.store)  # do'konda manfiy qoldiq: -20
    await s.send((blue, 1, "50"))
    red_sku = (await _stock_page(s))["items"][0]["sku"]["id"]
    await s.client.patch(
        f"/api/catalog/skus/{red_sku}", json={"low_stock_threshold": "450"}, headers=s.headers
    )

    async def codes(**params) -> list[str]:
        return [item["sku"]["code"] for item in (await _stock_page(s, **params))["items"]]

    assert await codes() == ["M101-01", "M101-02"]
    assert await codes(only="negative") == ["M101-01"]
    assert await codes(only="in_transit") == ["M101-02"]
    assert await codes(only="low") == ["M101-01"]  # skladda 400 < 450
    assert await codes(location_id=s.store) == ["M101-01"]
    assert await codes(search="p-000002") == ["M101-02"]
    assert await codes(color_id=s.colors[1]) == ["M101-02"]
    assert await codes(fabric_id=999_999) == []

    low = (await _stock_page(s, only="low"))["items"][0]
    assert low["threshold"] == "450.00"
    assert {t["location_id"]: t["low"] for t in low["totals"]} == {s.warehouse: True, s.store: True}

    # Biznes standarti: SKU'da chegara yo'q bo'lsa shu ishlatiladi
    settings = (await s.client.get("/api/settings", headers=s.headers)).json()
    await s.client.put("/api/settings", json={**settings, "low_stock_default": "460"}, headers=s.headers)
    assert await codes(only="low") == ["M101-01", "M101-02"]

    page = await _stock_page(s, limit=1, offset=1)
    assert (page["total"], [item["sku"]["code"] for item in page["items"]]) == (2, ["M101-02"])


async def test_cancelled_receipts_are_not_stock(shop):
    s = await shop()
    receipt = (await s.receive()).json()["id"]
    assert (await _stock_page(s))["total"] == 1

    await s.client.post(f"/api/receipts/{receipt}/cancel", headers=s.headers)
    assert (await _stock_page(s))["total"] == 0


async def test_seller_sees_meters_but_no_money(shop, seller, keeper, new_location):
    s = await shop()
    other_warehouse = await new_location(s.business_id, "warehouse", name="Begona sklad")
    batch = await s.batch()
    await s.batch(1, cost_per_m=41000)
    await s.receive(s.line(1), warehouse_id=other_warehouse)
    await _in_store(s, batch)
    nodira = await seller(s)
    dilshod = await keeper(s, [s.warehouse])

    page = await s.client.get("/api/stock", headers=nodira)
    assert page.status_code == 200
    assert "cost" not in page.text and "price" not in page.text
    assert len(page.json()["locations"]) == 3  # sotuvchi barcha joylardagi qoldiqni ko'radi
    card = await _batch_card(s, batch, nodira)
    assert card["cost_per_m"] is None
    assert (await _batch_card(s, batch))["cost_per_m"] == 30000  # ega ko'radi

    # Omborchi: o'z skladi va do'konlar — begona sklad ko'rinmaydi; tannarx bu yerda unga ham yopiq
    mine = await _stock_page(s, dilshod)
    assert [p["name"] for p in mine["locations"]] == ["Asosiy sklad", "Chorsu do'koni"]
    blue = next(item for item in mine["items"] if item["sku"]["code"] == "M101-02")
    assert blue["total_m"] == "500.00"  # begona skladdagi 500 m qo'shilmagan
    assert (await _batch_card(s, batch, dilshod))["cost_per_m"] is None


# ====================== Partiya kartochkasi ======================


async def test_batch_card_tells_the_whole_story(shop):
    s = await shop()
    batch = await s.batch(meters="500", kg="125")
    done = await _in_store(s, batch)
    waiting = (await s.send((batch, 1, "50"))).json()["id"]
    await s.sell(batch, "-30", s.store)

    card = await _batch_card(s, batch)
    assert (card["number"], card["sku"]["code"], card["receipt"]["number"]) == ("P-000001", "M101-01", "KR-00001")
    assert (card["rolls_count"], card["meters_labeled"], card["kg"], card["m_per_kg"]) == (
        10, "500.00", "125.000", "4.0000",
    )  # fmt: skip
    assert [
        (p["location"]["name"], p["received_m"], p["qty_m"], p["rolls"], p["status"], p["can_close"])
        for p in card["places"]
    ] == [
        ("Asosiy sklad", "500.00", "250.00", 5, "open", True),
        ("Chorsu do'koni", "200.00", "170.00", 3, "open", True),
    ]
    assert [(t["number"], t["sent_m"], t["target"]["name"]) for t in card["in_transit"]] == [
        ("K-00002", "50.00", "Chorsu do'koni")
    ]
    assert [(m["type"], m["qty_m"], m["location"]["name"], m["ref_number"]) for m in card["movements"]] == [
        ("sale", "-30.00", "Chorsu do'koni", None),
        ("transfer_out", "-50.00", "Asosiy sklad", "K-00002"),
        ("transfer_in", "200.00", "Chorsu do'koni", "K-00001"),
        ("transfer_out", "-200.00", "Asosiy sklad", "K-00001"),
        ("receipt", "500.00", "Asosiy sklad", "KR-00001"),
    ]
    assert (card["movements"][2]["ref_type"], card["movements"][2]["ref_id"]) == ("transfer", done)
    assert waiting


async def test_scanner_finds_a_batch_by_its_number(shop):
    s = await shop()
    batch = await s.batch()
    stranger = await shop()

    found = await s.client.get("/api/batches/by-number/p-000001", headers=s.headers)
    assert found.json() == {"id": batch}
    assert (await s.client.get("/api/batches/by-number/P-999999", headers=s.headers)).status_code == 404
    # Boshqa biznesda bu partiya yo'q
    assert (await s.client.get("/api/batches/by-number/P-000001", headers=stranger.headers)).status_code == 404
    assert (await s.client.get(f"/api/batches/{batch}", headers=stranger.headers)).status_code == 404


# ====================== Yopish va metr farqi ======================


async def test_closing_records_what_was_left_as_the_difference(shop):
    s = await shop()
    batch = await s.batch()
    await _in_store(s, batch)  # do'konga 200 m
    await s.sell(batch, "-150", s.store)

    assert (await _close(s, batch, s.store, note="Rulon tugadi")).status_code == 204

    assert await s.stock(batch, s.store) == (D("0.00"), D("200.00"))
    assert (await s.movements(batch))[-1] == ("close", D("-50.00"))
    place = (await _batch_card(s, batch))["places"][1]
    assert (place["status"], place["can_close"], place["can_reopen"]) == ("closed", False, True)
    assert (place["closure"]["diff_m"], place["closure"]["diff_amount"], place["closure"]["note"]) == (
        "50.00", 1_500_000, "Rulon tugadi",
    )  # fmt: skip
    # Yopilgan joy qoldiq ro'yxatida ko'rinmaydi; skladdagi qismi davom etadi
    totals = (await _stock_page(s))["items"][0]["totals"]
    assert [(t["location_id"], t["qty_m"]) for t in totals] == [(s.warehouse, "300.00")]

    report = (await s.client.get("/api/stock/differences", headers=s.headers)).json()
    row = report["closures"][0]
    assert (row["batch_number"], row["location"]["name"], row["received_m"], row["out_m"]) == (
        "P-000001", "Chorsu do'koni", "200.00", "150.00",
    )  # fmt: skip
    assert (row["diff_m"], row["diff_percent"], row["diff_amount"], row["closed_by"]["name"]) == (
        "50.00", "25.0", 1_500_000, "Akmal Ega",
    )  # fmt: skip
    assert (report["shortage_m"], report["shortage_amount"], report["surplus_m"]) == ("50.00", 1_500_000, "0")
    event = (await s.events("batch"))[0]
    assert (event["event_code"], event["data"], event["location"]["name"]) == (
        "batch.closed", {"name": "P-000001", "diff": "50.00"}, "Chorsu do'koni",
    )  # fmt: skip

    again = await _close(s, batch, s.store)
    assert (again.status_code, again.json()["code"]) == (409, "batch_not_open")


async def test_selling_more_than_recorded_closes_as_surplus(shop):
    s = await shop()
    batch = await s.batch()
    await _in_store(s, batch)
    await s.sell(batch, "-210", s.store)  # 200 yozilgan, 210 chiqdi

    assert (await _close(s, batch, s.store)).status_code == 204

    report = (await s.client.get("/api/stock/differences", headers=s.headers)).json()
    assert (report["closures"][0]["diff_m"], report["closures"][0]["diff_amount"]) == ("-10.00", -300_000)
    assert (report["surplus_m"], report["surplus_amount"], report["shortage_m"]) == ("10.00", 300_000, "0")
    only_short = await s.client.get(
        "/api/stock/differences", params={"kind": "shortage"}, headers=s.headers
    )
    assert only_short.json()["closures"] == []


async def test_batch_with_meters_on_the_way_cannot_be_closed(shop):
    s = await shop()
    batch = await s.batch()
    await _in_store(s, batch)
    await s.send((batch, 1, "50"))

    response = await _close(s, batch, s.store)
    assert (response.status_code, response.json()["code"], response.json()["meters"]) == (
        409, "batch_in_transit", "50.00",
    )  # fmt: skip
    # Jo'natuvchi joyda yopish mumkin — yo'ldagi metr u yerga kelmayapti
    assert (await _close(s, batch, s.warehouse)).status_code == 204


async def test_reopening_undoes_the_closure(shop, keeper, seller):
    s = await shop()
    batch = await s.batch()
    await _in_store(s, batch)
    await s.sell(batch, "-150", s.store)
    nodira, dilshod = await seller(s), await keeper(s)
    assert (await _close(s, batch, s.store, headers=nodira)).status_code == 204

    assert (await _reopen(s, batch, s.store, nodira)).status_code == 403  # sotuvchi qayta ocha olmaydi
    by_keeper = await _reopen(s, batch, s.store, dilshod)
    assert (by_keeper.status_code, by_keeper.json()["code"]) == (403, "location_forbidden")
    assert (await _reopen(s, batch, s.store)).status_code == 204

    assert await s.stock(batch, s.store) == (D("50.00"), D("200.00"))
    place = (await _batch_card(s, batch))["places"][1]
    assert (place["status"], place["closure"], place["can_close"]) == ("open", None, True)
    assert (await s.client.get("/api/stock/differences", headers=s.headers)).json()["closures"] == []
    assert [e["event_code"] for e in await s.events("batch")] == ["batch.reopened", "batch.closed"]

    not_closed = await _reopen(s, batch, s.store)
    assert (not_closed.status_code, not_closed.json()["code"]) == (409, "batch_not_closed")
    # Omborchi o'z skladida yopadi va qayta ochadi
    assert (await _close(s, batch, s.warehouse, headers=dilshod)).status_code == 204
    assert (await _reopen(s, batch, s.warehouse, dilshod)).status_code == 204


async def test_new_delivery_reopens_a_closed_place(shop):
    s = await shop()
    batch = await s.batch()
    await _in_store(s, batch)
    await s.sell(batch, "-200", s.store)
    await _close(s, batch, s.store)

    await _in_store(s, batch, "100", 2)

    place = (await _batch_card(s, batch))["places"][1]
    assert (place["status"], place["qty_m"], place["received_m"]) == ("open", "100.00", "300.00")


async def test_everyone_closes_only_where_they_work(shop, keeper, seller):
    s = await shop()
    batch = await s.batch()
    await _in_store(s, batch)
    nodira, dilshod = await seller(s), await keeper(s)

    at_warehouse = await _close(s, batch, s.warehouse, headers=nodira)
    at_store = await _close(s, batch, s.store, headers=dilshod)
    assert [(r.status_code, r.json()["code"]) for r in (at_warehouse, at_store)] == [
        (403, "location_forbidden")
    ] * 2
    places = (await _batch_card(s, batch, nodira))["places"]
    assert [(p["location"]["name"], p["can_close"]) for p in places] == [
        ("Asosiy sklad", False), ("Chorsu do'koni", True),
    ]  # fmt: skip
    assert (await _close(s, batch, s.store, headers=nodira)).status_code == 204
    assert (await _close(s, batch, s.warehouse, headers=dilshod)).status_code == 204


async def test_differences_report_is_for_owners_and_filters(shop, keeper):
    s = await shop()
    red, blue = await s.batch(0), await s.batch(1)
    await _in_store(s, red)
    await s.sell(red, "-150", s.store)
    await _close(s, red, s.store)
    await s.sell(blue, "-490")
    await _close(s, blue, s.warehouse)

    async def report(**params) -> dict:
        response = await s.client.get("/api/stock/differences", params=params, headers=s.headers)
        return response.json()

    everything = await report()
    assert [c["batch_number"] for c in everything["closures"]] == ["P-000002", "P-000001"]
    assert (everything["shortage_m"], everything["shortage_amount"]) == ("60.00", 1_800_000)
    assert [c["batch_number"] for c in (await report(location_id=s.store))["closures"]] == ["P-000001"]
    assert (await report(date_from="2100-01-01"))["closures"] == []
    assert (await report(kind="surplus"))["closures"] == []

    dilshod = await keeper(s)
    assert (await s.client.get("/api/stock/differences", headers=dilshod)).status_code == 403


# ====================== Boshqa modullarga ta'siri ======================


async def test_location_with_stock_cannot_be_deactivated(shop):
    s = await shop()
    batch = await s.batch()
    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    async def deactivate(location: int):
        return await s.client.post(f"/api/locations/{location}/deactivate", headers=s.headers)

    busy = await deactivate(s.warehouse)
    waiting = await deactivate(s.store)  # qoldiq yo'q, lekin yo'lda tovar bor
    assert [(r.status_code, r.json()["code"]) for r in (busy, waiting)] == [
        (409, "location_has_stock")
    ] * 2

    await s.accept(transfer)
    await s.sell(batch, "-200", s.store)
    assert (await deactivate(s.store)).status_code == 204  # qoldiq 0 — endi mumkin


async def test_transferred_batch_can_no_longer_be_edited_by_the_keeper(shop, keeper):
    s = await shop()
    dilshod = await keeper(s)
    receipt = (await s.receive(headers=dilshod)).json()["id"]
    batch = (await s.card(receipt))["lines"][0]["id"]
    await s.send((batch, 1, "50"), headers=dilshod)

    edit = await s.client.patch(
        f"/api/batches/{batch}", json={"rolls_count": 9, "meters": "450", "cost_per_m": 30000}, headers=dilshod
    )
    assert edit.status_code == 403
    cancel = await s.client.post(f"/api/receipts/{receipt}/cancel", headers=s.headers)
    assert (cancel.status_code, cancel.json()["code"]) == (409, "batch_has_movement")


async def test_difference_totals_cover_everything_while_the_lists_are_paged(shop):
    """Jami — barcha qatorlar bo'yicha (bazada hisoblanadi), ro'yxat esa sahifalab beriladi."""
    s = await shop()
    red, blue, green = await s.batch(0), await s.batch(1), await s.batch(0)
    await _in_store(s, red)
    await s.sell(red, "-150", s.store)
    await _close(s, red, s.store)  # do'konda 200 m dan 150 sotilgan: 50 m kam
    await s.sell(blue, "-490")
    await _close(s, blue, s.warehouse)  # skladda 10 m kam
    for sent_m, arrived_m in (("100", "90"), ("50", "45.5")):  # ko'chirishda 10 m va 4.5 m yo'qoldi
        sent = await s.send((green, 1, sent_m))
        assert (await s.accept(sent.json()["id"], note="Kam keldi", **{"P-000003": (1, arrived_m)})).status_code == 204

    async def report(**params) -> dict:
        response = await s.client.get("/api/stock/differences", params=params, headers=s.headers)
        assert response.status_code == 200, response.text
        return response.json()

    totals = {
        "shortage_m": "60.00", "shortage_amount": 1_800_000, "surplus_m": "0", "surplus_amount": 0,
        "transfer_m": "14.50", "transfer_amount": 435_000, "closures_total": 2, "transfers_total": 2,
    }  # fmt: skip
    everything = await report()
    assert {key: everything[key] for key in totals} == totals
    assert (len(everything["closures"]), len(everything["transfers"])) == (2, 2)

    first, second = await report(limit=1), await report(limit=1, offset=1)
    for page in (first, second):
        assert {key: page[key] for key in totals} == totals  # jami sahifaga bog'liq emas
        assert (len(page["closures"]), len(page["transfers"])) == (1, 1)
    assert [page["closures"][0]["batch_number"] for page in (first, second)] == ["P-000002", "P-000001"]
    assert {page["transfers"][0]["diff_m"] for page in (first, second)} == {"10.00", "4.50"}
    assert (await report(limit=1, offset=2))["closures"] == []

    # Bosh sahifa (dashboard) shu jamidan foydalanadi
    board = (await s.client.get("/api/reports/dashboard", headers=s.headers)).json()
    assert (board["diff_m"], board["diff_amount"]) == ("74.50", 2_235_000)


async def test_batch_history_is_paged_and_filtered_by_kind(shop):
    """Partiya tarixi sahifalanadi (jimgina qirqilmaydi) va tur bo'yicha filtrlanadi."""
    s = await shop()
    batch = await s.in_store(0, "200")  # kirim → jo'natish → qabul: 3 harakat
    for _ in range(35):
        assert (await s.sell_to((batch, "1", 45000))).status_code == 201

    card = await _batch_card(s, batch)
    assert (len(card["movements"]), card["movements_total"]) == (30, 38)

    async def history(**params) -> dict:
        response = await s.client.get(f"/api/batches/{batch}/movements", params=params, headers=s.headers)
        assert response.status_code == 200, response.text
        return response.json()

    rest = await history(offset=30)
    assert (len(rest["items"]), rest["total"]) == (8, 38)
    assert [m["type"] for m in rest["items"]][-3:] == ["transfer_in", "transfer_out", "receipt"]  # eng eskisi oxirida

    sales = await history(kind="sales", limit=5)
    assert (sales["total"], {m["type"] for m in sales["items"]}) == (35, {"sale"})
    assert sales["items"][0]["ref_number"].startswith("S-")
    moves = await history(kind="transfers")
    assert [m["type"] for m in moves["items"]] == ["transfer_in", "transfer_out"]
    assert [m["type"] for m in (await history(kind="other"))["items"]] == ["receipt"]
    assert (await s.client.get(f"/api/batches/{batch}/movements", params={"kind": "x"}, headers=s.headers)).status_code == 422

    other = await shop()
    foreign = await s.client.get(f"/api/batches/{batch}/movements", headers=other.headers)
    assert foreign.status_code == 404


async def test_stock_and_transfer_lists_sort_from_the_header(shop):
    """Qoldiq — jami metr bo'yicha; ko'chirishlar — sana bo'yicha (standart tartiblar o'zgarmaydi)."""
    s = await shop()
    small, big = await s.batch(0, meters="100"), await s.batch(1, meters="900")
    first = (await s.send((small, 1, "10"))).json()["id"]
    second = (await s.send((big, 1, "10"))).json()["id"]
    assert (await s.accept(first)).status_code == 204  # qabul qilingan; ikkinchisi — yo'lda

    async def codes(**params) -> list[str]:
        return [item["sku"]["code"] for item in (await _stock_page(s, **params))["items"]]

    assert await codes() == ["M101-01", "M101-02"]  # standart — kod bo'yicha
    assert await codes(sort="-total") == ["M101-02", "M101-01"]
    assert await codes(sort="total") == ["M101-01", "M101-02"]

    async def ids(**params) -> list[int]:
        page = await s.client.get("/api/transfers", params=params, headers=s.headers)
        assert page.status_code == 200, page.text
        return [row["id"] for row in page.json()["items"]]

    assert await ids() == [second, first]  # standart — yo'ldagisi tepada
    assert await ids(sort="date") == [first, second]
    assert await ids(sort="-date") == [second, first]


async def test_the_same_transfer_is_recorded_once(shop):
    """Javob yo'qolib "Jo'natish" qayta bosilsa — ko'chirish ikki marta yozilmaydi, metr ikki marta ayrilmaydi."""
    s = await shop()
    batch = await s.batch()  # skladda 500 m
    key = str(uuid.uuid4())

    first = await s.send((batch, 2, "100"), client_uuid=key)
    again = await s.send((batch, 2, "100"), client_uuid=key)

    assert (first.status_code, again.status_code) == (201, 200), again.text
    assert again.json() == first.json()
    assert (await s.stock(batch))[0] == D("400.00")

    # Bir vaqtda kelgan takrorlar ham bitta ko'chirish; raqamda bo'shliq qolmaydi
    rush = str(uuid.uuid4())
    results = await asyncio.gather(*(s.send((batch, 1, "50"), client_uuid=rush) for _ in range(4)))
    assert {r.json()["id"] for r in results} == {results[0].json()["id"]}
    assert (await s.stock(batch))[0] == D("350.00")
    third = await s.send((batch, 1, "10"))
    assert (await s.transfer(third.json()["id"]))["number"] == "K-00003"

    # Shu identifikator bilan boshqa mazmun — jimgina eskisi qaytmaydi
    for changed in (
        await s.send((batch, 2, "120"), client_uuid=key),
        await s.send((batch, 3, "100"), client_uuid=key),
    ):
        assert changed.status_code == 409 and changed.json()["code"] == "request_changed", changed.text
        assert changed.json()["number"] == "K-00001"
    assert (await s.stock(batch))[0] == D("340.00")

    # Identifikatorsiz ko'chirish qabul qilinmaydi
    bare = await s.client.post(
        "/api/transfers",
        json={
            "from_location_id": s.warehouse, "to_location_id": s.store,
            "lines": [{"batch_id": batch, "rolls": 1, "meters": "1"}],
        },
        headers=s.headers,
    )
    assert bare.status_code == 422 and bare.json()["fields"] == {"client_uuid": "missing"}

    # Noyoblik biznes ichida: boshqa biznes shu identifikatorni bemalol ishlatadi
    other = await shop()
    assert (await other.send((await other.batch(), 1, "10"), client_uuid=key)).status_code == 201


@pytest.mark.parametrize("path", ["/api/stock", "/api/transfers", "/api/batches/1"])
async def test_inventory_needs_login(client, path):
    assert (await client.get(path)).status_code == 401
