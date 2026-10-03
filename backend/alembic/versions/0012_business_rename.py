"""business rename — biznes egasi o'z biznes nomini o'zgartira oladi.

Biznes qarori (2026-10-03): nom Sozlamalar sahifasida o'zgartiriladi (jurnalga yoziladi). Ilova roliga
faqat `name` ustunini yozish huquqi qo'shiladi; holat (faol / bloklangan) va boshqa ustunlar avvalgidek
faqat platforma egasida (0001-migratsiyadagi ustun darajasidagi huquqlar).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-03 16:20:00.000000
"""
from collections.abc import Sequence

from alembic import op
from app.core.rls import app_role

revision: str = '0012'
down_revision: str | None = '0011'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(f"GRANT UPDATE (name) ON businesses TO {app_role()}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE (name) ON businesses FROM {app_role()}")
