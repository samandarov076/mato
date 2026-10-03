"""Nasiya API'sining shakllari: mijozlar, qarzlar, to'lovlar, hisobdan chiqarish."""
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class CustomerIn(BaseModel):
    name: Name
    phone: str = Field(max_length=32)
    note: Note | None = None


class CustomerBrief(BaseModel):
    """Mijoz tanlovda: sotuvchi nasiya berishdan oldin hozirgi qarzini ko'radi."""

    id: int
    name: str
    phone: str
    debt: int  # umumiy qolgan qarz, so'm


# ---------- Mijozlar ro'yxati va kartochkasi ----------

MoneyMethod = Literal["cash", "card"]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class CustomerUpdate(BaseModel):
    name: Name
    phone: str = Field(max_length=32)
    note: Note | None = None


class ActiveIn(BaseModel):
    is_active: bool


class CustomerRow(BaseModel):
    id: int
    name: str
    phone: str
    note: str | None
    is_active: bool
    debt: int  # umumiy qolgan qarz
    overdue: int  # shundan muddati o'tgani
    oldest_days: int | None  # eng eski yopilmagan qarz necha kunlik
    last_payment_at: datetime | None


class CustomerPage(BaseModel):
    items: list[CustomerRow]
    total: int
    debt_total: int  # filtrga mos mijozlarning jami qarzi
    overdue_total: int


class DebtRow(BaseModel):
    """Bitta nasiya sotuvning qarzi."""

    id: int
    sale_id: int
    sale_number: str
    created_at: datetime
    store: str
    seller: str
    sale_total: int
    initial_payment: int
    amount: int
    paid: int
    written_off: int
    returned: int
    remaining: int
    due_date: date
    overdue: bool
    days: int  # qarz necha kunlik


class AllocationOut(BaseModel):
    sale_id: int
    sale_number: str
    amount: int


class PaymentOut(BaseModel):
    id: int
    created_at: datetime
    amount: int
    method: MoneyMethod
    user: str
    store: str
    allocations: list[AllocationOut]  # qaysi qarzlarga yozildi


class WriteoffOut(BaseModel):
    id: int
    created_at: datetime
    amount: int
    reason: str
    user: str
    sale_id: int
    sale_number: str


class CustomerCard(CustomerRow):
    debts: list[DebtRow]  # eng eskisi birinchi; to'liq yopilganlari oxirida
    payments: list[PaymentOut]
    writeoffs: list[WriteoffOut]


# ---------- Amallar ----------


class PaymentIn(BaseModel):
    amount: int = Field(gt=0)
    method: MoneyMethod
    debt_id: int | None = None  # berilmasa — eng eski qarzdan boshlab


class PaymentCreated(BaseModel):
    id: int
    amount: int
    debt: int  # mijozning to'lovdan keyingi umumiy qarzi


class WriteoffIn(BaseModel):
    amount: int = Field(gt=0)
    reason: Reason
