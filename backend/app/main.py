from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app import models_registry  # noqa: F401  — barcha modellarni yuklaydi
from app.core.config import get_settings
from app.core.db import check_db, dispose_engines
from app.core.errors import register_error_handlers
from app.core.media import router as media_router
from app.core.queue import close_queue
from app.core.redis import close_redis, get_redis
from app.core.router import audit_router, settings_router
from app.modules.auth.router import devices_router
from app.modules.auth.router import router as auth_router
from app.modules.catalog.router import router as catalog_router
from app.modules.credit.router import router as credit_router
from app.modules.inventory.router import router as inventory_router
from app.modules.notifications.router import router as notifications_router
from app.modules.platform.router import platform_router, two_factor_router
from app.modules.receiving.router import router as receiving_router
from app.modules.reports.router import router as reports_router
from app.modules.sales.router import router as sales_router
from app.modules.structure.router import router as structure_router
from app.modules.telegram.router import router as telegram_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await check_db()
    await get_redis().ping()
    yield
    await close_queue()
    await close_redis()
    await dispose_engines()


app = FastAPI(title="mato-savdo API", version="0.1.0", lifespan=lifespan)

# Katta JSON javoblar (masalan, do'kon katalogi /sales/context) siqib yuboriladi — sust internetda bir necha barobar tez
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["tizim"])
async def health() -> dict:
    """Tizim tirikligini tekshirish."""
    await check_db()
    await get_redis().ping()
    return {"status": "ok", "db": "ok", "redis": "ok"}


register_error_handlers(app)

# Modullar routerlari shu yerga qo'shiladi
for module_router in (
    auth_router,
    two_factor_router,
    devices_router,
    settings_router,
    audit_router,
    structure_router,
    media_router,
    catalog_router,
    receiving_router,
    inventory_router,
    notifications_router,
    sales_router,
    credit_router,
    reports_router,
    telegram_router,
    platform_router,
):
    app.include_router(module_router, prefix="/api")
