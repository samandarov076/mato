"""10-telegram: akkauntni ulash, darhol xabarlar, kunlik xulosa. Telegram serveri o'rniga — soxta mijoz."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import system_session
from app.core.redis import get_redis
from app.modules.auth.models import User
from app.modules.notifications import service as notifications
from app.modules.telegram import bot, service
from tests.shop import TODAY_DATE

ZONE = ZoneInfo("Asia/Tashkent")
CHAT = 555_000_111
DIFF = {"transfer_id": 7, "number": "K-00007", "target": "Chorsu do'koni", "diff": "12.00", "by": "Nodira <S>"}


class FakeTelegram:
    """Bot API o'rniga: chaqiruvlarni yozib boradi; `fail` — keyingi sendMessage shu xato bilan tugaydi."""

    def __init__(self):
        self.sent: list[tuple[int, str]] = []
        self.fail: Exception | None = None

    async def call(self, method: str, **params):
        if method == "getMe":
            return {"username": "mato_test_bot"}
        if method == "sendMessage":
            if self.fail is not None:
                raise self.fail
            self.sent.append((params["chat_id"], params["text"]))
            return {"message_id": len(self.sent)}
        raise AssertionError(f"kutilmagan usul: {method}")

    @property
    def texts(self) -> list[str]:
        return [text for _, text in self.sent]


@pytest.fixture
async def tg(monkeypatch):
    """Bot sozlangan (token bor) va Telegram o'rnida soxta mijoz."""
    fake = FakeTelegram()
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "TEST-TOKEN")
    monkeypatch.setattr(bot, "call", fake.call)
    await get_redis().delete("tg:bot_username")
    return fake


async def _owner_id(s) -> int:
    async with system_session() as db:
        return await db.scalar(select(User.id).where(User.business_id == s.business_id, User.role == "owner"))


def _start(token: str = "", chat: int = CHAT, language: str = "uz") -> dict:
    return {
        "update_id": 1,
        "message": {
            "text": f"/start {token}".strip(),
            "chat": {"id": chat, "type": "private"},
            "from": {"id": chat, "username": "akmal_ega", "language_code": language},
        },
    }


async def _connect(s, chat: int = CHAT) -> None:
    """Ega profilidan havola oladi va botda "Start" bosadi."""
    link = await s.client.post("/api/telegram/link", headers=s.headers)
    assert link.status_code == 200, link.text
    await service.handle_update(_start(link.json()["url"].split("start=")[1], chat))


async def _status(s) -> dict:
    return (await s.client.get("/api/telegram", headers=s.headers)).json()


# ====================== Ulash ======================


async def test_without_a_bot_token_telegram_is_off(shop):
    s = await shop()
    assert await _status(s) == {
        "configured": False, "linked": False, "username": None, "daily_summary": True, "instant_alerts": True,
    }  # fmt: skip
    link = await s.client.post("/api/telegram/link", headers=s.headers)
    assert (link.status_code, link.json()["code"]) == (503, "telegram_not_configured")
    assert await service.deliver(s.business_id, await _owner_id(s), "transfer.diff", DIFF) is False
    assert await service.send_daily_summaries() == 0


async def test_owner_connects_telegram_with_a_one_time_link(shop, tg):
    s = await shop()
    link = (await s.client.post("/api/telegram/link", headers=s.headers)).json()

    assert link["url"].startswith("https://t.me/mato_test_bot?start=")
    assert link["expires_in"] == 900
    token = link["url"].split("start=")[1]
    assert (await _status(s))["linked"] is False

    await service.handle_update(_start(token))

    assert await _status(s) == {
        "configured": True, "linked": True, "username": "akmal_ega", "daily_summary": True, "instant_alerts": True,
    }  # fmt: skip
    assert len(tg.sent) == 1 and tg.sent[0][0] == CHAT
    assert "ulandi" in tg.texts[0]

    # Havola bir marta ishlaydi — boshqa odam shu havola bilan ulana olmaydi
    await service.handle_update(_start(token, chat=999))
    assert "eskirgan" in tg.texts[1]
    assert (await _status(s))["username"] == "akmal_ega"


