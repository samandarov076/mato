"""sku_image — har SKU'ning o'z rasmi.

Foydalanuvchi qarori (2026-10-06): rasm mato, rang yoki gulga emas, aynan tovarga (mato + rang + gul) tegishli bo'lsin —
"Atlas · Qizil · Lola" bir rasm, "Atlas · Oq · Lola" boshqa. Mavjud rasmlar (mato / rang / gul) zaxira sifatida qoladi:
SKU rasmi bo'sh bo'lsa, o'shalar ko'rsatiladi. Ustun bo'sh bo'lishi mumkin. RLS va huquqlar jadval darajasida — o'zgarmaydi.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-06 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0016'
down_revision: str | None = '0015'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('skus', sa.Column('image_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('skus', 'image_url')
