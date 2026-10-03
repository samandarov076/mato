"""Testlar alohida bazada ishlaydi: <baza nomi>_test. Har ishga tushirishda noldan yaratiladi."""
import asyncio
import os
import random
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg
import pytest
import pytest_asyncio
import redis
from sqlalchemy.engine import make_url

from app.core.config import Settings

BACKEND_DIR = Path(__file__).resolve().parents[1]

_base = Settings()
_owner_url = make_url(_base.database_owner_url)
TEST_DB = f"{_owner_url.database}_test"

# app.core.db import qilinishidan OLDIN: ulanishlar test bazasiga qarashi kerak
os.environ["DATABASE_URL"] = (
    make_url(_base.database_url).set(database=TEST_DB).render_as_string(hide_password=False)
)
os.environ["DATABASE_OWNER_URL"] = _owner_url.set(database=TEST_DB).render_as_string(
    hide_password=False
)
os.environ["PASSWORD_HASH_ROUNDS"] = "4"  # bcrypt testlarda tez ishlashi uchun
# Redis'da testlar uchun alohida baza (15) — ishlab chiqishdagi hisoblagichlarga tegmaydi
TEST_REDIS_URL = urlsplit(_base.redis_url)._replace(path="/15").geturl()
os.environ["REDIS_URL"] = TEST_REDIS_URL
# Yuklangan rasmlar vaqtinchalik papkaga tushadi — testlar tugagach o'chiriladi
TEST_MEDIA_DIR = tempfile.mkdtemp(prefix="mato-media-test-")
os.environ["MEDIA_DIR"] = TEST_MEDIA_DIR

import app.models_registry  # noqa: F401  — barcha modellar (ilova ishga tushgandagidek)


async def _recreate_test_db() -> None:
    dsn = _owner_url.set(drivername="postgresql", database="postgres").render_as_string(
        hide_password=False
    )
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{TEST_DB}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    assert TEST_DB.endswith("_test"), "testlar faqat *_test bazasida ishlaydi"
    # Alohida oqimda — pytest-asyncio'ning o'z event loop'iga tegmaslik uchun
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(asyncio.run, _recreate_test_db()).result()
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=os.environ.copy(),
        check=True,
        capture_output=True,
    )
    # Oldingi ishga tushirishdan qolgan urinishlar hisoblagichlari tozalanadi
    with redis.Redis.from_url(TEST_REDIS_URL) as test_redis:
        test_redis.flushdb()
    yield
    shutil.rmtree(TEST_MEDIA_DIR, ignore_errors=True)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _dispose_engines(_test_database):
    yield
    from app.core.db import dispose_engines
    from app.core.redis import close_redis

    await close_redis()
    await dispose_engines()


def random_phone() -> str:
    return f"+99890{random.randint(0, 9_999_999):07d}"


PASSWORD = "sinov-parol"


@pytest_asyncio.fixture
async def browser():
    """Yangi "brauzer" ochadi: ilovaga HTTP so'rov yuboradi va cookie'larni alohida saqlaydi.

    Bir testda bir nechta qurilma kerak bo'lsa (ega noutbuki, do'kon plansheti) — bir necha marta chaqiriladi.
    """
    import httpx

    from app.main import app

    opened = []

    def _open() -> httpx.AsyncClient:
        c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        opened.append(c)
        return c

    yield _open
    for c in opened:
        await c.aclose()


@pytest.fixture
def client(browser):
    """Bitta brauzer yetarli bo'lgan testlar uchun."""
    return browser()


@pytest.fixture
def new_account(new_business, new_user):
    """Biznes + parolli foydalanuvchi. (business_id, user_id, phone) qaytaradi."""
    from app.core.security import hash_password

    async def _new(role: str = "owner", **fields) -> tuple[int, int, str]:
        business_id = await new_business()
        phone = random_phone()
        user_id = await new_user(
            business_id, role=role, phone=phone, password_hash=hash_password(PASSWORD), **fields
        )
        return business_id, user_id, phone

    return _new


