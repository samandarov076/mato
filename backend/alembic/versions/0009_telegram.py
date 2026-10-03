"""telegram — egalarning Telegram bog'lanishi (docs/05-baza-sxemasi.md, 5-bo'lim).

telegram_links: har egaga bitta qator — qaysi Telegram suhbatiga ulangan va nimalarni olishni xohlaydi
(kunlik xulosa, darhol xabarlar). Uzilganda qator o'chirilmaydi — `chat_id` bo'shatiladi.
Kunlik xulosa vaqti — `businesses.daily_summary_time` (1-migratsiyada yaratilgan).

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-02 15:27:09.247146
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.rls import enable_tenant_rls

revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('telegram_links',
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('business_id', sa.BigInteger(), nullable=False),
    sa.Column('chat_id', sa.BigInteger(), nullable=True),
    sa.Column('username', sa.Text(), nullable=True),
    sa.Column('daily_summary', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('instant_alerts', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('linked_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name=op.f('fk_telegram_links_business_id_businesses')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_telegram_links_user_id_users')),
    sa.PrimaryKeyConstraint('user_id', name=op.f('pk_telegram_links'))
    )
    op.create_index('ix_telegram_links_business_id', 'telegram_links', ['business_id'], unique=False)
    # Row-Level Security: faqat o'z biznesi; ilova roli qatorni o'chira olmaydi (uzish — chat_id ni bo'shatish)
    enable_tenant_rls("telegram_links", grant="SELECT, INSERT, UPDATE")


def downgrade() -> None:
    op.drop_index('ix_telegram_links_business_id', table_name='telegram_links')
    op.drop_table('telegram_links')
