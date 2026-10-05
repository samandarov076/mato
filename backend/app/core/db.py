"""Baza ulanishi.

Asosiy qoida: biznesga tegishli har bir so'rov tranzaksiya ichida
`app.business_id` sozlamasi bilan boshlanadi. PostgreSQL'dagi
Row-Level Security siyosatlari aynan shu qiymatga qaraydi — ilova kodi
business_id shartini unutsa ham, baza boshqa biznes ma'lumotini qaytarmaydi.

Ikki ulanish bor:
- `engine` — ilova roli (mato_app). RLS shu rolga ta'sir qiladi. `tenant_session` shundan foydalanadi.
- `system_engine` — jadvallar egasi, RLS'dan tashqari. Faqat biznes hali noma'lum bo'lgan
  joylarda (kirishda telefon/qurilma/sessiya bo'yicha qidiruv), platforma panelida va
  barcha bizneslar bo'yicha ishlaydigan fon vazifalarida. `system_session` shundan foydalanadi.
"""
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from typing import ClassVar

from sqlalchemy import BigInteger, DateTime, MetaData, Text, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

system_engine = create_async_engine(
    settings.database_system_url, pool_size=5, max_overflow=5, pool_pre_ping=True
)
SystemSessionLocal = async_sessionmaker(system_engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    """Barcha modellar uchun asos.

    Python turi → baza turi: int → bigint, str → text, datetime → timestamptz
    (docs/05-baza-sxemasi.md, "Turlar"). Boshqa tur kerak bo'lsa ustunda aniq yoziladi.
    """

    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_N_name)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )
    type_annotation_map: ClassVar[dict] = {
        int: BigInteger,
        str: Text,
        datetime: DateTime(timezone=True),
    }


def after_commit(session: AsyncSession, action: Callable[[], Awaitable[None]]) -> None:
    """Tranzaksiya muvaffaqiyatli saqlangandan KEYIN bajariladigan ish (masalan, "yangi xabar bor" signali).

    Tranzaksiya bekor bo'lsa — bajarilmaydi. Ishning o'zi xato bersa, so'rovga ta'sir qilmaydi (jurnalga yoziladi).
    """
    session.info.setdefault("after_commit", []).append(action)


async def _run_after_commit(session: AsyncSession) -> None:
    for action in session.info.pop("after_commit", []):
        try:
            await action()
        except Exception:
            logger.exception("after_commit ishida xato")


@asynccontextmanager
async def tenant_session(business_id: int) -> AsyncIterator[AsyncSession]:
    """Biznes kontekstidagi sessiya: faqat shu biznes qatorlari ko'rinadi (RLS)."""
    async with SessionLocal() as session:
        async with session.begin():
            # set_config(..., true) = SET LOCAL: faqat shu tranzaksiya uchun; ulanishlar puli bilan xavfsiz.
            # (SET LOCAL ning o'zi parametr qabul qilmaydi, shuning uchun set_config.)
            await session.execute(
                text("SELECT set_config('app.business_id', :bid, true)"),
                {"bid": str(int(business_id))},
            )
            yield session
        await _run_after_commit(session)


@asynccontextmanager
async def system_session() -> AsyncIterator[AsyncSession]:
    """RLS'dan tashqari sessiya. Ehtiyot bo'l: bu yerda har so'rovga business_id shartini o'zing qo'yasan."""
    async with SystemSessionLocal() as session:
        async with session.begin():
            yield session
        await _run_after_commit(session)


async def check_db() -> bool:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True


async def dispose_engines() -> None:
    await engine.dispose()
    await system_engine.dispose()
