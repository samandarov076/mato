"""Fon vazifalari (Redis navbati — arq). Ishga tushirish:

    cd backend && arq app.worker.WorkerSettings

Bu yerdagi vazifalar barcha bizneslar bo'yicha ishlaydi, shuning uchun RLS'dan tashqari sessiyadan
foydalanadi va har xabarni o'z biznesiga yozadi.
"""
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from arq import Retry, cron
from arq.connections import RedisSettings
from sqlalchemy import delete, func, select

from app import models_registry  # noqa: F401  — barcha modellarni yuklaydi
from app.core import alerts
from app.core.config import get_settings
from app.core.db import system_session
from app.modules.auth.models import UserSession
from app.modules.credit.models import Customer, Debt
from app.modules.credit.service import overdue_key
from app.modules.inventory.models import BatchStock, StockMovement, Transfer, TransferLine
from app.modules.inventory.service import empty_key
from app.modules.inventory.transfers import waiting_key
from app.modules.notifications import service as notifications
from app.modules.notifications.models import Notification
from app.modules.platform.models import Business
from app.modules.receiving.models import Batch, Receipt
from app.modules.sales.models import Sale
from app.modules.structure.models import Location
from app.modules.telegram import bot as telegram_bot
from app.modules.telegram import service as telegram

# Ko'chirish shuncha vaqt qabul qilinmasa — egalarga eslatma (har ko'chirish uchun bir marta)
STALE_AFTER = timedelta(hours=24)


