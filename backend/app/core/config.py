"""Ilova sozlamalari. Qiymatlar .env faylidan o'qiladi (loyiha ildizidagi)."""
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    # Ilova roli (RLS ta'sir qiladi) — biznes ichidagi barcha so'rovlar
    database_url: str
    # Tizim roli (mato_system): RLS'dan tashqari, lekin DDL va DELETE yo'q — kirishdagi qidiruv,
    # platforma paneli, fon vazifalari (`system_session`). Rolni 15-migratsiya yaratadi.
    database_system_url: str
    # Jadvallar egasi — faqat migratsiyalar (alembic). Ilova ishlayotganda ishlatilmaydi.
    database_owner_url: str
    redis_url: str = "redis://localhost:6379/0"

    # dev | prod. "prod" da cookie faqat HTTPS orqali yuboriladi.
    app_env: str = "dev"

    secret_key: str
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    password_hash_rounds: int = 12  # bcrypt; testlarda tezlik uchun kamaytiriladi
    # Ko'rinadigan parol/PIN shifrlanadigan kalit (app/core/vault.py). Bo'sh bo'lsa SECRET_KEY dan
    # hosil qilinadi — faqat ishlab chiqishda (APP_ENV=dev); boshqa muhitda alohida, uzun tasodifiy
    # qiymat majburiy — usiz ilova ishga tushmaydi (`_separate_secrets`).
    credentials_key: str = ""
    # Platforma egasining ikki bosqichli kirishi: false — ixtiyoriy (profilda o'zi yoqadi; yoqilgan bo'lsa
    # kod so'raladi), true — majburiy (ulanmagan bo'lsa birinchi kirishda ulash talab qilinadi)
    platform_2fa_required: bool = False

    # Yuklangan rasmlar papkasi (mato, rang, gul). Serverda doimiy diskka qaratiladi.
    media_dir: Path = ROOT_DIR / "media"

    # Telegram boti (10-telegram). Token bo'sh bo'lsa — Telegram qismi o'chiq: xabarlar faqat tizim ichida.
    telegram_bot_token: str = ""
    telegram_api_url: str = "https://api.telegram.org"
    # Platforma egasining Telegram suhbati: texnik ogohlantirishlar (zaxira olinmadi, qoldiq farqi) —
    # app/core/alerts.py va deploy/backup/backup.sh. Bo'sh bo'lsa — faqat jurnal.
    platform_alert_chat_id: str = ""

    app_timezone: str = "Asia/Tashkent"
    cors_origins: str = "http://localhost:5173"

    @model_validator(mode="after")
    def _separate_secrets(self) -> "Settings":
        """Serverda sirlar bitta kalitda turmaydi: tokenlar — SECRET_KEY, ko'rinadigan parollar — CREDENTIALS_KEY.
        Biri oshkor bo'lsa, ikkinchisi bilan himoyalangan narsa ochilmasin."""
        if self.app_env != "dev":
            key = self.credentials_key.strip()
            if not key or key == self.secret_key:
                raise ValueError(
                    "CREDENTIALS_KEY majburiy (APP_ENV=dev dan boshqa muhitda): alohida, uzun tasodifiy "
                    "qiymat qo'ying — bo'sh yoki SECRET_KEY bilan bir xil bo'lmasin"
                )
            # Serverda ilova jadvallar egasi bilan ishlamaydi: tizim roli alohida bo'lishi shart
            if make_url(self.database_system_url).username == make_url(self.database_owner_url).username:
                raise ValueError(
                    "DATABASE_SYSTEM_URL da jadvallar egasi emas, cheklangan tizim roli (mato_system) "
                    "bo'lishi kerak (docs/07-ishga-tushirish.md, 6.2)"
                )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
