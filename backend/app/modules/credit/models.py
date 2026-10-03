"""Nasiya jadvallari: mijozlar, qarzlar, to'lovlar va hisobdan chiqarish.

Mijoz biznes bo'yicha umumiy — istalgan do'konda nasiya oladi va to'laydi. Qarz har nasiya sotuvdan
alohida paydo bo'ladi; qolgan qarz = amount − paid − written_off − returned. Pul — butun so'm.
To'lov bir nechta qarzni yopishi mumkin — har biriga qancha tushgani `payment_allocations` da.
To'lov va hisobdan chiqarish yozuvlari faqat qo'shiladi.
"""
from datetime import date, datetime

from sqlalchemy import CheckConstraint, ForeignKey, Identity, Index, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Customer(Base):
    """Mijoz. O'chirilmaydi; telefon biznes ichida noyob."""

    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("business_id", "phone"),)

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    name: Mapped[str]
    phone: Mapped[str]
    note: Mapped[str | None]
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Debt(Base):
    """Bitta nasiya sotuvning qarzi. Muddat (`due_date`) qarz yaratilganda qotiriladi —
    keyin sozlamadagi kun o'zgarsa, eski qarzlar siljimaydi."""

    __tablename__ = "debts"
    __table_args__ = (
        UniqueConstraint("sale_id"),
        CheckConstraint("status IN ('active', 'cancelled')", name="status"),
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint(
            "paid >= 0 AND written_off >= 0 AND returned >= 0 "
            "AND paid + written_off + returned <= amount",
            name="settled",
        ),
        Index("ix_debts_business_id_customer_id", "business_id", "customer_id"),
        Index("ix_debts_business_id_due_date", "business_id", "due_date"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    amount: Mapped[int]  # sotuv jami − boshlang'ich to'lov
    paid: Mapped[int] = mapped_column(server_default="0")
    written_off: Mapped[int] = mapped_column(server_default="0")
    returned: Mapped[int] = mapped_column(server_default="0")  # qaytarilgan tovar hisobiga
    due_date: Mapped[date]
    status: Mapped[str] = mapped_column(server_default="active")  # sotuv bekor qilinsa — cancelled
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    @property
    def remaining(self) -> int:
        return self.amount - self.paid - self.written_off - self.returned


class DebtPayment(Base):
    """Mijozdan qabul qilingan to'lov (naqd yoki karta)."""

    __tablename__ = "debt_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount"),
        CheckConstraint("method IN ('cash', 'card')", name="method"),
        Index("ix_debt_payments_business_id_customer_id", "business_id", "customer_id"),
        Index("ix_debt_payments_business_id_created_at", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    store_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))  # pul qaysi do'konga tushdi
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    amount: Mapped[int]
    method: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class PaymentAllocation(Base):
    """To'lovning bitta qarzga tushgan qismi."""

    __tablename__ = "payment_allocations"
    __table_args__ = (
        UniqueConstraint("payment_id", "debt_id"),
        CheckConstraint("amount > 0", name="amount"),
        Index("ix_payment_allocations_debt_id", "debt_id"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    payment_id: Mapped[int] = mapped_column(ForeignKey("debt_payments.id"))
    debt_id: Mapped[int] = mapped_column(ForeignKey("debts.id"))
    amount: Mapped[int]


class DebtWriteoff(Base):
    """Qarzning hisobdan chiqarilgan qismi — sababi bilan."""

    __tablename__ = "debt_writeoffs"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount"),
        Index("ix_debt_writeoffs_debt_id", "debt_id"),
        Index("ix_debt_writeoffs_business_id_created_at", "business_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"))
    debt_id: Mapped[int] = mapped_column(ForeignKey("debts.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    amount: Mapped[int]
    reason: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
