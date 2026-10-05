"""system_role — `system_session` uchun cheklangan rol (mato_system).

Texnik qarz (ishga tushirishdan oldin): RLS'dan tashqari sessiya jadvallar egasi (superuser) bilan ishlardi.
Endi alohida rol: `LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`; barcha jadvallarga SELECT, INSERT, UPDATE;
DELETE faqat tozalash kerak bo'lgan jadvallarda (sessions, notifications, recovery_codes). DDL yo'q — ilova
sirlari o'g'irlansa ham sxema buzilmaydi, biznes ma'lumoti o'chirilmaydi. `audit_logs` ga UPDATE ham yo'q
(trigger bor, lekin huquq ham berilmaydi). Kelajakda egasi yaratadigan jadvallarga ALTER DEFAULT PRIVILEGES.

Rol nomi va paroli — DATABASE_SYSTEM_URL dan (docs/07-ishga-tushirish.md, 6.2).

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-04 02:20:00.000000
"""
from collections.abc import Sequence

from alembic import op
from app.core.rls import ensure_system_role, system_role

revision: str = '0015'
down_revision: str | None = '0014'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tozalash vazifalari (app/worker.py) va 2FA'ni o'chirish shu jadvallardan o'chiradi
DELETABLE = ("sessions", "notifications", "recovery_codes")


def upgrade() -> None:
    ensure_system_role()
    role = system_role()
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO {role}")
    # Faqat qo'shiladigan jadvallar (trigger ham bor): huquqning o'zi berilmaydi
    op.execute(f"REVOKE UPDATE ON audit_logs, stock_movements FROM {role}")
    op.execute(f"GRANT DELETE ON {', '.join(DELETABLE)} TO {role}")
    # Keyingi migratsiyalar yaratadigan jadvallar ham avtomatik ochiladi (yaratuvchi — jadvallar egasi)
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO {role}")


def downgrade() -> None:
    role = system_role()
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE ON TABLES FROM {role}")
    op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {role}")
    # Rol o'chirilmaydi (boshqa bazalarda ham ishlatilayotgan bo'lishi mumkin); kirish huquqi olinadi
    op.execute(f"ALTER ROLE {role} NOLOGIN")
