"""Ko'rinadigan parol va PIN: shifrlab saqlash va ochish.

Biznes egasi o'z xodimlarining, platforma egasi esa biznes egalarining parolini ko'ra oladi
(biznes qarori, 2026-10-02). Buning uchun parol xesh bilan birga shifrlangan holda ham saqlanadi.
Kirish tekshiruvi avvalgidek xesh bo'yicha — bu ustunlar faqat "ko'rsatish" uchun.

Kalit — `CREDENTIALS_KEY` (.env). Berilmagan bo'lsa, `SECRET_KEY` dan hosil qilinadi — bu faqat
ishlab chiqish uchun qulaylik; serverda alohida kalit qo'yilishi shart. Kalit yo'qolsa yoki
almashtirilsa, saqlangan qiymatlar ochilmaydi (kirishga ta'sir qilmaydi — parol yangilanganda
qayta saqlanadi).
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

settings = get_settings()


def _fernet() -> Fernet:
    source = settings.credentials_key or f"credentials:{settings.secret_key}"
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(source.encode()).digest()))


_box = _fernet()


def seal(value: str) -> str:
    """Parol yoki PIN'ni bazada saqlanadigan shifrlangan ko'rinishga o'tkazadi."""
    return _box.encrypt(value.encode()).decode()


def unseal(token: str | None) -> str | None:
    """Shifrlangan qiymatni ochadi. Qiymat yo'q yoki kalit mos kelmasa — None."""
    if not token:
        return None
    try:
        return _box.decrypt(token.encode()).decode()
    except InvalidToken:
        return None
