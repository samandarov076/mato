"""Hisobotlar API'sining shakllari. Pul — butun so'm; metr — aniq son."""
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

Period = Literal["day", "week", "month"]
Group = Literal["day", "month"]
TopBy = Literal["sku", "fabric", "color", "pattern"]
Metric = Literal["meters", "amount", "profit"]
DeviationBy = Literal["sku", "seller"]


class Money(BaseModel):
    """Davr ko'rsatkichlari (docs/03-details/08-hisobotlar.md, "Atamalar")."""

    sales: int  # savdo: sotuvlar − qaytarishlar
    returns: int  # shu davrda qaytarilgan tovar summasi
    profit: int  # savdo − sotilgan tovar tannarxi
    # Tushum — kassaga tushgan pul; mato bo'yicha filtrlanganda hisoblanmaydi (None)
    cash: int | None
    card: int | None
    count: int  # sotuvlar soni
    meters: Decimal  # sotilgan metr (qaytarilgani ayirilgan)


class SalesRow(Money):
    period: str  # kun ("2026-10-02") yoki oy ("2026-10")


class SalesReport(BaseModel):
    group: Group
    rows: list[SalesRow]
    total: Money
    previous: Money  # shu uzunlikdagi oldingi davr — taqqoslash uchun


class ChartDay(BaseModel):
    day: date
    sales: int


class Dashboard(BaseModel):
    date_from: date
    date_to: date
    current: Money
    previous: Money
    debt_total: int
    debt_overdue: int
    low_stock: int  # chegaradan pastga tushgan SKU'lar soni
    diff_amount: int  # metr farqi (kam chiqqani + ko'chirishda yo'qolgani), so'm
    diff_m: Decimal
    chart: list[ChartDay]  # oxirgi 30 kun


class HourRow(BaseModel):
    hour: int  # 0–23, biznes vaqti bo'yicha
    count: int
    amount: int


class WeekdayRow(BaseModel):
    weekday: int  # 1 — dushanba ... 7 — yakshanba
    count: int
    amount: int


class HoursReport(BaseModel):
    hours: list[HourRow]
    weekdays: list[WeekdayRow]


class TopRow(BaseModel):
    id: int
    label: str
    meters: Decimal
    amount: int
    profit: int


class StockPlace(BaseModel):
    location_id: int
    name: str
    type: Literal["store", "warehouse"]
    meters: Decimal
    rolls: int  # taxminiy
    value: int  # tannarx bo'yicha qiymat
    skus: int
    low: int  # kam qoldiqdagi SKU'lar


class StockReport(BaseModel):
    places: list[StockPlace]
    meters: Decimal
    value: int


class CreditReport(BaseModel):
    debt_total: int  # hozirgi umumiy qarz
    debt_overdue: int
    debtors: int
    # Davr bo'yicha
    given: int  # berilgan nasiya
    paid: int  # qaytgan qarz (to'lovlar)
    returned: int  # qaytarilgan tovar hisobiga kamaygan
    written_off: int  # hisobdan chiqarilgan


class DeviationRow(BaseModel):
    id: int
    label: str
    meters: Decimal
    expected: int  # tavsiya narxda bo'lganida
    actual: int  # haqiqatda sotilgan
    diff: int  # actual − expected (manfiy — arzon sotilgan)
    percent: Decimal


class DeviationReport(BaseModel):
    rows: list[DeviationRow]
    expected: int
    actual: int
    diff: int
    percent: Decimal
