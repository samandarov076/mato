"""Barcha modullarning modellari shu yerda import qilinadi — Alembic ularni ko'rishi uchun.

Har yangi modul o'z models.py faylini shu ro'yxatga qo'shadi.
"""
from app.core import models as _core  # noqa: F401
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.catalog import models as _catalog  # noqa: F401
from app.modules.credit import models as _credit  # noqa: F401
from app.modules.inventory import models as _inventory  # noqa: F401
from app.modules.notifications import models as _notifications  # noqa: F401
from app.modules.platform import models as _platform  # noqa: F401
from app.modules.receiving import models as _receiving  # noqa: F401
from app.modules.sales import models as _sales  # noqa: F401
from app.modules.structure import models as _structure  # noqa: F401
from app.modules.telegram import models as _telegram  # noqa: F401
