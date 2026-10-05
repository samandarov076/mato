"""totp_secret_sealed — tasdiqlash ilovasi kaliti bazada shifrlangan holda.

Texnik qarz (ishga tushirishdan oldin): `users.totp_secret` ochiq turardi — baza o'g'irlansa platforma egasining
ikkinchi bosqichi ochiq bo'lardi. Endi qiymat `app.core.vault.seal` bilan (CREDENTIALS_KEY) saqlanadi; kod uni
o'qishda `unseal` qiladi. Zaxira kodlar avvaldan xeshlangan — tegilmaydi. Ustun turi o'zgarmaydi.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-04 02:10:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.core.vault import seal, unseal

revision: str = '0014'
down_revision: str | None = '0013'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _rewrite(convert) -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL")).all()
    for user_id, value in rows:
        bind.execute(
            sa.text("UPDATE users SET totp_secret = :value WHERE id = :id"),
            {"value": convert(value), "id": user_id},
        )


def upgrade() -> None:
    _rewrite(seal)


def downgrade() -> None:
    # Kalit mos kelmasa (unseal None) — qiymat o'chiriladi: ega ilovani qayta ulaydi
    _rewrite(unseal)
