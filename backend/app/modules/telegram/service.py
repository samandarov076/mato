"""Telegram: akkauntni ulash, darhol xabarlar va kunlik xulosa.

Qoidalar (docs/03-details/09-bildirishnomalar.md):
- bitta umumiy platforma boti; har ega Telegram'ni o'zi ulaydi va sozlaydi;
- ulash — bir martalik havola orqali: profil → havola → botda "Start";
- Telegram'ga darhol faqat ikki hodisa boradi: ko'chirish farqi va katta metr farqi; qolgani — tizim ichida;
- kunlik xulosa — biznes sozlamasidagi soatda, egasining tilida; savdo bo'lmasa ham yuboriladi;
- ega botni bloklasa — bog'lanish uziladi va tizim ichida "Telegram uzildi" xabari yoziladi;
- faolsiz xodimga va uzilgan Telegram'ga xabar yuborilmaydi.
Yuborish fonda (navbat orqali) — foydalanuvchi so'rovi Telegram javobini kutmaydi.
"""
import logging
import secrets
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import system_session, tenant_session
from app.core.deps import AuthContext
from app.core.errors import AppError
from app.core.redis import get_redis
from app.modules.auth.models import User
from app.modules.credit.models import Debt
from app.modules.inventory import service as inventory
from app.modules.notifications import service as notifications
from app.modules.platform.models import Business
from app.modules.reports import service as reports
from app.modules.reports.service import Scope
from app.modules.telegram import bot, texts
from app.modules.telegram.models import TelegramLink
from app.modules.telegram.schemas import LinkOut, PrefsIn, TelegramStatus

log = logging.getLogger(__name__)

# Telegram'ga darhol boradigan hodisalar (qolganlari faqat tizim ichida)
INSTANT = frozenset({"transfer.diff", "batch.big_diff"})
LINK_TTL = 15 * 60  # ulash havolasi shuncha soniya yashaydi
_UPDATES = ["message", "my_chat_member"]


def _link_key(token: str) -> str:
    return f"tg:link:{token}"


def _summary_key(user_id: int, day: date) -> str:
    return f"tg:summary:{user_id}:{day.isoformat()}"


# ====================== Sozlamalar (profil) ======================


async def status(ctx: AuthContext) -> TelegramStatus:
    link = await ctx.db.get(TelegramLink, ctx.user.id)
    return TelegramStatus(
        configured=bot.configured(),
        linked=link is not None and link.chat_id is not None,
        username=link.username if link and link.chat_id is not None else None,
        daily_summary=link.daily_summary if link else True,
        instant_alerts=link.instant_alerts if link else True,
    )


async def create_link(ctx: AuthContext) -> LinkOut:
    """Bir martalik ulash havolasi: bosilsa bot ochiladi, "Start" bosilgach akkaunt bog'lanadi."""
    if not bot.configured():
        raise AppError(503, "telegram_not_configured")
    token = secrets.token_urlsafe(24)
    await get_redis().set(_link_key(token), ctx.user.id, ex=LINK_TTL)
    return LinkOut(url=f"https://t.me/{await bot.username()}?start={token}", expires_in=LINK_TTL)


async def _own_link(ctx: AuthContext) -> TelegramLink:
    link = await ctx.db.get(TelegramLink, ctx.user.id)
    if link is None:
        link = TelegramLink(user_id=ctx.user.id, business_id=ctx.business.id)
        ctx.db.add(link)
    return link


async def update_prefs(ctx: AuthContext, body: PrefsIn) -> None:
    link = await _own_link(ctx)
    link.daily_summary, link.instant_alerts = body.daily_summary, body.instant_alerts


async def unlink(ctx: AuthContext) -> None:
    """Telegram'ni uzadi. Sozlamalar saqlanib qoladi — qayta ulansa, o'sha holatda davom etadi."""
    link = await ctx.db.get(TelegramLink, ctx.user.id)
    if link is not None:
        link.chat_id, link.username, link.linked_at = None, None, None