@pytest.fixture
def new_location():
    """Do'kon yoki sklad yaratadi (RLS'dan tashqari) va id sini qaytaradi."""
    from app.core.db import system_session
    from app.modules.structure.models import Location

    async def _new(business_id: int, type: str = "store", **fields) -> int:
        fields.setdefault("name", "Test do'kon")
        async with system_session() as s:
            location = Location(business_id=business_id, type=type, **fields)
            s.add(location)
            await s.flush()
            return location.id

    return _new


@pytest.fixture
def new_business():
    """Yangi biznes yaratadi (platforma egasi kabi, RLS'dan tashqari) va id sini qaytaradi."""
    from app.core.db import system_session
    from app.modules.platform.models import Business

    async def _new(name: str = "Test biznes") -> int:
        async with system_session() as s:
            business = Business(name=name)
            s.add(business)
            await s.flush()
            return business.id

    return _new


@pytest.fixture
def new_user():
    """Foydalanuvchi yaratadi (RLS'dan tashqari) va id sini qaytaradi."""
    from app.core.db import system_session
    from app.modules.auth.models import User

    async def _new(business_id: int | None, role: str = "owner", **fields) -> int:
        fields.setdefault("full_name", "Test Xodim")
        async with system_session() as s:
            user = User(business_id=business_id, role=role, **fields)
            s.add(user)
            await s.flush()
            return user.id

    return _new


# ---------- Sinov biznesi (kirim, ombor, sotuv testlari) ----------


@pytest.fixture
def shop(client, new_account, new_location):
    """Biznes: ega (kirgan), sklad, do'kon va kichik katalog. `tests.shop.Shop` qaytaradi."""
    from tests.shop import Shop, login

    async def _open() -> "Shop":
        business_id, _, phone = await new_account(is_primary_owner=True, full_name="Akmal Ega")
        headers = await login(client, phone, PASSWORD)
        warehouse = await new_location(business_id, "warehouse", name="Asosiy sklad")
        store = await new_location(business_id, "store", name="Chorsu do'koni")

        async def add(what: str, **body) -> int:
            created = await client.post(f"/api/catalog/{what}", json=body, headers=headers)
            return created.json()["id"]

        fabric = await add("fabrics", code="M101", name="Atlas", default_m_per_kg="4")
        colors = [await add("colors", code=c, name=f"Rang {c}") for c in ("01", "02")]
        pattern = await add("patterns", code="G1", name="Lola")
        return Shop(client, business_id, phone, headers, warehouse, store, fabric, colors, pattern)

    return _open


@pytest.fixture
def keeper(client, new_user):
    """Shu biznesga omborchi qo'shadi va uning nomidan kiradi. `warehouses` berilmasa — barcha skladlar."""
    from app.core.db import system_session
    from app.core.security import hash_password
    from app.modules.structure.models import UserLocation
    from tests.shop import login

    async def _enter(shop, warehouses: list[int] | None = None) -> dict[str, str]:
        phone = random_phone()
        user_id = await new_user(
            shop.business_id,
            role="warehouse",
            phone=phone,
            password_hash=hash_password(PASSWORD),
            full_name="Dilshod Omborchi",
            all_locations=warehouses is None,
        )
        async with system_session() as s:
            s.add_all(
                UserLocation(user_id=user_id, location_id=w, business_id=shop.business_id)
                for w in warehouses or []
            )
        return await login(client, phone, PASSWORD)

    return _enter


@pytest.fixture
def seller(browser, new_user):
    """Do'konga qurilma bog'laydi va sotuvchi shu qurilmada PIN bilan kiradi (ctx.store — shu do'kon)."""
    from app.core.security import pin_lookup
    from tests.shop import login

    async def _enter(shop, store: int | None = None, pin: str = "1234") -> dict[str, str]:
        tablet = browser()
        bound = await tablet.post(
            "/api/devices",
            json={"store_id": store or shop.store, "name": "Kassa"},
            headers=await login(tablet, shop.owner_phone, PASSWORD),
        )
        assert bound.status_code == 201, bound.text
        await new_user(
            shop.business_id,
            role="seller",
            full_name="Nodira Sotuvchi",
            all_locations=True,
            pin_lookup=pin_lookup(shop.business_id, pin),
        )
        entered = await tablet.post("/api/auth/pin", json={"pin": pin})
        assert entered.status_code == 200, entered.text
        return {"Authorization": f"Bearer {entered.json()['access_token']}"}

    return _enter
