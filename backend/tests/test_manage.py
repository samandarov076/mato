"""Boshqaruv buyruqlari (`python -m app.manage`): platforma egasini yaratish."""
import pytest
from sqlalchemy import select

from app import manage
from app.core.db import system_session
from app.modules.auth.models import User
from tests.conftest import random_phone


async def _login(client, phone: str, password: str):
    return await client.post("/api/auth/login", json={"phone": phone, "password": password})


def _bearer(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_create_platform_owner_gives_a_temporary_password(client):
    phone = random_phone()

    temp_password = await manage.create_platform_owner(phone, "Platforma Egasi")

    assert len(temp_password) >= 10
    async with system_session() as s:
        user = await s.scalar(select(User).where(User.phone == phone))
    assert (user.role, user.business_id, user.must_change_password) == ("platform_owner", None, True)
    assert user.password_enc is None  # platforma egasining paroli hech kimga ko'rsatilmaydi

    login = await _login(client, phone, temp_password)
    assert login.status_code == 200
    assert login.json()["user"]["must_change_password"] is True


async def test_platform_owner_must_change_the_temporary_password_before_working(client):
    phone = random_phone()
    temp_password = await manage.create_platform_owner(phone, "Platforma Egasi")
    headers = _bearer(await _login(client, phone, temp_password))

    refused = await client.get("/api/platform/businesses", headers=headers)
    assert (refused.status_code, refused.json()["code"]) == (403, "password_change_required")

    changed = await client.post(
        "/api/auth/me/password",
        json={"old_password": temp_password, "new_password": "yangi-parol-123"},
        headers=headers,
    )
    assert changed.status_code == 204, changed.text
    assert (await client.get("/api/platform/businesses", headers=headers)).status_code == 200
    assert (await _login(client, phone, temp_password)).status_code == 401
    relogin = await _login(client, phone, "yangi-parol-123")
    assert relogin.json()["user"]["must_change_password"] is False


async def test_create_platform_owner_refuses_an_existing_phone(new_account):
    _, _, phone = await new_account()

    with pytest.raises(manage.ManageError, match="mavjud"):
        await manage.create_platform_owner(phone, "Kimdir")


@pytest.mark.parametrize("phone", ["12345", "", "+99890"])
async def test_create_platform_owner_validates_the_phone(phone):
    with pytest.raises(manage.ManageError, match="telefon"):
        await manage.create_platform_owner(phone, "Kimdir")
