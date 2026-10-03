"""Lokal sinov uchun namuna biznes yaratadi. Faqat APP_ENV=dev da ishlaydi; qayta ishga tushirsa bo'ladi.

    cd backend && python scripts/seed_dev.py

Haqiqiy tizimda biznesni platforma egasi yaratadi (01-modul) — bu skript faqat ishlab chiqish uchun.
"""
import asyncio
import uuid
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models_registry  # noqa: F401
from app.core.config import get_settings
from app.core.db import dispose_engines, system_session, tenant_session
from app.core.deps import AuthContext
from app.core.security import hash_password, pin_lookup
from app.core.vault import seal
from app.modules.auth.models import User
from app.modules.catalog.models import Color, Fabric, Pattern, Sku
from app.modules.platform.models import Business
from app.modules.receiving.models import Receipt
from app.modules.receiving.schemas import LineIn, ReceiptCreate
from app.modules.receiving.service import create_receipt
from app.modules.structure.models import Location

OWNER_PHONE = "+998901112233"
WAREHOUSE_PHONE = "+998901112244"
OWNER_PASSWORD = "demo1234"
WAREHOUSE_TEMP_PASSWORD = "vaqtincha1"
SELLER_PIN = "1234"
PLATFORM_PHONE = "+998900000000"
PLATFORM_PASSWORD = "platforma1"
STORE_LOGIN = "chorsu"
STORE_PASSWORD = "dokon1234"


async def seed_platform_owner() -> None:
    """Platforma egasi. Tasdiqlash ilovasi birinchi kirishda ulanadi (QR kod ko'rsatiladi)."""
    async with system_session() as db:
        if await db.scalar(select(User.id).where(User.phone == PLATFORM_PHONE)):
            return
        db.add(
            User(
                business_id=None,
                full_name="Platforma egasi",
                phone=PLATFORM_PHONE,
                password_hash=hash_password(PLATFORM_PASSWORD),
                role="platform_owner",
            )
        )
    print(f"Platforma egasi yaratildi: {PLATFORM_PHONE}  parol: {PLATFORM_PASSWORD}")


async def seed_catalog(db: AsyncSession, business_id: int) -> bool:
    """Namuna katalog: 3 mato, 6 rang, 3 gul va ularning SKU'lari (bir qismi narxsiz). Bor bo'lsa — tegmaydi."""
    if await db.scalar(select(Fabric.id).where(Fabric.business_id == business_id).limit(1)):
        return False

    def fabric(code: str, name: str, width: int, composition: str, m_per_kg: str) -> Fabric:
        return Fabric(
            business_id=business_id, code=code, name=name, width_cm=width,
            composition=composition, default_m_per_kg=Decimal(m_per_kg),
        )  # fmt: skip

    atlas = fabric("M101", "Xon atlas", 90, "100% ipak", "9.5")
    velvet = fabric("B-7", "Baxmal", 150, "80% paxta, 20% polyester", "2.8")
    satin = fabric("S-20", "Satin", 220, "100% paxta", "3.4")
    colors = {
        code: Color(business_id=business_id, code=code, name=name, hex=hex_)
        for code, name, hex_ in [
            ("01", "Oq", "#f4f1ea"), ("02", "Qora", "#1c1c1e"), ("03", "Qizil", "#b8322a"),
            ("04", "Ko'k", "#23306b"), ("05", "Yashil", "#2e7d4f"), ("06", "Za'faron", "#e2a72e"),
        ]
    }
    plain = await db.scalar(
        select(Pattern).where(Pattern.business_id == business_id, Pattern.is_plain)
    ) or Pattern(business_id=business_id, code="0", name="Gulsiz", is_plain=True)
    tulip = Pattern(business_id=business_id, code="G1", name="Lola")
    rose = Pattern(business_id=business_id, code="G2", name="Atirgul")
    db.add_all([atlas, velvet, satin, *colors.values(), plain, tulip, rose])
    await db.flush()

    # (mato, rang kodlari, gullar, tavsiya narx, birlik) — narx None: "narxi belgilanmagan"
    plan = [
        (atlas, ["03", "04", "05"], [plain, tulip], 85_000, "m"),
        (velvet, ["02", "03", "04"], [plain], 240_000, "kg"),
        (satin, ["01", "06"], [rose], None, "m"),
    ]
    db.add_all(
        Sku(
            business_id=business_id, fabric_id=fabric_.id, color_id=colors[code].id,
            pattern_id=pattern.id, price=price, price_unit=unit,
        )
        for fabric_, codes, patterns, price, unit in plan
        for code in codes
        for pattern in patterns
    )
    print("Namuna katalog qo'shildi: 3 mato, 6 rang, 2 gul, 11 SKU")
    return True