# ====================== Botga kelgan xabarlar ======================


def _language(code: str | None) -> str:
    """Hali bog'lanmagan odamga javob tili — Telegram'dagi til bo'yicha (bo'lmasa o'zbekcha)."""
    return code if code in ("en", "ru") else "uz"


async def _reply(chat_id: int, text: str) -> None:
    try:
        await bot.send(chat_id, text)
    except Exception:
        log.exception("Telegram javobi yuborilmadi (chat %s)", chat_id)


async def _drop(db: AsyncSession, link: TelegramLink) -> None:
    """Ega botni bloklagan — bog'lanish uziladi va bu haqda tizim ichida xabar qoldiriladi."""
    link.chat_id, link.username, link.linked_at = None, None, None
    await notifications.notify(
        db,
        business_id=link.business_id,
        user_ids=[link.user_id],
        event_code="telegram.disconnected",
        data={},
    )


async def handle_update(update: dict[str, Any]) -> None:
    """Botga kelgan bitta yangilik: "/start <token>" — ulash; bot bloklandi — uzish."""
    member = update.get("my_chat_member")
    if member:
        if (member.get("new_chat_member") or {}).get("status") == "kicked":
            async with system_session() as db:
                links = await db.scalars(select(TelegramLink).where(TelegramLink.chat_id == member["chat"]["id"]))
                for link in links.all():
                    await _drop(db, link)
        return

    message = update.get("message") or {}
    text, chat, sender = message.get("text") or "", message.get("chat") or {}, message.get("from") or {}
    if chat.get("type") != "private" or not text.startswith("/start"):
        return
    chat_id, language = chat["id"], _language(sender.get("language_code"))
    token = text.partition(" ")[2].strip()
    if not token:
        return await _reply(chat_id, texts.render(language, "start_help"))

    user_id = await get_redis().getdel(_link_key(token))  # havola bir marta ishlaydi
    async with system_session() as db:
        user = await db.get(User, int(user_id)) if user_id else None
        if user is None or not user.is_active or user.role != "owner":
            return await _reply(chat_id, texts.render(language, "link_expired"))
        business = await db.get(Business, user.business_id)
        link = await db.get(TelegramLink, user.id)
        if link is None:
            link = TelegramLink(user_id=user.id, business_id=user.business_id)
            db.add(link)
        link.chat_id, link.username, link.linked_at = chat_id, sender.get("username"), datetime.now(UTC)
        reply = texts.render(user.language, "linked", business=business.name)
    await _reply(chat_id, reply)


async def poll() -> int:
    """Botga kelgan yangiliklarni oladi (ishchi bir necha soniyada bir chaqiradi). Soni qaytadi."""
    if not bot.configured():
        return 0
    redis = get_redis()
    offset = int(await redis.get("tg:offset") or 0)
    updates = await bot.call("getUpdates", offset=offset, timeout=0, allowed_updates=_UPDATES)
    for update in updates:
        try:
            await handle_update(update)
        except Exception:
            log.exception("Telegram yangiligi qayta ishlanmadi: %s", update.get("update_id"))
        offset = update["update_id"] + 1
    if updates:
        await redis.set("tg:offset", offset)
    return len(updates)


# ====================== Darhol xabarlar ======================


async def _send(db: AsyncSession, link: TelegramLink, text: str) -> bool:
    """Xabar yuboradi. Ega botni bloklagan bo'lsa — bog'lanishni uzadi. Vaqtinchalik xato — yuqoriga uzatiladi."""
    try:
        await bot.send(link.chat_id, text)
        return True
    except bot.TelegramError as error:
        if not error.blocked:
            raise
        await _drop(db, link)
        return False


