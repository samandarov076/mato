"""Ilova sozlamalari. Qiymatlar .env faylidan o'qiladi (loyiha ildizidagi)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    # Ilova roli (RLS ta'sir qiladi) — biznes ichidagi barcha so'rovlar
    database_url: str
    # Jadvallar egasi (RLS'dan tashqari) — migratsiyalar, kirishdagi qidiruv, platforma paneli
    database_owner_url: str
    redis_url: str = "redis://localhost:6379/0"

    # dev | prod. "prod" da cookie faqat HTTPS orqali yuboriladi.
    app_env: str = "dev"

    secret_key: str
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    password_hash_rounds: int = 12  # bcrypt; testlarda tezlik uchun kamaytiriladi
    # Ko'rinadigan parol/PIN shifrlanadigan kalit (app/core/vault.py). Bo'sh bo'lsa SECRET_KEY dan
    # hosil qilinadi — faqat ishlab chiqishda; serverda alohida, uzun tasodifiy qiymat qo'yiladi.
    credentials_key: str = ""

    # Yuklangan rasmlar papkasi (mato, rang, gul). Serverda doimiy diskka qaratiladi.
    media_dir: Path = ROOT_DIR / "media"

    # Telegram boti (10-telegram). Token bo'sh bo'lsa — Telegram qismi o'chiq: xabarlar faqat tizim ichida.
    telegram_bot_token: str = ""
    telegram_api_url: str = "https://api.telegram.org"

    app_timezone: str = "Asia/Tashkent"
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
