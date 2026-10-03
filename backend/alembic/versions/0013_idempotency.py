"""idempotency — qarz to'lovi, kirim va ko'chirishda takrorlanishdan himoya.

Audit (2026-10-03): javob yo'qolib tugma qayta bosilsa, to'lov ikki marta yozilar yoki qoldiq ikki barobar
kirardi. Sotuvdagi naqsh (7-migratsiya, `sales.client_uuid`) shu uch jadvalga ham qo'llanadi: interfeys har
amalga noyob identifikator beradi, server uni biznes ichida bir marta qabul qiladi.

Ustun bo'sh bo'lishi mumkin — avvalgi yozuvlarda identifikator yo'q (NULL'lar noyoblikni buzmaydi);
API orqali kelgan har yangi yozuvda majburiy. RLS va huquqlar o'zgarmaydi (jadval darajasida berilgan).

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-03 21:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0013'
down_revision: str | None = '0012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("debt_payments", "receipts", "transfers")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column('client_uuid', sa.Uuid(), nullable=True))
        op.create_unique_constraint(
            op.f(f'uq_{table}_business_id_client_uuid'), table, ['business_id', 'client_uuid']
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(op.f(f'uq_{table}_business_id_client_uuid'), table, type_='unique')
        op.drop_column(table, 'client_uuid')
