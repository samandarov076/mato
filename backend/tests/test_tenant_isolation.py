"""1-migratsiya kafolatlari: bizneslar bir-biridan ajratilgan (RLS), jurnal o'zgarmas, noyoblik qoidalari.

Bu testlar ilova kodiga emas, bazaning o'ziga qaratilgan: kod business_id shartini
unutsa ham baza boshqa biznes ma'lumotini bermasligi kerak.
"""
import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.core.db import SessionLocal, system_session, tenant_session
from app.core.models import AuditLog
from app.modules.auth.models import User
from app.modules.platform.models import Business
from tests.conftest import random_phone

# ---------- Bizneslarni ajratish (Row-Level Security) ----------


async def test_tenant_sees_only_own_rows(new_business, new_user):
    a, b = await new_business("A"), await new_business("B")
    user_a = await new_user(a)
    await new_user(b)

    async with tenant_session(a) as s:
        user_ids = (await s.scalars(select(User.id))).all()
        business_ids = (await s.scalars(select(Business.id))).all()

    assert user_ids == [user_a]
    assert business_ids == [a]


async def test_cannot_insert_row_for_other_business(new_business):
    a, b = await new_business(), await new_business()

    with pytest.raises(DBAPIError, match="row-level security"):
        async with tenant_session(a) as s:
            s.add(User(business_id=b, full_name="Begona", role="seller"))
            await s.flush()


async def test_cannot_update_other_business_rows(new_business, new_user):
    a, b = await new_business(), await new_business()
    user_b = await new_user(b, full_name="Asl ism")

    async with tenant_session(a) as s:
        result = await s.execute(update(User).where(User.id == user_b).values(full_name="Buzildi"))
        assert result.rowcount == 0

    async with system_session() as s:
        assert (await s.get(User, user_b)).full_name == "Asl ism"


async def test_without_business_context_nothing_is_visible(new_business, new_user):
    a = await new_business()
    await new_user(a)

    async with SessionLocal() as s:  # app.business_id o'rnatilmagan
        assert (await s.scalars(select(User.id))).all() == []
        assert (await s.scalars(select(Business.id))).all() == []


async def test_platform_owner_is_invisible_to_businesses(new_business, new_user):
    a = await new_business()
    platform_owner = await new_user(None, role="platform_owner", phone=random_phone())

    async with tenant_session(a) as s:
        assert await s.get(User, platform_owner) is None


async def test_app_role_cannot_bypass_rls(new_business):
    a = await new_business()

    async with tenant_session(a) as s:
        row = (
            await s.execute(
                text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            )
        ).one()

    assert tuple(row) == (False, False)


# ---------- Ilova rolining huquqlari ----------


async def test_app_role_cannot_delete_users(new_business, new_user):
    a = await new_business()
    user = await new_user(a)

    with pytest.raises(DBAPIError, match="permission denied"):
        async with tenant_session(a) as s:
            await s.execute(delete(User).where(User.id == user))


async def test_business_can_change_settings_but_not_its_status(new_business):
    a = await new_business()

    async with tenant_session(a) as s:
        await s.execute(update(Business).where(Business.id == a).values(credit_days=45))
    async with system_session() as s:
        assert (await s.get(Business, a)).credit_days == 45

    # Bloklangan biznes o'zini blokdan chiqara olmasligi kerak
    with pytest.raises(DBAPIError, match="permission denied"):
        async with tenant_session(a) as s:
            await s.execute(update(Business).where(Business.id == a).values(status="active"))


@pytest.mark.parametrize("table", ["recovery_codes", "business_status_events"])
async def test_platform_tables_are_closed_to_app_role(new_business, table):
    a = await new_business()

    with pytest.raises(DBAPIError, match="permission denied"):
        async with tenant_session(a) as s:
            await s.execute(text(f"SELECT 1 FROM {table}"))


# ---------- Jurnal o'zgarmas ----------


async def test_audit_log_is_append_only(new_business):
    a = await new_business()
    async with tenant_session(a) as s:
        log = AuditLog(business_id=a, category="login", event_code="login.success")
        s.add(log)
        await s.flush()
        log_id = log.id

    # Ilova roli: huquqning o'zi yo'q
    with pytest.raises(DBAPIError, match="permission denied"):
        async with tenant_session(a) as s:
            await s.execute(update(AuditLog).where(AuditLog.id == log_id).values(event_code="x"))

    # Jadval egasi ham o'zgartira olmaydi: trigger
    for statement in (
        update(AuditLog).where(AuditLog.id == log_id).values(event_code="x"),
        delete(AuditLog).where(AuditLog.id == log_id),
        text("TRUNCATE audit_logs"),
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            async with system_session() as s:
                await s.execute(statement)

    async with system_session() as s:
        assert (await s.get(AuditLog, log_id)).event_code == "login.success"


# ---------- Noyoblik qoidalari ----------


async def test_pin_is_unique_only_among_active_sellers_of_one_business(new_business, new_user):
    a, b = await new_business(), await new_business()
    await new_user(a, role="seller", pin_lookup="pin-1")

    with pytest.raises(IntegrityError):
        await new_user(a, role="seller", pin_lookup="pin-1")

    await new_user(a, role="seller", pin_lookup="pin-1", is_active=False)  # faolsiz — band qilmaydi
    await new_user(b, role="seller", pin_lookup="pin-1")  # boshqa biznes — bemalol


async def test_phone_is_unique_across_all_businesses(new_business, new_user):
    a, b = await new_business(), await new_business()
    phone = random_phone()
    await new_user(a, phone=phone)

    with pytest.raises(IntegrityError):
        await new_user(b, phone=phone)

    # Telefonsiz sotuvchilar bir-biriga xalaqit bermaydi
    await new_user(a, role="seller")
    await new_user(a, role="seller")


async def test_only_one_primary_owner_per_business(new_business, new_user):
    a = await new_business()
    await new_user(a, is_primary_owner=True)
    await new_user(a)  # sherik-ega

    with pytest.raises(IntegrityError):
        await new_user(a, is_primary_owner=True)


async def test_role_and_business_must_match(new_user, new_business):
    a = await new_business()

    with pytest.raises(IntegrityError):
        await new_user(None, role="seller")  # xodim biznessiz bo'lmaydi
    with pytest.raises(IntegrityError):
        await new_user(a, role="platform_owner")  # platforma egasi biznesga tegishli emas
