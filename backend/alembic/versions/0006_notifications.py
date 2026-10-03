"""notifications — tizim ichidagi xabarlar (docs/05-baza-sxemasi.md, 5-bo'lim).

Har xodimga alohida qator; `dedup_key` — bir hodisa uchun xabar bir marta kelishi uchun
(noyob: xodim + kalit). Xabar o'chirilmaydi — o'qilgan deb belgilanadi.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-02 14:02:21.755475
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _create_tables()
    # --- Row-Level Security: faqat o'z biznesi (xodim o'z xabarlarini ko'rishi — servisda) ---
    enable_tenant_rls("notifications", grant="SELECT, INSERT, UPDATE")


def _create_tables() -> None:
    # --- Jadval (modeldan generatsiya qilingan) ---
    op.create_table('notifications',
    sa.Column('id', sa.BigInteger(), sa.Identity(always=False), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('event_code', sa.Text(), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('dedup_key', sa.Text(), nullable=True),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_notifications_business_id_businesses')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications'))
    )
    op.create_index('ix_notifications_user_id_created_at', 'notifications', ['user_id', 'created_at'], unique=False)
    op.create_index('ix_notifications_user_id_unread', 'notifications', ['user_id'], unique=False, postgresql_where=sa.text('read_at IS NULL'))
    op.create_index('uq_notifications_user_id_dedup_key', 'notifications', ['user_id', 'dedup_key'], unique=True, postgresql_where=sa.text('dedup_key IS NOT NULL'))


def downgrade() -> None:
    op.drop_index('uq_notifications_user_id_dedup_key', table_name='notifications', postgresql_where=sa.text('dedup_key IS NOT NULL'))
    op.drop_index('ix_notifications_user_id_unread', table_name='notifications', postgresql_where=sa.text('read_at IS NULL'))
    op.drop_index('ix_notifications_user_id_created_at', table_name='notifications')
    op.drop_table('notifications')
