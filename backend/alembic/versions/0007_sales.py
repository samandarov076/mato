"""sales — sotuv, qaytarish, mijozlar va qarzlar (docs/05-baza-sxemasi.md, 4-bo'lim).

sales, sale_lines, sale_returns, return_lines — sotuv (06-sales); customers, debts — nasiya asosi
(nasiya sotuv shu yerda yoziladi; to'lovlar va hisobdan chiqarish jadvallari — 07-credit migratsiyasida).
Qaytarish yozuvlari faqat qo'shiladi.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-02 14:15:13.647013
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_tables()
    # --- Row-Level Security: har jadvalda faqat o'z biznesi; ilova roli hech narsani o'chira olmaydi ---
    for table in ("customers", "debts", "sales", "sale_lines"):
        enable_tenant_rls(table, grant="SELECT, INSERT, UPDATE")
    for table in ("sale_returns", "return_lines"):
        enable_tenant_rls(table, grant="SELECT, INSERT")


def _create_tables() -> None:
    # --- Jadvallar (modellardan generatsiya qilingan) ---
    op.create_table('customers',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('phone', sa.Text(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_customers_business_id_businesses')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_customers')),
    sa.UniqueConstraint('business_id', 'phone', name=op.f('uq_customers_business_id_phone'))
    )
    op.create_table('sales',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('number', sa.Text(), nullable=False),
    sa.Column('client_uuid', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.BigInteger(), nullable=False),
    sa.Column('seller_id', sa.BigInteger(), nullable=False),
    sa.Column('device_id', sa.BigInteger(), nullable=True),
    sa.Column('customer_id', sa.BigInteger(), nullable=True),
    sa.Column('total', sa.BigInteger(), nullable=False),
    sa.Column('payment_type', sa.Text(), nullable=False),
    sa.Column('initial_payment', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('initial_payment_method', sa.Text(), nullable=True),
    sa.Column('returned_total', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('status', sa.Text(), server_default='completed', nullable=False),
    sa.Column('cancelled_by', sa.BigInteger(), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('cancel_reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("initial_payment_method IS NULL OR initial_payment_method IN ('cash', 'card')", name=op.f('ck_sales_initial_payment_method')),
    sa.CheckConstraint("payment_type IN ('cash', 'card', 'credit')", name=op.f('ck_sales_payment_type')),
    sa.CheckConstraint("status IN ('completed', 'cancelled')", name=op.f('ck_sales_status')),
    sa.CheckConstraint('total >= 0 AND initial_payment >= 0 AND returned_total >= 0', name=op.f('ck_sales_amounts')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_sales_business_id_businesses')),
    sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], name=op.f('fk_sales_cancelled_by_users')),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_sales_customer_id_customers')),
    sa.ForeignKeyConstraint(['device_id'], ['devices.id'], name=op.f('fk_sales_device_id_devices')),
    sa.ForeignKeyConstraint(['seller_id'], ['users.id'], name=op.f('fk_sales_seller_id_users')),
    sa.ForeignKeyConstraint(['store_id'], ['locations.id'], name=op.f('fk_sales_store_id_locations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sales')),
    sa.UniqueConstraint('business_id', 'client_uuid', name=op.f('uq_sales_business_id_client_uuid')),
    sa.UniqueConstraint('business_id', 'number', name=op.f('uq_sales_business_id_number'))
    )
    op.create_index('ix_sales_business_id_created_at', 'sales', ['business_id', 'created_at'], unique=False)
    op.create_index('ix_sales_business_id_store_id_created_at', 'sales', ['business_id', 'store_id', 'created_at'], unique=False)
    op.create_index('ix_sales_customer_id', 'sales', ['customer_id'], unique=False)
    op.create_table('debts',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('customer_id', sa.BigInteger(), nullable=False),
    sa.Column('sale_id', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('paid', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('written_off', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('returned', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('due_date', sa.Date(), nullable=False),
    sa.Column('status', sa.Text(), server_default='active', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('active', 'cancelled')", name=op.f('ck_debts_status')),
    sa.CheckConstraint('amount > 0', name=op.f('ck_debts_amount')),
    sa.CheckConstraint('paid >= 0 AND written_off >= 0 AND returned >= 0 AND paid + written_off + returned <= amount', name=op.f('ck_debts_settled')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_debts_business_id_businesses')),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_debts_customer_id_customers')),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], name=op.f('fk_debts_sale_id_sales')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_debts')),
    sa.UniqueConstraint('sale_id', name=op.f('uq_debts_sale_id'))
    )
    op.create_index('ix_debts_business_id_customer_id', 'debts', ['business_id', 'customer_id'], unique=False)
    op.create_index('ix_debts_business_id_due_date', 'debts', ['business_id', 'due_date'], unique=False)
    op.create_table('sale_returns',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('sale_id', sa.BigInteger(), nullable=False),
    sa.Column('store_id', sa.BigInteger(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('debt_amount', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('method', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("method IS NULL OR method IN ('cash', 'card')", name=op.f('ck_sale_returns_method')),
    sa.CheckConstraint('amount > 0 AND debt_amount >= 0 AND debt_amount <= amount', name=op.f('ck_sale_returns_amounts')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_sale_returns_business_id_businesses')),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], name=op.f('fk_sale_returns_sale_id_sales')),
    sa.ForeignKeyConstraint(['store_id'], ['locations.id'], name=op.f('fk_sale_returns_store_id_locations')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sale_returns_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sale_returns'))
    )
    op.create_index('ix_sale_returns_business_id_created_at', 'sale_returns', ['business_id', 'created_at'], unique=False)
    op.create_index('ix_sale_returns_sale_id', 'sale_returns', ['sale_id'], unique=False)
    op.create_table('sale_lines',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('sale_id', sa.BigInteger(), nullable=False),
    sa.Column('batch_id', sa.BigInteger(), nullable=False),
    sa.Column('sku_id', sa.BigInteger(), nullable=False),
    sa.Column('sku_label', sa.Text(), nullable=False),
    sa.Column('meters', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('kg', sa.Numeric(precision=12, scale=3), nullable=True),
    sa.Column('price_per_m', sa.BigInteger(), nullable=False),
    sa.Column('recommended_price_per_m', sa.BigInteger(), nullable=True),
    sa.Column('cost_per_m', sa.BigInteger(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('returned_m', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('negative_stock_note', sa.Text(), nullable=True),
    sa.CheckConstraint('meters > 0', name=op.f('ck_sale_lines_meters')),
    sa.CheckConstraint('price_per_m > 0', name=op.f('ck_sale_lines_price_per_m')),
    sa.CheckConstraint('returned_m >= 0 AND returned_m <= meters', name=op.f('ck_sale_lines_returned_m')),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_sale_lines_batch_id_batches')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_sale_lines_business_id_businesses')),
    sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], name=op.f('fk_sale_lines_sale_id_sales')),
    sa.ForeignKeyConstraint(['sku_id'], ['skus.id'], name=op.f('fk_sale_lines_sku_id_skus')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sale_lines'))
    )
    op.create_index('ix_sale_lines_batch_id', 'sale_lines', ['batch_id'], unique=False)
    op.create_index('ix_sale_lines_sale_id', 'sale_lines', ['sale_id'], unique=False)
    op.create_index('ix_sale_lines_sku_id', 'sale_lines', ['sku_id'], unique=False)
    op.create_table('return_lines',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('return_id', sa.BigInteger(), nullable=False),
    sa.Column('sale_line_id', sa.BigInteger(), nullable=False),
    sa.Column('meters', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.CheckConstraint('meters > 0', name=op.f('ck_return_lines_meters')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_return_lines_business_id_businesses')),
    sa.ForeignKeyConstraint(['return_id'], ['sale_returns.id'], name=op.f('fk_return_lines_return_id_sale_returns')),
    sa.ForeignKeyConstraint(['sale_line_id'], ['sale_lines.id'], name=op.f('fk_return_lines_sale_line_id_sale_lines')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_return_lines'))
    )
    op.create_index('ix_return_lines_return_id', 'return_lines', ['return_id'], unique=False)
    op.create_index('ix_return_lines_sale_line_id', 'return_lines', ['sale_line_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_return_lines_sale_line_id', table_name='return_lines')
    op.drop_index('ix_return_lines_return_id', table_name='return_lines')
    op.drop_table('return_lines')
    op.drop_index('ix_sale_lines_sku_id', table_name='sale_lines')
    op.drop_index('ix_sale_lines_sale_id', table_name='sale_lines')
    op.drop_index('ix_sale_lines_batch_id', table_name='sale_lines')
    op.drop_table('sale_lines')
    op.drop_index('ix_sale_returns_sale_id', table_name='sale_returns')
    op.drop_index('ix_sale_returns_business_id_created_at', table_name='sale_returns')
    op.drop_table('sale_returns')
    op.drop_index('ix_debts_business_id_due_date', table_name='debts')
    op.drop_index('ix_debts_business_id_customer_id', table_name='debts')
    op.drop_table('debts')
    op.drop_index('ix_sales_customer_id', table_name='sales')
    op.drop_index('ix_sales_business_id_store_id_created_at', table_name='sales')
    op.drop_index('ix_sales_business_id_created_at', table_name='sales')
    op.drop_table('sales')
    op.drop_table('customers')
