"""WorkFit 관리자 API (FastAPI).

실행: backend 폴더에서  uvicorn app.main:app --reload --port 8080
API 문서: http://localhost:8080/docs  (FastAPI가 자동으로 만들어 줍니다)
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import files
from .auth import init_admin_passwords
from .auth import router as auth_router
from .config import FRONTEND_ORIGIN
from .database import SessionLocal
from .errors import register_error_handlers
from .routers import ai_feedback, contents, courses, dashboard, meta, resources, tags
from ai_search.integration import install_search, start_search_sync
from .ui_api import router as ui_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("workfit")


@asynccontextmanager
async def lifespan(_: FastAPI):
    files.ensure_upload_dir()
    with SessionLocal() as db:
        init_admin_passwords(db)
    log.info("WorkFit API 준비 완료")
    stop, worker = start_search_sync(SessionLocal)
    try:
        yield
    finally:
        stop.set()
        worker.join(timeout=2)


app = FastAPI(title="WorkFit 관리자 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

app.include_router(auth_router)
app.include_router(dashboard.router)
app.include_router(meta.router)
app.include_router(courses.router)
app.include_router(contents.router)
app.include_router(files.admin_router)
app.include_router(resources.router)
app.include_router(tags.router)
app.include_router(ui_router)
app.include_router(ai_feedback.router)
# 원본 /files 정적 경로는 초안 파일도 노출하므로 인증·공개 검사를 하는 UI 파일 경로를 사용합니다.

# AI 검색: POST /api/ai/search, 공개 콘텐츠만 검색, DB 자막을 자동으로 인덱싱 (ai-search/docs/INTEGRATION.md)
install_search(app, SessionLocal, sync_interval_seconds=None)


@app.get("/api/health", tags=["상태"])
def health():
    return {"status": "ok"}