async def seed() -> None:
    await seed_platform_owner()
    async with system_session() as db:
        owner = await db.scalar(select(User).where(User.phone == OWNER_PHONE))
        if owner is not None:
            # Eski namuna bazada sotuvchining PIN'i bo'lmasligi mumkin — qo'shib qo'yamiz
            seller = await db.scalar(
                select(User).where(
                    User.business_id == owner.business_id,
                    User.role == "seller",
                    User.pin_lookup.is_(None),
                )
            )
            if seller is not None:
                seller.pin_lookup = pin_lookup(owner.business_id, SELLER_PIN)
                print(f"Sotuvchiga PIN o'rnatildi: {SELLER_PIN}")
            # Eski namuna bazada katalog bo'lmasligi mumkin — qo'shib qo'yamiz
            if not await seed_catalog(db, owner.business_id) and seller is None:
                print("Namuna biznes allaqachon bor — hech narsa o'zgartirilmadi.")
            return

        business = Business(name="Namuna Mato Savdo")
        db.add(business)
        await db.flush()

        db.add_all(
            [
                Location(business_id=business.id, type="store", name="Chorsu do'koni"),
                Location(business_id=business.id, type="warehouse", name="Asosiy sklad"),
                User(
                    business_id=business.id,
                    full_name="Akmal Karimov",
                    phone=OWNER_PHONE,
                    password_hash=hash_password(OWNER_PASSWORD),
                    role="owner",
                    is_primary_owner=True,
                    all_locations=True,
                ),
                # Vaqtinchalik parol bilan: birinchi kirishda parolni almashtirish so'raladi
                User(
                    business_id=business.id,
                    full_name="Dilshod Rahimov",
                    phone=WAREHOUSE_PHONE,
                    password_hash=hash_password(WAREHOUSE_TEMP_PASSWORD),
                    role="warehouse",
                    all_locations=True,
                    must_change_password=True,
                ),
                # Sotuvchi faqat do'kon qurilmasida PIN bilan kiradi
                User(
                    business_id=business.id,
                    full_name="Nodira Yusupova",
                    role="seller",
                    all_locations=True,
                    pin_lookup=pin_lookup(business.id, SELLER_PIN),
                ),
            ]
        )
        await seed_catalog(db, business.id)

    print("Namuna biznes yaratildi: Namuna Mato Savdo")
    print(f"  Biznes egasi: {OWNER_PHONE}  parol: {OWNER_PASSWORD}")
    print(f"  Omborchi:     {WAREHOUSE_PHONE}  vaqtinchalik parol: {WAREHOUSE_TEMP_PASSWORD}")
    print(f"  Sotuvchi:     do'kon qurilmasida PIN {SELLER_PIN}")


async def seed_receipt() -> None:
    """Namuna kirim: asosiy skladga uch partiya. Kirimning o'z mantig'i orqali — raqam, qoldiq va jurnal bilan."""
    async with system_session() as db:
        owner = await db.scalar(select(User).where(User.phone == OWNER_PHONE))
    async with tenant_session(owner.business_id) as db:
        if await db.scalar(select(Receipt.id).limit(1)):
            return
        warehouse = await db.scalar(
            select(Location).where(Location.type == "warehouse", Location.is_active)
        )
        fabrics = {code: id_ for code, id_ in await db.execute(select(Fabric.code, Fabric.id))}
        colors = {code: id_ for code, id_ in await db.execute(select(Color.code, Color.id))}
        patterns = {code: id_ for code, id_ in await db.execute(select(Pattern.code, Pattern.id))}
        wanted = [  # (mato, rang, gul, rulon, metr, kg, tannarx)
            ("M101", "03", None, 20, "1000", "105", 52_000),
            ("B-7", "05", None, 8, "320.5", None, 61_000),
            ("S-20", "01", "G2", 12, "600", "176.5", 38_000),
        ]
        if warehouse is None or any(
            f not in fabrics or c not in colors or (p and p not in patterns)
            for f, c, p, *_ in wanted
        ):
            return  # namuna katalog o'zgartirilgan — kirimni o'ylab topmaymiz
        business = await db.get(Business, owner.business_id)
        ctx = AuthContext(user=await db.get(User, owner.id), business=business, session_id=0, db=db)
        await create_receipt(
            ctx,
            ReceiptCreate(
                client_uuid=uuid.uuid4(),
                warehouse_id=warehouse.id,
                receipt_date=datetime.now(ZoneInfo(business.timezone)).date(),
                note="Namuna kirim",
                lines=[
                    LineIn(
                        fabric_id=fabrics[f], color_id=colors[c], pattern_id=patterns[p] if p else None,
                        rolls_count=rolls, meters=Decimal(meters),
                        kg=Decimal(kg) if kg else None, cost_per_m=cost,
                    )
                    for f, c, p, rolls, meters, kg, cost in wanted
                ],
            ),
        )
    print("Namuna kirim qo'shildi: 3 partiya asosiy skladda")


async def seed_store_login() -> None:
    """Namuna do'konga login: do'kon planshetini egasiz ochish uchun (kirish → "Do'kon" varag'i)."""
    async with system_session() as db:
        owner = await db.scalar(select(User).where(User.phone == OWNER_PHONE))
        if owner is None:
            return
        store = await db.scalar(
            select(Location).where(
                Location.business_id == owner.business_id, Location.type == "store"
            )
        )
        if store is None or store.login is not None:
            return
        store.login = STORE_LOGIN
        store.password_hash = hash_password(STORE_PASSWORD)
        store.password_enc = seal(STORE_PASSWORD)
    print(f"Do'kon logini: {STORE_LOGIN}  parol: {STORE_PASSWORD}")


async def main() -> None:
    if get_settings().app_env != "dev":
        raise SystemExit("Bu skript faqat APP_ENV=dev da ishlaydi.")
    try:
        await seed()
        await seed_receipt()
        await seed_store_login()
    finally:
        await dispose_engines()


if __name__ == "__main__":
    asyncio.run(main())
