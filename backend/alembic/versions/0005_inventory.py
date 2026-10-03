"""inventory — ko'chirishlar va partiyani yopish (docs/05-baza-sxemasi.md, 3-bo'lim).

transfers, transfer_lines — ikki bosqichli ko'chirish (jo'natish → qabul); batch_closures — partiyani
joyda yopish va metr farqi. Qoldiq jadvallari (batch_stock, stock_movements) 4-migratsiyada.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-02 13:40:15.536025
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_tables()
    # --- Row-Level Security: har jadvalda faqat o'z biznesi; ilova roli hech narsani o'chira olmaydi ---
    for table in ("transfers", "transfer_lines", "batch_closures"):
        enable_tenant_rls(table, grant="SELECT, INSERT, UPDATE")


def _create_tables() -> None:
    # --- Jadvallar (modellardan generatsiya qilingan) ---
    op.create_table('transfers',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('number', sa.Text(), nullable=False),
    sa.Column('from_location_id', sa.BigInteger(), nullable=False),
    sa.Column('to_location_id', sa.BigInteger(), nullable=False),
    sa.Column('status', sa.Text(), server_default='in_transit', nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('sent_by', sa.BigInteger(), nullable=False),
    sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('received_by', sa.BigInteger(), nullable=True),
    sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('receive_note', sa.Text(), nullable=True),
    sa.Column('cancelled_by', sa.BigInteger(), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("status IN ('in_transit', 'received', 'cancelled')", name=op.f('ck_transfers_status')),
    sa.CheckConstraint('from_location_id <> to_location_id', name=op.f('ck_transfers_locations')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_transfers_business_id_businesses')),
    sa.ForeignKeyConstraint(['cancelled_by'], ['users.id'], name=op.f('fk_transfers_cancelled_by_users')),
    sa.ForeignKeyConstraint(['from_location_id'], ['locations.id'], name=op.f('fk_transfers_from_location_id_locations')),
    sa.ForeignKeyConstraint(['received_by'], ['users.id'], name=op.f('fk_transfers_received_by_users')),
    sa.ForeignKeyConstraint(['sent_by'], ['users.id'], name=op.f('fk_transfers_sent_by_users')),
    sa.ForeignKeyConstraint(['to_location_id'], ['locations.id'], name=op.f('fk_transfers_to_location_id_locations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_transfers')),
    sa.UniqueConstraint('business_id', 'number', name=op.f('uq_transfers_business_id_number'))
    )
    op.create_index('ix_transfers_business_id_status_sent_at', 'transfers', ['business_id', 'status', 'sent_at'], unique=False)
    op.create_table('batch_closures',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('batch_id', sa.BigInteger(), nullable=False),
    sa.Column('location_id', sa.BigInteger(), nullable=False),
    sa.Column('received_m', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('out_m', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('diff_m', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('diff_amount', sa.BigInteger(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('closed_by', sa.BigInteger(), nullable=False),
    sa.Column('closed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('reopened_by', sa.BigInteger(), nullable=True),
    sa.Column('reopened_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_batch_closures_batch_id_batches')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_batch_closures_business_id_businesses')),
    sa.ForeignKeyConstraint(['closed_by'], ['users.id'], name=op.f('fk_batch_closures_closed_by_users')),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_batch_closures_location_id_locations')),
    sa.ForeignKeyConstraint(['reopened_by'], ['users.id'], name=op.f('fk_batch_closures_reopened_by_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_batch_closures'))
    )
    op.create_index('ix_batch_closures_batch_id_location_id', 'batch_closures', ['batch_id', 'location_id'], unique=False)
    op.create_index('ix_batch_closures_business_id_closed_at', 'batch_closures', ['business_id', 'closed_at'], unique=False)
    op.create_table('transfer_lines',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('transfer_id', sa.BigInteger(), nullable=False),
    sa.Column('batch_id', sa.BigInteger(), nullable=False),
    sa.Column('sent_rolls', sa.Integer(), nullable=False),
    sa.Column('sent_m', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('received_rolls', sa.Integer(), nullable=True),
    sa.Column('received_m', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.CheckConstraint('received_m >= 0', name=op.f('ck_transfer_lines_received_m')),
    sa.CheckConstraint('received_rolls >= 0', name=op.f('ck_transfer_lines_received_rolls')),
    sa.CheckConstraint('sent_m > 0', name=op.f('ck_transfer_lines_sent_m')),
    sa.CheckConstraint('sent_rolls >= 0', name=op.f('ck_transfer_lines_sent_rolls')),
    sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_transfer_lines_batch_id_batches')),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_transfer_lines_business_id_businesses')),
    sa.ForeignKeyConstraint(['transfer_id'], ['transfers.id'], name=op.f('fk_transfer_lines_transfer_id_transfers')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_transfer_lines')),
    sa.UniqueConstraint('transfer_id', 'batch_id', name=op.f('uq_transfer_lines_transfer_id_batch_id'))
    )
    op.create_index('ix_transfer_lines_batch_id', 'transfer_lines', ['batch_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_transfer_lines_batch_id', table_name='transfer_lines')
    op.drop_table('transfer_lines')
    op.drop_index('ix_batch_closures_business_id_closed_at', table_name='batch_closures')
    op.drop_index('ix_batch_closures_batch_id_location_id', table_name='batch_closures')
    op.drop_table('batch_closures')
    op.drop_index('ix_transfers_business_id_status_sent_at', table_name='transfers')
    op.drop_table('transfers')
