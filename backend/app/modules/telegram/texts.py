"""Telegram xabarlari matni — egasining interfeys tilida (uz / en / ru).

Interfeys matnlari frontend'da; bu yerda faqat bot yuboradigan xabarlar. Foydalanuvchi kiritgan qiymatlar
(nomlar, izohlar) HTML uchun ekranlanadi.
"""
from datetime import date
from decimal import Decimal
from html import escape
from typing import Any

NBSP = " "

_T: dict[str, dict[str, str]] = {
    "uz": {
        "linked": "✅ <b>{business}</b> ulandi.\nMuhim xabarlar va kunlik xulosa endi shu yerga keladi.",
        "start_help": "Akkauntni ulash uchun mato-savdo'da <b>Profil → Telegram</b> bo'limidagi "
        "«Telegram'ni ulash» tugmasini bosing.",
        "link_expired": "Bu havola eskirgan yoki allaqachon ishlatilgan. Profil sahifasidan yangisini oling.",
        "transfer.diff.short": "⚠️ <b>{number}</b>: «{target}»ga {meters} m kam keldi ({by} qabul qildi)",
        "transfer.diff.over": "⚠️ <b>{number}</b>: «{target}»ga {meters} m ortiq keldi ({by} qabul qildi)",
        "batch.big_diff.short": "⚠️ <b>{number}</b> yopildi: «{location}»da {meters} m ({percent}%) kam chiqdi — {by}",
        "batch.big_diff.over": "⚠️ <b>{number}</b> yopildi: «{location}»da {meters} m ({percent}%) ortiq chiqdi — {by}",
        "summary.title": "📊 <b>{business}</b> — {date}",
        "summary.sales": "Savdo: <b>{amount} so'm</b>{change}",
        "summary.revenue": "Tushum: {amount} so'm (naqd {cash}, karta {card})",
        "summary.profit": "Foyda: {amount} so'm",
        "summary.empty": "Bugun savdo bo'lmadi.",
        "summary.low": "Kam qoldiq: {count} ta tovar",
        "summary.overdue": "Muddati o'tgan nasiya: {customers} ta mijoz, {amount} so'm",
    },
    "en": {
        "linked": "✅ <b>{business}</b> is connected.\nImportant alerts and the daily summary will arrive here.",
        "start_help": "To connect your account, press “Connect Telegram” under <b>Profile → Telegram</b> "
        "in mato-savdo.",
        "link_expired": "This link has expired or was already used. Get a new one on the Profile page.",
        "transfer.diff.short": "⚠️ <b>{number}</b>: {meters} m short at “{target}” (received by {by})",
        "transfer.diff.over": "⚠️ <b>{number}</b>: {meters} m over at “{target}” (received by {by})",
        "batch.big_diff.short": "⚠️ <b>{number}</b> closed: {meters} m ({percent}%) short at “{location}” — {by}",
        "batch.big_diff.over": "⚠️ <b>{number}</b> closed: {meters} m ({percent}%) over at “{location}” — {by}",
        "summary.title": "📊 <b>{business}</b> — {date}",
        "summary.sales": "Sales: <b>{amount} soʻm</b>{change}",
        "summary.revenue": "Revenue: {amount} soʻm (cash {cash}, card {card})",
        "summary.profit": "Profit: {amount} soʻm",
        "summary.empty": "No sales today.",
        "summary.low": "Low stock: {count} items",
        "summary.overdue": "Overdue credit: {customers} customers, {amount} soʻm",
    },
    "ru": {
        "linked": "✅ <b>{business}</b> подключён.\nВажные уведомления и ежедневная сводка будут приходить сюда.",
        "start_help": "Чтобы подключить аккаунт, нажмите «Подключить Telegram» в разделе "
        "<b>Профиль → Telegram</b> в mato-savdo.",
        "link_expired": "Ссылка устарела или уже использована. Получите новую на странице профиля.",
        "transfer.diff.short": "⚠️ <b>{number}</b>: в «{target}» пришло на {meters} м меньше (принял {by})",
        "transfer.diff.over": "⚠️ <b>{number}</b>: в «{target}» пришло на {meters} м больше (принял {by})",
        "batch.big_diff.short": "⚠️ <b>{number}</b> закрыта: в «{location}» не хватило {meters} м ({percent}%) — {by}",
        "batch.big_diff.over": "⚠️ <b>{number}</b> закрыта: в «{location}» лишних {meters} м ({percent}%) — {by}",
        "summary.title": "📊 <b>{business}</b> — {date}",
        "summary.sales": "Продажи: <b>{amount} сум</b>{change}",
        "summary.revenue": "Выручка: {amount} сум (наличные {cash}, карта {card})",
        "summary.profit": "Прибыль: {amount} сум",
        "summary.empty": "Сегодня продаж не было.",
        "summary.low": "Низкий остаток: товаров — {count}",
        "summary.overdue": "Просроченные долги: клиентов — {customers}, {amount} сум",
    },
}


def number(value: int) -> str:
    """1250000 → "1 250 000" (uzilmaydigan bo'shliq bilan)."""
    return f"{value:,}".replace(",", NBSP)


def meters(value: Any) -> str:
    """"12.00" → "12", "12.50" → "12.5"; ishorasiz."""
    text = format(abs(Decimal(str(value))).normalize(), "f")
    return text


def render(language: str, key: str, **values: Any) -> str:
    """Tayyor matn. Qiymatlar HTML uchun ekranlanadi (xabar HTML rejimida yuboriladi)."""
    template = _T.get(language, _T["uz"])[key]
    return template.format(**{name: escape(str(value)) for name, value in values.items()})


def event(language: str, event_code: str, data: dict[str, Any]) -> str:
    """Darhol xabar matni: ko'chirish farqi yoki katta metr farqi. Musbat farq — kam, manfiy — ortiq."""
    kind = "short" if Decimal(str(data.get("diff", 0))) > 0 else "over"
    values = {**data, "meters": meters(data.get("diff", 0))}
    return render(language, f"{event_code}.{kind}", **values)


def summary(
    language: str,
    *,
    business: str,
    day: date,
    sales: int,
    previous_sales: int,
    cash: int,
    card: int,
    profit: int,
    count: int,
    low_stock: int,
    overdue_customers: int,
    overdue_amount: int,
) -> str:
    """Kunlik xulosa: savdo (kechagiga nisbatan), tushum, foyda, kam qoldiq, muddati o'tgan nasiya."""
    lines = [render(language, "summary.title", business=business, date=day.strftime("%d.%m.%Y"))]
    if count == 0 and sales == 0 and cash == 0 and card == 0:
        lines.append(render(language, "summary.empty"))
    else:
        change = ""
        if previous_sales:
            percent = round((sales - previous_sales) / abs(previous_sales) * 100)
            change = f" ({'+' if percent >= 0 else '−'}{abs(percent)}%)"
        lines.append(render(language, "summary.sales", amount=number(sales), change=change))
        lines.append(
            render(language, "summary.revenue", amount=number(cash + card), cash=number(cash), card=number(card))
        )
        lines.append(render(language, "summary.profit", amount=number(profit)))
    if low_stock:
        lines.append(render(language, "summary.low", count=low_stock))
    if overdue_customers:
        lines.append(
            render(language, "summary.overdue", customers=overdue_customers, amount=number(overdue_amount))
        )
    return "\n".join(lines)