async def test_start_without_a_link_explains_what_to_do(tg):
    await service.handle_update(_start())
    await service.handle_update(_start("yoq-bunday-token", language="ru"))
    await service.handle_update({"update_id": 3, "message": {"text": "salom", "chat": {"id": 1, "type": "private"}}})

    assert len(tg.sent) == 2  # oddiy xabarga bot javob bermaydi
    assert "Profil → Telegram" in tg.texts[0]
    assert "Ссылка устарела" in tg.texts[1]  # javob — Telegram'dagi til bo'yicha


async def test_preferences_and_unlink(shop, tg):
    s = await shop()
    await _connect(s)

    saved = await s.client.patch(
        "/api/telegram", json={"daily_summary": False, "instant_alerts": True}, headers=s.headers
    )
    assert saved.status_code == 204
    assert (await _status(s))["daily_summary"] is False

    assert (await s.client.delete("/api/telegram", headers=s.headers)).status_code == 204
    status = await _status(s)
    # Uzildi; sozlamalar saqlanib qoladi
    assert (status["linked"], status["username"], status["daily_summary"]) == (False, None, False)
    assert await service.deliver(s.business_id, await _owner_id(s), "transfer.diff", DIFF) is False


# ====================== Darhol xabarlar ======================


async def test_instant_alert_goes_to_the_linked_owner(shop, tg):
    s = await shop()
    owner = await _owner_id(s)
    await _connect(s)

    assert await service.deliver(s.business_id, owner, "transfer.diff", DIFF) is True
    # Foydalanuvchi kiritgan matn HTML uchun ekranlanadi
    assert tg.texts[-1] == (
        "⚠️ <b>K-00007</b>: «Chorsu do&#x27;koni»ga 12 m kam keldi (Nodira &lt;S&gt; qabul qildi)"
    )
    over = {"batch_id": 3, "number": "P-000003", "location": "Chorsu", "diff": "-7.50", "percent": "15", "by": "Ali"}
    assert await service.deliver(s.business_id, owner, "batch.big_diff", over) is True
    assert tg.texts[-1] == "⚠️ <b>P-000003</b> yopildi: «Chorsu»da 7.5 m (15%) ortiq chiqdi — Ali"

    # Telegram'ga faqat ikki hodisa boradi; "darhol xabarlar" o'chirilsa — ular ham bormaydi
    sent = len(tg.sent)
    assert await service.deliver(s.business_id, owner, "sale.returned", {}) is False
    await s.client.patch("/api/telegram", json={"daily_summary": True, "instant_alerts": False}, headers=s.headers)
    assert await service.deliver(s.business_id, owner, "transfer.diff", DIFF) is False
    assert len(tg.sent) == sent


async def test_alert_is_queued_after_the_notification_is_saved(shop, tg, monkeypatch):
    s = await shop()
    owner = await _owner_id(s)
    queued: list[tuple] = []

    async def enqueue(function: str, *args):
        queued.append((function, *args))

    monkeypatch.setattr(notifications, "enqueue", enqueue)
    async with system_session() as db:
        await notifications.notify_owners(db, s.business_id, "transfer.diff", DIFF)
        await notifications.notify_owners(db, s.business_id, "sale.returned", {"amount": 1})
        assert queued == []  # saqlanmaguncha hech narsa ketmaydi

    assert queued == [("deliver_telegram", s.business_id, owner, "transfer.diff", DIFF)]


async def test_blocked_bot_disconnects_and_tells_the_owner(shop, tg):
    s = await shop()
    owner = await _owner_id(s)
    await _connect(s)

    # Vaqtinchalik xato — yuqoriga uzatiladi (ishchi keyinroq qayta urinadi), bog'lanish qoladi
    tg.fail = bot.TelegramError(429, "Too Many Requests")
    with pytest.raises(bot.TelegramError):
        await service.deliver(s.business_id, owner, "transfer.diff", DIFF)
    assert (await _status(s))["linked"] is True

    # Ega botni bloklagan — bog'lanish uziladi, tizim ichida xabar qoladi
    tg.fail = bot.TelegramError(403, "Forbidden: bot was blocked by the user")
    assert await service.deliver(s.business_id, owner, "transfer.diff", DIFF) is False
    assert (await _status(s))["linked"] is False
    inbox = await s.client.get("/api/notifications", headers=s.headers)
    assert [n["event_code"] for n in inbox.json()["items"]] == ["telegram.disconnected"]


