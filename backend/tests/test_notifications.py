"""09-xabarlar: kimga qaysi hodisa haqida xabar keladi, takrorlanmasligi, o'qilgan qilish, real vaqt signali."""
import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.core.db import system_session, tenant_session
from app.core.security import hash_password
from app.modules.inventory.models import Transfer
from app.modules.notifications import service as notifications
from app.worker import remind_stale_transfers
from tests.conftest import PASSWORD, random_phone
from tests.shop import login


async def _inbox(s, headers=None, **params) -> dict:
    response = await s.client.get("/api/notifications", params=params, headers=headers or s.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _events(s, headers=None, **params) -> list[str]:
    return [item["event_code"] for item in (await _inbox(s, headers, **params))["items"]]


async def _unread(s, headers=None) -> int:
    response = await s.client.get("/api/notifications/unread-count", headers=headers or s.headers)
    return response.json()["count"]


@pytest.fixture
def co_owner(client, new_user):
    """Shu biznesga sherik-ega qo'shadi va uning nomidan kiradi: (user_id, headers)."""

    async def _enter(shop, **fields) -> tuple[int, dict[str, str]]:
        phone = random_phone()
        user_id = await new_user(
            shop.business_id, role="owner", phone=phone, password_hash=hash_password(PASSWORD),
            full_name="Bahrom Sherik", all_locations=True, **fields,
        )  # fmt: skip
        return user_id, await login(client, phone, PASSWORD)

    return _enter


# ---------- Ko'chirish ----------


async def test_receiving_staff_are_told_a_transfer_is_coming(shop, seller, keeper):
    s = await shop()
    batch = await s.batch()
    nodira, dilshod = await seller(s), await keeper(s)

    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    inbox = await _inbox(s, nodira)
    assert inbox["unread"] == 1
    item = inbox["items"][0]
    assert (item["event_code"], item["read"]) == ("transfer.arrived", False)
    assert item["data"] == {
        "transfer_id": transfer, "number": "K-00001", "source": "Asosiy sklad",
        "target": "Chorsu do'koni", "batches": 1, "meters": "200.00",
    }  # fmt: skip
    # Do'konga kelayotgan ko'chirish omborchiga ham, jo'natgan eganing o'ziga ham kerak emas
    assert await _events(s, dilshod) == []
    assert await _events(s) == []

    # Kimdir qabul qilgach, "qabul qiling" xabari o'z-o'zidan o'qilgan bo'ladi
    assert (await s.accept(transfer)).status_code == 204
    assert await _unread(s, nodira) == 0
    assert (await _inbox(s, nodira))["items"][0]["read"] is True


async def test_keeper_is_told_about_a_transfer_to_the_warehouse(shop, keeper):
    s = await shop()
    batch = await s.batch()
    await s.accept((await s.send((batch, 4, "200"))).json()["id"])
    dilshod = await keeper(s)

    await s.send((batch, 1, "50"), from_location_id=s.store, to_location_id=s.warehouse)

    assert await _events(s, dilshod) == ["transfer.arrived"]


async def test_owners_learn_when_a_transfer_arrives_short(shop, seller, co_owner):
    s = await shop()
    batch = await s.batch()
    _, bahrom = await co_owner(s)
    nodira = await seller(s)
    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    assert (await s.accept(transfer, headers=nodira, note="Kam keldi", **{"P-000001": (4, "188")})).status_code == 204

    for owner in (s.headers, bahrom):
        item = (await _inbox(s, owner))["items"][0]
        assert item["event_code"] == "transfer.diff"
        assert item["data"] == {
            "transfer_id": transfer, "number": "K-00001", "target": "Chorsu do'koni",
            "diff": "12.00", "by": "Nodira Sotuvchi",
        }  # fmt: skip
    assert await _events(s, nodira, unread_only=True) == []  # sotuvchiga bu xabar bormaydi


async def test_an_owner_is_not_notified_about_own_action(shop, co_owner):
    s = await shop()
    batch = await s.batch()
    _, bahrom = await co_owner(s)
    transfer = (await s.send((batch, 4, "200"))).json()["id"]

    await s.accept(transfer, note="Kam keldi", **{"P-000001": (4, "188")})  # asosiy ega o'zi qabul qildi

    assert await _events(s) == []
    assert await _events(s, bahrom) == ["transfer.diff"]


async def test_transfer_without_difference_makes_no_noise(shop, co_owner):
    s = await shop()
    batch = await s.batch()
    _, bahrom = await co_owner(s)

    await s.accept((await s.send((batch, 4, "200"))).json()["id"])

    assert await _events(s, bahrom) == []


async def test_reminder_about_a_transfer_nobody_received(shop, co_owner):
    s = await shop()
    batch = await s.batch()
    _, bahrom = await co_owner(s)
    fresh = (await s.send((batch, 1, "50"))).json()["id"]
    old = (await s.send((batch, 2, "100"))).json()["id"]
    async with system_session() as db:
        await db.execute(
            update(Transfer)
            .where(Transfer.id == old)
            .values(sent_at=datetime.now(UTC) - timedelta(hours=25))
        )

    assert await remind_stale_transfers() >= 1
    await remind_stale_transfers()  # qayta ishga tushsa ham xabar takrorlanmaydi

    for owner in (s.headers, bahrom):
        waiting = [i for i in (await _inbox(s, owner))["items"] if i["event_code"] == "transfer.waiting"]
        assert [i["data"]["transfer_id"] for i in waiting] == [old]
        assert waiting[0]["data"] == {
            "transfer_id": old, "number": "K-00002", "target": "Chorsu do'koni", "hours": 24,
        }  # fmt: skip
    assert fresh

    # Qabul qilingach eslatma o'qilgan bo'ladi
    await s.accept(old)
    assert await _unread(s, bahrom) == 0


# ---------- Partiyani yopish ----------


async def test_closing_with_a_big_difference_alerts_owners(shop, seller):
    s = await shop()
    big, small = await s.batch(0), await s.batch(1)
    for batch in (big, small):
        await s.accept((await s.send((batch, 4, "200"))).json()["id"])
    await s.sell(big, "-150", s.store)  # 200 dan 50 m qoldi — 25%
    await s.sell(small, "-190", s.store)  # 10 m qoldi — 5%
    nodira = await seller(s)

    for batch in (big, small):
        closed = await s.client.post(
            f"/api/batches/{batch}/close", json={"location_id": s.store}, headers=nodira
        )
        assert closed.status_code == 204

    alerts = [i for i in (await _inbox(s))["items"] if i["event_code"] == "batch.big_diff"]
    assert [a["data"] for a in alerts] == [
        {
            "batch_id": big, "number": "P-000001", "location": "Chorsu do'koni",
            "diff": "50.00", "percent": 25, "by": "Nodira Sotuvchi",
        }
    ]


# ---------- Kam qoldiq ----------


async def test_low_stock_is_reported_once_until_restocked(shop):
    s = await shop()
    batch = await s.batch()  # skladda 500 m
    sku = (await s.client.get("/api/stock", headers=s.headers)).json()["items"][0]["sku"]["id"]
    await s.client.patch(f"/api/catalog/skus/{sku}", json={"low_stock_threshold": "100"}, headers=s.headers)

    await s.sell(batch, "-350")  # 150 m — hali chegaradan yuqori
    assert await _events(s) == []

    await s.sell(batch, "-60")  # 90 m — chegaradan tushdi
    await s.sell(batch, "-10")  # 80 m — xabar takrorlanmaydi
    low = (await _inbox(s))["items"]
    assert [i["event_code"] for i in low] == ["stock.low"]
    assert low[0]["data"] == {
        "sku_id": sku, "code": "M101-01", "location_id": s.warehouse, "location": "Asosiy sklad",
        "qty": "90.00", "threshold": "100.00",
    }  # fmt: skip

    await s.batch()  # yangi kirim: +500 m — chegaradan oshdi
    second = (await s.client.get("/api/stock", headers=s.headers)).json()["items"][0]["batches"][1]["id"]
    await s.sell(second, "-500")  # yana 80 m — endi yangi xabar keladi
    assert await _events(s) == ["stock.low", "stock.low"]


async def test_low_stock_uses_the_business_default(shop):
    s = await shop()
    batch = await s.batch()
    await s.sell(batch, "-480")
    assert await _events(s) == []  # chegara umuman belgilanmagan — xabar yo'q

    settings = (await s.client.get("/api/settings", headers=s.headers)).json()
    await s.client.put("/api/settings", json={**settings, "low_stock_default": "50"}, headers=s.headers)
    await s.sell(batch, "-1")

    assert [i["data"]["threshold"] for i in (await _inbox(s))["items"]] == ["50.00"]


# ---------- Ro'yxat va o'qilgan qilish ----------


async def test_inbox_paging_filter_and_reading(shop, co_owner):
    s = await shop()
    _, bahrom = await co_owner(s)
    async with tenant_session(s.business_id) as db:
        for n in range(5):
            await notifications.notify_owners(
                db, s.business_id, "transfer.diff" if n % 2 else "stock.low", {"n": n}
            )

    first = await _inbox(s, limit=2)
    assert ([i["data"]["n"] for i in first["items"]], first["unread"]) == ([4, 3], 5)
    second = await _inbox(s, limit=2, cursor=first["next_cursor"])
    assert [i["data"]["n"] for i in second["items"]] == [2, 1]
    last = await _inbox(s, limit=2, cursor=second["next_cursor"])
    assert ([i["data"]["n"] for i in last["items"]], last["next_cursor"]) == ([0], None)
    assert [i["data"]["n"] for i in (await _inbox(s, event="transfer.diff"))["items"]] == [3, 1]

    newest = first["items"][0]["id"]
    assert (await s.client.post(f"/api/notifications/{newest}/read", headers=s.headers)).status_code == 204
    assert await _unread(s) == 4
    assert [i["data"]["n"] for i in (await _inbox(s, unread_only=True))["items"]] == [3, 2, 1, 0]

    # Har kim faqat o'z xabarini o'qilgan qiladi
    theirs = await s.client.post(f"/api/notifications/{newest}/read", headers=bahrom)
    assert theirs.status_code == 404
    assert await _unread(s, bahrom) == 5

    assert (await s.client.post("/api/notifications/read-all", headers=s.headers)).status_code == 204
    assert (await _unread(s), await _unread(s, bahrom)) == (0, 5)


async def test_inactive_owners_and_other_businesses_get_nothing(shop, new_user):
    s, other = await shop(), await shop()
    gone = await new_user(s.business_id, role="owner", full_name="Ketgan Ega", is_active=False)

    async with tenant_session(s.business_id) as db:
        assert gone not in await notifications.owner_ids(db, s.business_id)
        await notifications.notify_owners(db, s.business_id, "stock.low", {})

    assert await _events(s) == ["stock.low"]
    assert await _events(other) == []


async def test_notifications_need_login(client):
    assert (await client.get("/api/notifications")).status_code == 401
    assert (await client.get("/api/notifications/unread-count")).status_code == 401
    assert (await client.get("/api/notifications/stream")).status_code == 401


# ---------- Real vaqt ----------


async def test_stream_signals_when_a_notification_is_saved(shop):
    s = await shop()
    owner = (await s.client.get("/api/auth/me", headers=s.headers)).json()["user"]["id"]
    events = notifications.stream(s.business_id, owner, lifetime=5)
    assert await anext(events) == ": connected\n\n"

    async def save() -> None:
        async with tenant_session(s.business_id) as db:
            await notifications.notify_owners(db, s.business_id, "stock.low", {})

    waiting = asyncio.create_task(anext(events))
    await asyncio.sleep(0.05)  # tinglovchi Redis'ga ulanib olsin
    await save()
    assert await asyncio.wait_for(waiting, timeout=3) == "data: new\n\n"
    await events.aclose()


async def test_no_signal_if_the_action_was_rolled_back(shop):
    s = await shop()
    owner = (await s.client.get("/api/auth/me", headers=s.headers)).json()["user"]["id"]
    events = notifications.stream(s.business_id, owner, lifetime=0.4)
    assert await anext(events) == ": connected\n\n"

    with pytest.raises(RuntimeError):
        async with tenant_session(s.business_id) as db:
            await notifications.notify_owners(db, s.business_id, "stock.low", {})
            raise RuntimeError("amal bekor bo'ldi")

    chunks = [chunk async for chunk in events]
    assert chunks and set(chunks) == {": ping\n\n"}  # faqat "tirikman" belgisi — signal yo'q
    assert await _events(s) == []


async def test_inbox_filters_by_kind(shop, new_user):
    """Xabarlar sahifasidagi tur filtri: kam qoldiq · ko'chirish · nasiya · boshqa."""
    from app.core.db import tenant_session
    from app.modules.notifications import service as notifications

    s = await shop()
    async with tenant_session(s.business_id) as db:
        for code in ("stock.low", "transfer.diff", "transfer.waiting", "debt.overdue", "sale.returned"):
            await notifications.notify_owners(db, s.business_id, code, {})

    async def codes(**params) -> set[str]:
        return {item["event_code"] for item in (await _inbox(s, **params))["items"]}

    assert await codes(kind="low_stock") == {"stock.low"}
    assert await codes(kind="transfers") == {"transfer.diff", "transfer.waiting"}
    assert await codes(kind="credit") == {"debt.overdue"}
    assert await codes(kind="other") == {"sale.returned"}
    assert len(await codes()) == 5
    bad = await s.client.get("/api/notifications", params={"kind": "x"}, headers=s.headers)
    assert bad.status_code == 422
