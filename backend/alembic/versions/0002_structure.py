"""structure — do'kon va sklad nomi biznes ichida takrorlanmaydi (katta-kichik harf farqsiz).

Do'konlar va skladlar alohida ro'yxat: bir xil nomli do'kon va sklad bo'lishi mumkin,
lekin ikkita "Chorsu do'koni" bo'lmaydi. Indeks ifoda asosida (lower(name)), shuning uchun
modelda emas, faqat shu yerda turadi.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02 12:20:00
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX uq_locations_business_id_type_name "
        "ON locations (business_id, type, lower(name))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX uq_locations_business_id_type_name")
