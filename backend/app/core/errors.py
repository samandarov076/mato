"""Xatolar yagona ko'rinishda qaytadi: {"code": "...", "message": "..."}.

Matn emas, kod muhim: interfeys kodni foydalanuvchi tiliga tarjima qiladi (uz / en / ru).
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status_code: int, code: str, **details) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.details = details


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse({"code": exc.code, "message": exc.code, **exc.details}, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # {"maydon": "xato turi"} — masalan {"new_password": "string_too_short"}
        fields = {str(e["loc"][-1]): e["type"] for e in exc.errors()}
        return JSONResponse(
            {"code": "validation_error", "message": "validation_error", "fields": fields}, 422
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "error")
        return JSONResponse({"code": code, "message": str(exc.detail)}, exc.status_code)
