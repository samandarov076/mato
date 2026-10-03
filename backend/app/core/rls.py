"""Row-Level Security yordamchilari — faqat migratsiyalarda ishlatiladi.

Har yangi biznes jadvali uchun migratsiyada `enable_tenant_rls("jadval", grant="...")` chaqiriladi:
u RLS'ni yoqadi, "faqat o'z biznesi" siyosatini qo'yadi va ilova roliga kerakli huquqlarni beradi.
Ilova roliga DELETE berilmaydi (hech narsa o'chirilmaydi) — istisnolar migratsiyada aniq yoziladi.
"""
import re

from sqlalchemy import text
from sqlalchemy.engine import make_url

from alembic import op
from app.core.config import get_settings


def app_role() -> str:
    """Ilova roli nomi — DATABASE_URL dagi foydalanuvchi."""
    role = make_url(get_settings().database_url).username
    if not role or not re.fullmatch(r"[a-z_][a-z0-9_]*", role):
        raise RuntimeError(f"DATABASE_URL dagi rol nomi yaroqsiz: {role!r}")
    return role


def ensure_app_role() -> None:
    """Ilova rolini yaratadi (bo'lmasa) va uning RLS'ni chetlab o'ta olmasligini tekshiradi."""
    role = app_role()
    bind = op.get_bind()
    row = bind.execute(
        text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = :r"), {"r": role}
    ).first()
    if row is None:
        password = (make_url(get_settings().database_url).password or "").replace("'", "''")
        bind.exec_driver_sql(
            f"CREATE ROLE {role} LOGIN PASSWORD '{password}' "
            "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"
        )
    elif row[0]:
        raise RuntimeError(
            f"'{role}' roli RLS'ni chetlab o'tadi (superuser yoki BYPASSRLS). "
            "DATABASE_URL da oddiy ilova roli bo'lishi kerak, jadvallar egasi emas."
        )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {role}")


def enable_tenant_rls(table: str, *, grant: str, column: str = "business_id") -> None:
    """Jadvalda RLS'ni yoqadi: ilova roli faqat joriy biznes (app.business_id) qatorlarini ko'radi va yozadi."""
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {table} "
        f"USING ({column} = app_business_id()) WITH CHECK ({column} = app_business_id())"
    )
    op.execute(f"GRANT {grant} ON {table} TO {app_role()}")
