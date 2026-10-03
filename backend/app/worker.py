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
from sqlalchemy import select

from app import models_registry  # noqa: F401  — barcha modellarni yuklaydi
from app.core.config import get_settings
from app.core.db import system_session
from app.modules.credit.models import Customer, Debt
from app.modules.credit.service import overdue_key
from app.modules.inventory.models import Transfer
from app.modules.inventory.transfers import waiting_key
from app.modules.notifications import service as notifications
from app.modules.platform.models import Business
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


class WorkerSettings:
    functions = [  # noqa: RUF012 — arq shu ko'rinishni kutadi
        remind_stale_transfers,
        remind_overdue_debts,
        deliver_telegram,
        poll_telegram,
        daily_summaries,
    ]
    cron_jobs = [  # noqa: RUF012
        cron(remind_stale_transfers, minute=0),  # har soat boshida
        cron(remind_overdue_debts, minute=5),  # har soatda: yangi kun boshlanishi bilan xabar ketadi
        cron(poll_telegram, second=set(range(0, 60, 3))),  # har 3 soniyada: ulash deyarli darhol ishlaydi
        cron(daily_summaries, minute=set(range(0, 60, 10))),  # har 10 daqiqada: uzilish bo'lsa qayta urinadi
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
