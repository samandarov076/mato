"""Nomlarni o'zgartirish: biznes nomi (ega — sozlamalarda) va o'z ismi (profil). Platforma tomoni — test_platform.py."""
import httpx
from sqlalchemy import select

from app.core.db import system_session
from app.core.models import AuditLog
from tests.conftest import PASSWORD


async def _headers(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"phone": phone, "password": PASSWORD})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _events(business_id: int) -> list[tuple[str, dict]]:
    async with system_session() as s:
        rows = await s.execute(
            select(AuditLog.event_code, AuditLog.data)
            .where(AuditLog.business_id == business_id)
            .order_by(AuditLog.id)
        )
        return [tuple(row) for row in rows]


async def test_owner_renames_the_business(client, new_account):
    business_id, _, phone = await new_account(is_primary_owner=True)
    headers = await _headers(client, phone)

    response = await client.put(
        "/api/settings/name", json={"name": "  Shavkat aka matolari  "}, headers=headers
    )

    assert response.status_code == 204
    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["business"]["name"] == "Shavkat aka matolari"
    renamed = {"old": "Test biznes", "new": "Shavkat aka matolari"}
    assert ("business.renamed", renamed) in await _events(business_id)
    short = await client.put("/api/settings/name", json={"name": "A"}, headers=headers)
    assert short.status_code == 422


async def test_only_owners_rename_the_business(client, new_account):
    _, _, phone = await new_account(role="warehouse")
    headers = await _headers(client, phone)

    response = await client.put("/api/settings/name", json={"name": "Boshqa nom"}, headers=headers)

    assert response.status_code == 403


async def test_primary_owner_changes_own_name_in_profile(client, new_account):
    business_id, _, phone = await new_account(is_primary_owner=True, full_name="Shavkat M")
    headers = await _headers(client, phone)

    renamed = await client.patch(
        "/api/auth/me", json={"full_name": "Shavkat Mirzayev"}, headers=headers
    )

    assert renamed.status_code == 200
    assert renamed.json()["full_name"] == "Shavkat Mirzayev"
    changed = {"old": "Shavkat M", "new": "Shavkat Mirzayev"}
    assert ("user.name_changed", changed) in await _events(business_id)
    # Faqat til yuborilsa — ism o'zgarmaydi (avvalgi so'rovlar ham ishlayveradi)
    language = await client.patch("/api/auth/me", json={"language": "ru"}, headers=headers)
    assert language.json()["full_name"] == "Shavkat Mirzayev"
    assert language.json()["language"] == "ru"
    blank = await client.patch("/api/auth/me", json={"full_name": " "}, headers=headers)
    assert blank.status_code == 422