async def remind_stale_transfers(ctx: dict | None = None) -> int:
    """Uzoq vaqt "yo'lda" turgan ko'chirishlar haqida egalarga xabar beradi. Topilganlar sonini qaytaradi."""
    async with system_session() as db:
        stale = (
            await db.execute(
                select(Transfer, Location.name)
                .join(Location, Location.id == Transfer.to_location_id)
                .where(
                    Transfer.status == "in_transit",
                    Transfer.sent_at < datetime.now(UTC) - STALE_AFTER,
                )
            )
        ).all()
        for transfer, target in stale:
            await notifications.notify_owners(
                db,
                transfer.business_id,
                "transfer.waiting",
                {
                    "transfer_id": transfer.id,
                    "number": transfer.number,
                    "target": target,
                    "hours": int(STALE_AFTER.total_seconds() // 3600),
                },
                dedup_key=waiting_key(transfer.id),
            )
        return len(stale)


async def remind_overdue_debts(ctx: dict | None = None) -> int:
    """Muddati o'tgan qarzlar haqida egalarga xabar beradi (har qarz uchun bir marta). Topilganlar soni qaytadi."""
    async with system_session() as db:
        open_debts = (
            await db.execute(
                select(Debt, Customer.name, Sale.number, Business.timezone)
                .join(Customer, Customer.id == Debt.customer_id)
                .join(Sale, Sale.id == Debt.sale_id)
                .join(Business, Business.id == Debt.business_id)
                .where(
                    Debt.status == "active",
                    Debt.amount - Debt.paid - Debt.written_off - Debt.returned > 0,
                    # Aniq kun biznes vaqti bo'yicha — pastda; bu yerda faqat nomzodlar tanlanadi
                    Debt.due_date <= datetime.now(UTC).date(),
                )
            )
        ).all()
        overdue = [
            row for row in open_debts if row[0].due_date < datetime.now(ZoneInfo(row[3])).date()
        ]
        for debt, customer, number, _ in overdue:
            await notifications.notify_owners(
                db,
                debt.business_id,
                "debt.overdue",
                {
                    "customer_id": debt.customer_id,
                    "customer": customer,
                    "amount": debt.remaining,
                    "number": number,
                    "due_date": debt.due_date.isoformat(),
                },
                dedup_key=overdue_key(debt.id),
            )
        return len(overdue)


async def deliver_telegram(ctx: dict, business_id: int, user_id: int, event_code: str, data: dict) -> bool:
    """Bitta egaga darhol Telegram xabari. Telegram vaqtincha ishlamasa — keyinroq qayta uriniladi (5 martagacha)."""
    try:
        return await telegram.deliver(business_id, user_id, event_code, data)
    except (telegram_bot.TelegramError, httpx.HTTPError) as error:
        raise Retry(defer=min(ctx["job_try"] * 60, 600)) from error


async def poll_telegram(ctx: dict | None = None) -> int:
    """Botga kelgan yangiliklar: "/start" (akkauntni ulash), botni bloklash."""
    try:
        return await telegram.poll()
    except (telegram_bot.TelegramError, httpx.HTTPError):
        return 0  # tarmoq uzilgan — keyingi chaqiruvda davom etadi


async def daily_summaries(ctx: dict | None = None) -> int:
    """Kunlik xulosa: vaqti kelgan bizneslarning egalariga (har egaga kuniga bir marta)."""
    return await telegram.send_daily_summaries()


# ---------- Tozalash va kechki solishtiruv (docs/07-ishga-tushirish.md, 6.6) ----------

READ_NOTIFICATION_DAYS = 90


async def purge_expired_sessions(ctx: dict | None = None) -> int:
    """Muddati o'tgan sessiyalarni o'chiradi (ular baribir ishlamaydi). O'chirilganlar sonini qaytaradi."""
    async with system_session() as db:
        result = await db.execute(delete(UserSession).where(UserSession.expires_at < func.now()))
        return result.rowcount


async def purge_read_notifications(ctx: dict | None = None) -> int:
    """90 kundan eski o'qilgan xabarlarni o'chiradi; o'qilmaganlar qoladi."""
    async with system_session() as db:
        result = await db.execute(
            delete(Notification).where(
                Notification.read_at < datetime.now(UTC) - timedelta(days=READ_NOTIFICATION_DAYS)
            )
        )
        return result.rowcount


async def reconcile_stock(ctx: dict | None = None) -> int:
    """Ledger kafolati: har partiya-joy qoldig'i harakatlar yig'indisiga tengmi. Farqlar sonini qaytaradi.

    Hech narsa tuzatilmaydi — farq bo'lsa, demak qoldiq `move_stock` dan tashqarida o'zgargan (yoki xato bor):
    platforma egasiga xabar, sababini odam ko'radi.
    """
    ledger = (
        select(
            StockMovement.batch_id,
            StockMovement.location_id,
            func.sum(StockMovement.qty_m).label("moved"),
        )
        .group_by(StockMovement.batch_id, StockMovement.location_id)
        .subquery()
    )
    moved = func.coalesce(ledger.c.moved, 0)
    async with system_session() as db:
        drifted = (
            await db.execute(
                select(BatchStock.business_id, BatchStock.batch_id, BatchStock.location_id, BatchStock.qty_m, moved)
                .outerjoin(
                    ledger,
                    (ledger.c.batch_id == BatchStock.batch_id)
                    & (ledger.c.location_id == BatchStock.location_id),
                )
                .where(BatchStock.qty_m != moved)
                .order_by(BatchStock.business_id, BatchStock.batch_id)
            )
        ).all()
    if drifted:
        lines = [
            f"biznes {business_id}, partiya {batch_id}, joy {location_id}: qoldiq {qty_m}, "
            f"harakatlar {total}, farq {qty_m - total}"
            for business_id, batch_id, location_id, qty_m, total in drifted[:20]
        ]
        if len(drifted) > 20:
            lines.append(f"... yana {len(drifted) - 20} ta")
        await alerts.alert_platform(
            f"⚠️ Qoldiq solishtiruvi: {len(drifted)} ta farq (batch_stock ≠ stock_movements yig'indisi)\n"
            + "\n".join(lines)
        )
    return len(drifted)


# Partiya shuncha vaqt 0 qoldiq bilan ochiq tursa — "partiyani yoping" eslatmasi (docs/03-details/05-ombor.md)
EMPTY_AFTER = timedelta(days=7)


async def remind_empty_batches(ctx: dict | None = None, *, idle: timedelta = EMPTY_AFTER) -> int:
    """Tugagan (0 m), lekin yopilmagan partiyalar: o'sha joy xodimlari va egalarga bitta eslatma (har partiya-joyga
    bir marta). Avto-yopilmaydi — tizimda 0 bo'lsa ham mato qolgan bo'lishi mumkin. Yangi eslatmalar sonini qaytaradi."""
    last_move = (
        select(
            StockMovement.batch_id,
            StockMovement.location_id,
            func.max(StockMovement.created_at).label("at"),
        )
        .group_by(StockMovement.batch_id, StockMovement.location_id)
        .subquery()
    )
    incoming = (
        select(TransferLine.id)
        .join(Transfer, Transfer.id == TransferLine.transfer_id)
        .where(
            TransferLine.batch_id == BatchStock.batch_id,
            Transfer.to_location_id == BatchStock.location_id,
            Transfer.status == "in_transit",
        )
        .exists()
    )
    async with system_session() as db:
        rows = (
            await db.execute(
                select(BatchStock, Batch.number, Location)
                .join(Batch, Batch.id == BatchStock.batch_id)
                .join(Receipt, Receipt.id == Batch.receipt_id)
                .join(Location, Location.id == BatchStock.location_id)
                .join(
                    last_move,
                    (last_move.c.batch_id == BatchStock.batch_id)
                    & (last_move.c.location_id == BatchStock.location_id),
                )
                .where(
                    BatchStock.status == "open",
                    BatchStock.qty_m == 0,
                    Receipt.status == "active",
                    Location.is_active,
                    last_move.c.at <= datetime.now(UTC) - idle,
                    ~incoming,
                )
            )
        ).all()
        sent = 0
        for stock, number, location in rows:
            key = empty_key(stock.batch_id, stock.location_id)
            already = await db.scalar(
                select(func.count()).select_from(Notification).where(Notification.dedup_key == key)
            )
            if already:
                continue
            people = set(await notifications.location_staff_ids(db, location))
            people.update(await notifications.owner_ids(db, stock.business_id))
            await notifications.notify(
                db,
                business_id=stock.business_id,
                user_ids=people,
                event_code="batch.empty_open",
                data={
                    "batch_id": stock.batch_id,
                    "number": number,
                    "location": location.name,
                    "location_id": location.id,
                },
                dedup_key=key,
            )
            sent += 1
        return sent


class WorkerSettings:
    functions = [  # noqa: RUF012 — arq shu ko'rinishni kutadi
        remind_stale_transfers,
        remind_overdue_debts,
        deliver_telegram,
        poll_telegram,
        daily_summaries,
        purge_expired_sessions,
        purge_read_notifications,
        reconcile_stock,
        remind_empty_batches,
    ]
    # Soatlar — ishchi konteynerining vaqt mintaqasida (TZ=Asia/Tashkent, docker-compose.prod.yml)
    cron_jobs = [  # noqa: RUF012
        cron(remind_stale_transfers, minute=0),  # har soat boshida
        cron(remind_overdue_debts, minute=5),  # har soatda: yangi kun boshlanishi bilan xabar ketadi
        cron(poll_telegram, second=set(range(0, 60, 3))),  # har 3 soniyada: ulash deyarli darhol ishlaydi
        cron(daily_summaries, minute=set(range(0, 60, 10))),  # har 10 daqiqada: uzilish bo'lsa qayta urinadi
        cron(reconcile_stock, hour=2, minute=30),  # kechasi, zaxiradan oldin
        cron(purge_expired_sessions, weekday=0, hour=4, minute=0),  # dushanba
        cron(purge_read_notifications, hour=4, minute=10),
        cron(remind_empty_batches, hour=9, minute=0),  # ish kuni boshida
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    health_check_interval = 60  # `arq --check` (konteyner healthcheck) shu kalitga qaraydi
