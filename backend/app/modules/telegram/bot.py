"""Telegram Bot API mijozi. Bitta umumiy platforma boti; token — `.env` dagi TELEGRAM_BOT_TOKEN."""
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.redis import get_redis

_USERNAME_KEY = "tg:bot_username"


class TelegramError(Exception):
    """Telegram so'rovni rad etdi."""

    def __init__(self, status: int, description: str):
        super().__init__(f"{status}: {description}")
        self.status = status
        self.description = description

    @property
    def blocked(self) -> bool:
        """Foydalanuvchi botni bloklagan yoki suhbatni o'chirgan — endi unga yozib bo'lmaydi."""
        return self.status == 403


def configured() -> bool:
    return bool(get_settings().telegram_bot_token)


async def call(method: str, **params: Any) -> Any:
    """Bot API usulini chaqiradi. Tarmoq xatosi — `httpx.HTTPError`, rad javobi — `TelegramError`."""
    settings = get_settings()
    url = f"{settings.telegram_api_url}/bot{settings.telegram_bot_token}/{method}"
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json=params)
    body = response.json()
    if not body.get("ok"):
        raise TelegramError(response.status_code, body.get("description", ""))
    return body["result"]


async def username() -> str:
    """Botning nomi (t.me havolasi uchun). Bir marta so'raladi va eslab qolinadi."""
    redis = get_redis()
    name = await redis.get(_USERNAME_KEY)
    if not name:
        name = (await call("getMe"))["username"]
        await redis.set(_USERNAME_KEY, name, ex=24 * 3600)
    return name


async def send(chat_id: int, text: str) -> None:
    await call("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", disable_web_page_preview=True)
