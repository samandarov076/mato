"""store login — do'kon qurilmasi uchun do'konning o'z logini va paroli.

Biznes qarori (2026-10-03): do'kon planshetini biznes egasi o'z paroli bilan ochishi shart emas — har
do'konning alohida logini va paroli bor. Shu login bilan kirilgan brauzer do'kon qurilmasi bo'lib qoladi
(PIN ekrani), sotuvchilar avvalgidek PIN bilan kiradi. Login butun tizimda noyob (kirish sahifasi biznesni
bilmaydi), katta-kichik harf farqsiz. Parol — xesh (kirish uchun) va shifrlangan nusxa (ega ko'rishi uchun).

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-03 13:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0011'
down_revision: str | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('locations', sa.Column('login', sa.Text(), nullable=True))
    op.add_column('locations', sa.Column('password_hash', sa.Text(), nullable=True))
    op.add_column('locations', sa.Column('password_enc', sa.Text(), nullable=True))
    op.create_index(
        'uq_locations_login',
        'locations',
        [sa.text('lower(login)')],
        unique=True,
        postgresql_where=sa.text('login IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_locations_login', table_name='locations')
    op.drop_column('locations', 'password_enc')
    op.drop_column('locations', 'password_hash')
    op.drop_column('locations', 'login')
