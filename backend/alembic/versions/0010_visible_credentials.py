"""visible credentials — ko'rsatish uchun shifrlangan parol va PIN.

Biznes egasi o'z xodimlarining, platforma egasi esa biznes egalarining parolini ko'ra oladi
(biznes qarori, 2026-10-02). `users.password_enc` va `users.pin_enc` — shifrlangan nusxalar
(app/core/vault.py); kirish tekshiruvi avvalgidek xesh bo'yicha. Mavjud foydalanuvchilarda bo'sh —
birinchi muvaffaqiyatli kirishda yoki parol/PIN yangilanganda to'ladi.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-02 18:10:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0010'
down_revision: str | None = '0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('password_enc', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('pin_enc', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'pin_enc')
    op.drop_column('users', 'password_enc')