async def deliver(business_id: int, user_id: int, event_code: str, data: dict[str, Any]) -> bool:
    """Bitta egaga darhol xabar (ko'chirish farqi, katta metr farqi). Yuborilgan bo'lsa — True."""
    if not bot.configured() or event_code not in INSTANT:
        return False
    async with system_session() as db:
        row = (
            await db.execute(
                select(TelegramLink, User.language)
                .join(User, User.id == TelegramLink.user_id)
                .where(
                    TelegramLink.user_id == user_id,
                    TelegramLink.business_id == business_id,
                    TelegramLink.chat_id.is_not(None),
                    TelegramLink.instant_alerts,
                    User.is_active,
                )
            )
        ).first()
        if row is None:
            return False
        link, language = row
        return await _send(db, link, texts.event(language, event_code, data))


# ====================== Kunlik xulosa ======================


async def send_daily_summaries(now: datetime | None = None) -> int:
    """Kunlik xulosa vaqti kelgan bizneslarning egalariga xulosa yuboradi. Yuborilgan xabarlar soni qaytadi.

    Ishchi buni har 10 daqiqada chaqiradi: Telegram vaqtincha ishlamasa, shu soat ichida qayta uriniladi;
    har egaga kuniga bir marta yuboriladi.
    """
    if not bot.configured():
        return 0
    now = now or datetime.now(UTC)
    async with system_session() as db:
        subscribed = select(TelegramLink.business_id).where(
            TelegramLink.chat_id.is_not(None), TelegramLink.daily_summary
        )
        businesses = (
            await db.scalars(select(Business).where(Business.status == "active", Business.id.in_(subscribed)))
        ).all()
    sent = 0
    for business in businesses:
        local = now.astimezone(ZoneInfo(business.timezone))
        if local.hour == business.daily_summary_time.hour:
            sent += await _summarise(business.id, local.date())
    return sent


async def _summarise(business_id: int, day: date) -> int:
    redis = get_redis()
    async with tenant_session(business_id) as db:
        business = await db.get(Business, business_id)
        owners = (
            await db.execute(
                select(TelegramLink, User)
                .join(User, User.id == TelegramLink.user_id)
                .where(
                    TelegramLink.chat_id.is_not(None),
                    TelegramLink.daily_summary,
                    User.is_active,
                    User.role == "owner",
                )
            )
        ).all()
        waiting = [(link, user) for link, user in owners if not await redis.exists(_summary_key(user.id, day))]
        if not waiting:
            return 0

        # Raqamlar dashboard bilan bir joydan hisoblanadi — bir xil chiqadi
        ctx = AuthContext(user=waiting[0][1], business=business, session_id=0, db=db)
        today, before = await reports.totals(ctx, Scope(day, day)), await reports.totals(ctx, Scope(day, day).previous())
        low = await inventory.list_stock(ctx, only="low", limit=1)
        remaining = Debt.amount - Debt.paid - Debt.written_off - Debt.returned
        overdue_customers, overdue_amount = (
            await db.execute(
                select(func.count(distinct(Debt.customer_id)), func.coalesce(func.sum(remaining), 0)).where(
                    Debt.status == "active", remaining > 0, Debt.due_date < day
                )
            )
        ).one()

        sent = 0
        for link, user in waiting:
            text = texts.summary(
                user.language,
                business=business.name,
                day=day,
                sales=today.sales,
                previous_sales=before.sales,
                cash=today.cash or 0,
                card=today.card or 0,
                profit=today.profit,
                count=today.count,
                low_stock=low.total,
                overdue_customers=overdue_customers,
                overdue_amount=int(overdue_amount),
            )
            try:
                delivered = await _send(db, link, text)
            except Exception:
                log.exception("Kunlik xulosa yuborilmadi (xodim %s) — keyingi urinishda", user.id)
                continue
            # Yuborildi yoki bog'lanish uzildi — bugun bu egaga qayta urinilmaydi
            await redis.set(_summary_key(user.id, day), 1, ex=2 * 24 * 3600)
            sent += int(delivered)
        return sent
