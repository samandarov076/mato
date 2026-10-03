"""credit — qarz to'lovlari va hisobdan chiqarish (docs/05-baza-sxemasi.md, 4-bo'lim).

debt_payments (mijozdan qabul qilingan to'lov), payment_allocations (to'lov qaysi qarzlarga tushdi),
debt_writeoffs (hisobdan chiqarish, sababi bilan). `customers` va `debts` — 7-migratsiyada.
Uchala jadval faqat qo'shiladi: ilova roli yozuvni o'zgartira ham, o'chira ham olmaydi.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-02 14:53:52.576021
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_tables()
    # --- Row-Level Security: faqat o'z biznesi; pul yozuvlari tuzatilmaydi — faqat qo'shiladi ---
    for table in ("debt_payments", "payment_allocations", "debt_writeoffs"):
        enable_tenant_rls(table, grant="SELECT, INSERT")


def _create_tables() -> None:
    # --- Jadvallar (modellardan generatsiya qilingan) ---
    op.create_table('debt_payments',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('customer_id', sa.BigInteger(), nullable=False),
    sa.Column('store_id', sa.BigInteger(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('method', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("method IN ('cash', 'card')", name=op.f('ck_debt_payments_method')),
    sa.CheckConstraint('amount > 0', name=op.f('ck_debt_payments_amount')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_debt_payments_business_id_businesses')),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_debt_payments_customer_id_customers')),
    sa.ForeignKeyConstraint(['store_id'], ['locations.id'], name=op.f('fk_debt_payments_store_id_locations')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_debt_payments_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_debt_payments'))
    )
    op.create_index('ix_debt_payments_business_id_created_at', 'debt_payments', ['business_id', 'created_at'], unique=False)
    op.create_index('ix_debt_payments_business_id_customer_id', 'debt_payments', ['business_id', 'customer_id'], unique=False)
    op.create_table('debt_writeoffs',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('debt_id', sa.BigInteger(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount > 0', name=op.f('ck_debt_writeoffs_amount')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_debt_writeoffs_business_id_businesses')),
    sa.ForeignKeyConstraint(['debt_id'], ['debts.id'], name=op.f('fk_debt_writeoffs_debt_id_debts')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_debt_writeoffs_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_debt_writeoffs'))
    )
    op.create_index('ix_debt_writeoffs_business_id_created_at', 'debt_writeoffs', ['business_id', 'created_at'], unique=False)
    op.create_index('ix_debt_writeoffs_debt_id', 'debt_writeoffs', ['debt_id'], unique=False)
    op.create_table('payment_allocations',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('payment_id', sa.BigInteger(), nullable=False),
    sa.Column('debt_id', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.CheckConstraint('amount > 0', name=op.f('ck_payment_allocations_amount')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_payment_allocations_business_id_businesses')),
    sa.ForeignKeyConstraint(['debt_id'], ['debts.id'], name=op.f('fk_payment_allocations_debt_id_debts')),
    sa.ForeignKeyConstraint(['payment_id'], ['debt_payments.id'], name=op.f('fk_payment_allocations_payment_id_debt_payments')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_payment_allocations')),
    sa.UniqueConstraint('payment_id', 'debt_id', name=op.f('uq_payment_allocations_payment_id_debt_id'))
    )
    op.create_index('ix_payment_allocations_debt_id', 'payment_allocations', ['debt_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_payment_allocations_debt_id', table_name='payment_allocations')
    op.drop_table('payment_allocations')
    op.drop_index('ix_debt_writeoffs_debt_id', table_name='debt_writeoffs')
    op.drop_index('ix_debt_writeoffs_business_id_created_at', table_name='debt_writeoffs')
    op.drop_table('debt_writeoffs')
    op.drop_index('ix_debt_payments_business_id_customer_id', table_name='debt_payments')
    op.drop_index('ix_debt_payments_business_id_created_at', table_name='debt_payments')
    op.drop_table('debt_payments')