async def test_kicked_update_disconnects(shop, tg):
    s = await shop()
    await _connect(s)

    await service.handle_update(
        {"update_id": 9, "my_chat_member": {"chat": {"id": CHAT}, "new_chat_member": {"status": "kicked"}}}
    )

    assert (await _status(s))["linked"] is False
    inbox = await s.client.get("/api/notifications", headers=s.headers)
    assert inbox.json()["items"][0]["event_code"] == "telegram.disconnected"


# ====================== Kunlik xulosa ======================


async def _summaries(tg, chat: int, hour: int, minute: int = 5, days: int = 0) -> list[str]:
    """Shu soatda xulosa vazifasini ishga tushiradi; `chat` ga kelgan xabarlarni qaytaradi.

    Vazifa barcha bizneslar bo'yicha ishlaydi (boshqa testlarniki ham) — shuning uchun faqat o'z suhbatimiz
    tekshiriladi.
    """
    tg.sent.clear()
    now = datetime.combine(TODAY_DATE + timedelta(days=days), time(hour, minute), ZONE)
    await service.send_daily_summaries(now)
    return [text for target, text in tg.sent if target == chat]


async def test_daily_summary_is_sent_once_at_the_business_hour(shop, tg):
    s = await shop()
    batch = await s.in_store(0, "200")  # tannarx 30 000
    await s.sell_to((batch, "10", 45000))  # 450 000 naqd, foyda 150 000
    await s.sell_to((batch, "2", 50000), payment_type="card")  # 100 000 karta, foyda 40 000
    await _connect(s, chat=777)

    assert await _summaries(tg, 777, hour=20) == []  # hali vaqti emas
    (text,) = await _summaries(tg, 777, hour=21)

    title, *lines = text.split("\n")
    assert title.startswith("📊 <b>") and title.endswith(TODAY_DATE.strftime("%d.%m.%Y"))
    assert lines == [
        "Savdo: <b>550\u00a0000 so'm</b>",
        "Tushum: 550\u00a0000 so'm (naqd 450\u00a0000, karta 100\u00a0000)",
        "Foyda: 190\u00a0000 so'm",
    ]
    # Shu soat ichida qayta chaqirilsa ham — kuniga bir marta
    assert await _summaries(tg, 777, hour=21, minute=15) == []


async def test_daily_summary_follows_settings_and_reports_quiet_days(shop, tg):
    s = await shop()
    await _connect(s, chat=888)
    current = (await s.client.get("/api/settings", headers=s.headers)).json()
    saved = await s.client.put(
        "/api/settings", json={**current, "daily_summary_time": "19:00:00"}, headers=s.headers
    )
    assert saved.status_code == 200
    half = await s.client.put(
        "/api/settings", json={**current, "daily_summary_time": "19:30:00"}, headers=s.headers
    )
    assert half.status_code == 422  # faqat to'liq soat

    assert await _summaries(tg, 888, hour=21) == []
    (text,) = await _summaries(tg, 888, hour=19)
    # Savdo bo'lmagan kun ham xulosa keladi
    assert text.split("\n")[1:] == ["Bugun savdo bo'lmadi."]


async def test_daily_summary_respects_the_switch_and_retries_after_failure(shop, tg):
    s = await shop()
    await _connect(s, chat=999)

    # Telegram ishlamayapti — yuborilmadi; keyingi urinishda (shu soat ichida) ketadi
    tg.fail = bot.TelegramError(500, "Internal Server Error")
    assert await _summaries(tg, 999, hour=21) == []
    tg.fail = None
    assert len(await _summaries(tg, 999, hour=21, minute=15)) == 1

    # Ertasiga: kunlik xulosa o'chirilgan — yuborilmaydi
    await s.client.patch(
        "/api/telegram", json={"daily_summary": False, "instant_alerts": True}, headers=s.headers
    )
    assert await _summaries(tg, 999, hour=21, days=1) == []


# ====================== Ruxsatlar ======================


async def test_telegram_settings_are_for_owners_only(shop, seller, keeper, client):
    s = await shop()
    for headers in (await seller(s), await keeper(s)):
        assert (await client.get("/api/telegram", headers=headers)).status_code == 403
        assert (await client.post("/api/telegram/link", headers=headers)).status_code == 403
    assert (await client.get("/api/telegram")).status_code == 401
