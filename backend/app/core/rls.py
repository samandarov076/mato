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


def _role_from(url: str, name: str) -> str:
    role = make_url(url).username
    if not role or not re.fullmatch(r"[a-z_][a-z0-9_]*", role):
        raise RuntimeError(f"{name} dagi rol nomi yaroqsiz: {role!r}")
    return role


def app_role() -> str:
    """Ilova roli nomi — DATABASE_URL dagi foydalanuvchi."""
    return _role_from(get_settings().database_url, "DATABASE_URL")


def system_role() -> str:
    """Tizim roli nomi — DATABASE_SYSTEM_URL dagi foydalanuvchi (`system_session`)."""
    return _role_from(get_settings().database_system_url, "DATABASE_SYSTEM_URL")


def _create_login_role(role: str, url: str, *, bypass_rls: bool) -> None:
    password = (make_url(url).password or "").replace("'", "''")
    op.get_bind().exec_driver_sql(
        f"CREATE ROLE {role} LOGIN PASSWORD '{password}' "
        f"NOSUPERUSER {'BYPASSRLS' if bypass_rls else 'NOBYPASSRLS'} NOCREATEDB NOCREATEROLE"
    )


def _role_flags(role: str) -> tuple[bool, bool] | None:
    """(superuser, bypassrls) yoki rol yo'q bo'lsa None."""
    row = (
        op.get_bind()
        .execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = :r"), {"r": role})
        .first()
    )
    return (row[0], row[1]) if row else None


def ensure_app_role() -> None:
    """Ilova rolini yaratadi (bo'lmasa) va uning RLS'ni chetlab o'ta olmasligini tekshiradi."""
    role = app_role()
    flags = _role_flags(role)
    if flags is None:
        _create_login_role(role, get_settings().database_url, bypass_rls=False)
    elif flags[0] or flags[1]:
        raise RuntimeError(
            f"'{role}' roli RLS'ni chetlab o'tadi (superuser yoki BYPASSRLS). "
            "DATABASE_URL da oddiy ilova roli bo'lishi kerak, jadvallar egasi emas."
        )
    op.execute(f"GRANT USAGE ON SCHEMA public TO {role}")


def ensure_system_role() -> None:
    """Tizim rolini yaratadi (bo'lmasa): RLS'dan tashqari, lekin superuser emas va jadvallar egasi emas."""
    role = system_role()
    if role == app_role():
        raise RuntimeError("DATABASE_SYSTEM_URL va DATABASE_URL bir xil rolga ishora qilmasligi kerak")
    flags = _role_flags(role)
    if flags is None:
        _create_login_role(role, get_settings().database_system_url, bypass_rls=True)
    elif flags[0]:
        raise RuntimeError(
            f"'{role}' roli superuser. DATABASE_SYSTEM_URL da cheklangan tizim roli bo'lishi kerak "
            "(docs/07-ishga-tushirish.md, 6.2)."
        )
    else:
        op.execute(f"ALTER ROLE {role} BYPASSRLS")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {role}")


def enable_tenant_rls(table: str, *, grant: str, column: str = "business_id") -> None:
    """Jadvalda RLS'ni yoqadi: ilova roli faqat joriy biznes (app.business_id) qatorlarini ko'radi va yozadi."""
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {table} "
        f"USING ({column} = app_business_id()) WITH CHECK ({column} = app_business_id())"
    )
    op.execute(f"GRANT {grant} ON {table} TO {app_role()}")
