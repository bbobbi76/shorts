"""오류 응답을 {message, details} 형태로 통일합니다. (프론트엔드 lib/api.js가 이 형식을 읽습니다)"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

log = logging.getLogger("workfit")


class ApiError(Exception):
    def __init__(self, status: int, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details or []

    @staticmethod
    def not_found(what: str) -> "ApiError":
        return ApiError(404, f"{what}을(를) 찾을 수 없습니다.")

    @staticmethod
    def bad_request(message: str) -> "ApiError":
        return ApiError(400, message)


def _body(message: str, details: list[str] | None = None) -> dict:
    return {"message": message, "details": details or [], "fields": details or []}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, e: ApiError):
        return JSONResponse(status_code=e.status, content=_body(e.message, e.details))

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, e: RequestValidationError):
        details = []
        for err in e.errors():
            field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
            details.append(f"{field}: {err.get('msg')}")
        return JSONResponse(status_code=400, content=_body("입력값을 확인해 주세요.", details))

    @app.exception_handler(IntegrityError)
    async def handle_integrity(_: Request, e: IntegrityError):
        log.warning("DB 제약 조건 위반: %s", e)
        return JSONResponse(
            status_code=409,
            content=_body("다른 데이터와 연결되어 있거나 중복된 값이라 저장할 수 없습니다."),
        )

    @app.exception_handler(Exception)
    async def handle_other(_: Request, e: Exception):
        log.exception("처리하지 못한 오류", exc_info=e)
        return JSONResponse(status_code=500, content=_body("서버 오류가 발생했습니다."))
