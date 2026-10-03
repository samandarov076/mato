"""receiving — kirim hujjatlari, partiyalar va qoldiqning ikki qatlami (docs/05-baza-sxemasi.md, 3-bo'lim).

receipts, batches — kirim (04-receiving). batch_stock, stock_movements — qoldiq va harakatlar jurnali
(05-inventory ham shulardan foydalanadi; kirim skladga qoldiq tushirgani uchun shu yerda yaratiladi).
stock_movements faqat qo'shiladi: yangilash, o'chirish va TRUNCATE trigger bilan taqiqlangan.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-02 13:17:25.973162
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_tables()
    # --- Row-Level Security: har jadvalda faqat o'z biznesi; ilova roli hech narsani o'chira olmaydi ---
    for table in ("receipts", "batches", "batch_stock"):
        enable_tenant_rls(table, grant="SELECT, INSERT, UPDATE")
    enable_tenant_rls("stock_movements", grant="SELECT, INSERT")
    # --- Harakatlar jurnali o'zgarmas (jadval egasi uchun ham) ---
    op.execute(
        "CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements "
        "FOR EACH ROW EXECUTE FUNCTION forbid_change()"
    )
    op.execute(
        "CREATE TRIGGER stock_movements_no_truncate BEFORE TRUNCATE ON stock_movements "
        "FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()"
    )


def _create_tables() -> None:
    # --- Jadvallar (modellardan generatsiya qilingan) ---
    op.create_table('receipts',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('warehouse_id', sa.BigInteger(), nullable=False),
    sa.Column('number', sa.Text(), nullable=False),
    sa.Column('receipt_date', sa.Date(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('status', sa.Text(), server_default='active', nullable=False),
    sa.Column('created_by', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('cancelled_by', sa.BigInteger(), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('active', 'cancelled')", name=op.f('ck_receipts_status')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_receipts_business_id_businesses')),
    sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], name=op.f('fk_receipts_cancelled_by_users')),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_receipts_created_by_users')),
    sa.ForeignKeyConstraint(['warehouse_id'], ['locations.id'], name=op.f('fk_receipts_warehouse_id_locations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_receipts')),
    sa.UniqueConstraint('business_id', 'number', name=op.f('uq_receipts_business_id_number'))
    )
    op.create_index('ix_receipts_business_id_receipt_date', 'receipts', ['business_id', 'receipt_date'], unique=False)
    op.create_table('batches',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('receipt_id', sa.BigInteger(), nullable=False),
    sa.Column('sku_id', sa.BigInteger(), nullable=False),
    sa.Column('number', sa.Text(), nullable=False),
    sa.Column('rolls_count', sa.Integer(), nullable=False),
    sa.Column('meters_labeled', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('kg', sa.Numeric(precision=12, scale=3), nullable=True),
    sa.Column('m_per_kg', sa.Numeric(precision=10, scale=4), nullable=True),
    sa.Column('cost_per_m', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('cost_per_m >= 0', name=op.f('ck_batches_cost_per_m')),
    sa.CheckConstraint('kg > 0', name=op.f('ck_batches_kg')),
    sa.CheckConstraint('m_per_kg > 0', name=op.f('ck_batches_m_per_kg')),
    sa.CheckConstraint('meters_labeled > 0', name=op.f('ck_batches_meters_labeled')),
    sa.CheckConstraint('rolls_count >= 1', name=op.f('ck_batches_rolls_count')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_batches_business_id_businesses')),
    sa.ForeignKeyConstraint(['receipt_id'], ['receipts.id'], name=op.f('fk_batches_receipt_id_receipts')),
    sa.ForeignKeyConstraint(['sku_id'], ['skus.id'], name=op.f('fk_batches_sku_id_skus')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_batches')),
    sa.UniqueConstraint('business_id', 'number', name=op.f('uq_batches_business_id_number'))
    )
    op.create_index('ix_batches_receipt_id', 'batches', ['receipt_id'], unique=False)
    op.create_index('ix_batches_sku_id', 'batches', ['sku_id'], unique=False)
    op.create_table('batch_stock',
    sa.Column('batch_id', sa.BigInteger(), nullable=False),
    sa.Column('location_id', sa.BigInteger(), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('received_m', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('qty_m', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('status', sa.Text(), server_default='open', nullable=False),
    sa.CheckConstraint("status IN ('open', 'closed')", name=op.f('ck_batch_stock_status')),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_batch_stock_batch_id_batches')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_batch_stock_business_id_businesses')),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_batch_stock_location_id_locations')),
    sa.PrimaryKeyConstraint('batch_id', 'location_id', name=op.f('pk_batch_stock'))
    )
    op.create_index('ix_batch_stock_location_id_batch_id', 'batch_stock', ['location_id', 'batch_id'], unique=False)
    op.create_table('stock_movements',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('batch_id', sa.BigInteger(), nullable=False),
    sa.Column('location_id', sa.BigInteger(), nullable=False),
    sa.Column('qty_m', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('type', sa.Text(), nullable=False),
    sa.Column('ref_type', sa.Text(), nullable=True),
    sa.Column('ref_id', sa.BigInteger(), nullable=True),
    sa.Column('user_id', sa.BigInteger(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("type IN ('receipt', 'receipt_cancel', 'transfer_out', 'transfer_in', 'transfer_cancel', 'sale', 'sale_cancel', 'return', 'close', 'reopen', 'correction')", name=op.f('ck_stock_movements_type')),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_stock_movements_batch_id_batches')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_stock_movements_business_id_businesses')),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_stock_movements_location_id_locations')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_stock_movements_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_stock_movements'))
    )
    op.create_index('ix_stock_movements_batch_id_location_id_created_at', 'stock_movements', ['batch_id', 'location_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_stock_movements_batch_id_location_id_created_at', table_name='stock_movements')
    op.drop_table('stock_movements')
    op.drop_index('ix_batch_stock_location_id_batch_id', table_name='batch_stock')
    op.drop_table('batch_stock')
    op.drop_index('ix_batches_sku_id', table_name='batches')
    op.drop_index('ix_batches_receipt_id', table_name='batches')
    op.drop_table('batches')
    op.drop_index('ix_receipts_business_id_receipt_date', table_name='receipts')
    op.drop_table('receipts')
