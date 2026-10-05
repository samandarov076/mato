"""Fon tozalash vazifalari va kechki qoldiq solishtiruvi (app/worker.py)."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select, update

from app.core import alerts
from app.core.db import system_session
from app.modules.auth.models import UserSession
from app.modules.inventory.models import BatchStock
from app.modules.notifications.models import Notification
from app.worker import purge_expired_sessions, purge_read_notifications, reconcile_stock
from tests.shop import login


async def test_expired_sessions_are_purged_but_live_ones_stay(client, new_account):
    _, user_id, phone = await new_account()
    await login(client, phone, "sinov-parol")
    await login(client, phone, "sinov-parol")
    async with system_session() as s:
        first = await s.scalar(select(func.min(UserSession.id)).where(UserSession.user_id == user_id))
        await s.execute(
            update(UserSession)
            .where(UserSession.id == first)
            .values(expires_at=datetime.now(UTC) - timedelta(days=1))
        )

    assert await purge_expired_sessions() >= 1

    async with system_session() as s:
        left = (await s.scalars(select(UserSession.id).where(UserSession.user_id == user_id))).all()
    assert len(left) == 1 and first not in left


async def test_old_read_notifications_are_purged_unread_and_recent_stay(new_account):
    business_id, user_id, _ = await new_account()
    old = datetime.now(UTC) - timedelta(days=91)
    recent = datetime.now(UTC) - timedelta(days=10)
    async with system_session() as s:
        s.add_all(
            [
                Notification(business_id=business_id, user_id=user_id, event_code="t.old", read_at=old),
                Notification(business_id=business_id, user_id=user_id, event_code="t.recent", read_at=recent),
                Notification(business_id=business_id, user_id=user_id, event_code="t.unread"),
            ]
        )

    assert await purge_read_notifications() >= 1

    async with system_session() as s:
        codes = (await s.scalars(select(Notification.event_code).where(Notification.user_id == user_id))).all()
    assert sorted(codes) == ["t.recent", "t.unread"]


async def test_reconcile_stock_is_quiet_when_ledger_matches(shop, monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(alerts, "alert_platform", _capture(sent))
    s = await shop()
    batch = await s.batch()
    await s.sell(batch, "-20")

    assert await reconcile_stock() == 0
    assert sent == []


async def test_reconcile_stock_reports_a_drifted_balance(shop, monkeypatch):
    """Ledger kafolati: batch_stock harakatlar yig'indisidan farq qilsa — platforma egasiga xabar."""
    sent: list[str] = []
    monkeypatch.setattr(alerts, "alert_platform", _capture(sent))
    s = await shop()
    batch = await s.batch()
    async with system_session() as db:  # move_stock'ni chetlab o'tib buzamiz (faqat testda)
        await db.execute(
            update(BatchStock)
            .where(BatchStock.batch_id == batch, BatchStock.location_id == s.warehouse)
            .values(qty_m=BatchStock.qty_m - Decimal("1.5"))
        )

    assert await reconcile_stock() == 1
    assert len(sent) == 1
    assert f"partiya {batch}" in sent[0] and "farq -1.50" in sent[0]


def _capture(into: list[str]):
    async def _alert(text: str) -> None:
        into.append(text)

    return _alert
