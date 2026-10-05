"""Boshqaruv buyruqlari (serverda, backend konteyneri ichida):

    python -m app.manage create-platform-owner      # birinchi foydalanuvchi: telefon + ism → vaqtinchalik parol

Platforma egasi prod bazada boshqa yo'l bilan yaratilmaydi (`seed_dev.py` faqat APP_ENV=dev da ishlaydi).
Vaqtinchalik parol birinchi kirishda almashtiriladi; 2FA majburiy bo'lsa, ilova ham o'shanda ulanadi.
"""
import argparse
import asyncio
import secrets
import sys

from sqlalchemy import select

from app import models_registry  # noqa: F401  — barcha modellar
from app.core.db import dispose_engines, system_session
from app.core.security import hash_password
from app.modules.auth.models import User
from app.modules.auth.schemas import normalize_phone


class ManageError(Exception):
    """Foydalanuvchiga ko'rsatiladigan xato (stacktrace'siz)."""


async def create_platform_owner(phone: str, full_name: str) -> str:
    """Platforma egasini yaratadi va vaqtinchalik parolni qaytaradi. Raqam band bo'lsa — xato."""
    normalized = normalize_phone(phone)
    if not normalized:
        raise ManageError("Noto'g'ri telefon raqami (masalan, +998901234567)")
    if not full_name.strip():
        raise ManageError("Ism bo'sh bo'lmasin")
    temp_password = secrets.token_urlsafe(9)  # 12 belgi, bir martalik
    password_hash = await asyncio.to_thread(hash_password, temp_password)
    async with system_session() as db:
        if await db.scalar(select(User.id).where(User.phone == normalized)):
            raise ManageError(f"Bu telefon raqami bilan foydalanuvchi allaqachon mavjud: {normalized}")
        db.add(
            User(
                business_id=None,
                full_name=full_name.strip(),
                phone=normalized,
                password_hash=password_hash,
                role="platform_owner",
                must_change_password=True,
            )
        )
    return temp_password


async def _cmd_create_platform_owner(args: argparse.Namespace) -> None:
    phone = args.phone or input("Telefon (+998...): ")
    full_name = args.name or input("Ism-familiya: ")
    temp_password = await create_platform_owner(phone, full_name)
    print(
        f"\nPlatforma egasi yaratildi: {normalize_phone(phone)}\n"
        f"Vaqtinchalik parol: {temp_password}\n"
        "Birinchi kirishda parol almashtiriladi. Bu parolni xabar orqali yubormang — og'zaki yoki ko'rsatib bering."
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.manage", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    owner = commands.add_parser("create-platform-owner", help="platforma egasini yaratish")
    owner.add_argument("--phone", help="so'ralmasin — shu raqam")
    owner.add_argument("--name", help="so'ralmasin — shu ism")
    owner.set_defaults(run=_cmd_create_platform_owner)
    args = parser.parse_args(argv)

    async def _run() -> None:
        try:
            await args.run(args)
        finally:
            await dispose_engines()

    try:
        asyncio.run(_run())
    except ManageError as error:
        sys.exit(f"Xato: {error}")


if __name__ == "__main__":
    main()
