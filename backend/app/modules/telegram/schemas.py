"""Telegram sozlamalari API'sining shakllari."""
from pydantic import BaseModel


class TelegramStatus(BaseModel):
    configured: bool  # platformada bot sozlanganmi (token bor)
    linked: bool
    username: str | None
    daily_summary: bool
    instant_alerts: bool


class LinkOut(BaseModel):
    url: str  # bir martalik havola: bosilsa bot ochiladi, "Start" — akkaunt bog'lanadi
    expires_in: int  # soniya


class PrefsIn(BaseModel):
    daily_summary: bool
    instant_alerts: bool
