"""백엔드 없이 검색만 띄워보는 개발용 서버.

실행: .venv\\Scripts\\python -m uvicorn dev_server:app --port 8001
데모 화면: http://localhost:8001/  API 문서: http://localhost:8001/docs
"""

import json

from fastapi import FastAPI
from fastapi.responses import FileResponse

from ai_search import router
from ai_search.config import SEARCH_ROOT, load_settings

app = FastAPI(title="AI 검색 (개발용)")
app.include_router(router)


@app.get("/", include_in_schema=False)
def demo_page():
    return FileResponse(SEARCH_ROOT / "demo" / "index.html")


# 검색 API는 영상 ID만 돌려준다. 제목은 실제로는 백엔드가 DB에서 붙이므로 데모에서만 자막 JSON에서 읽는다
@app.get("/demo/info", include_in_schema=False)
def demo_info():
    settings = load_settings()
    videos = json.loads((SEARCH_ROOT / "data" / "subtitles.json").read_text(encoding="utf-8"))
    return {
        "provider": settings.provider,
        "refine": settings.provider == "gemini" and settings.gemini_refine,
        "min_score": settings.min_score,
        "videos": {v["video_id"]: v["title"] for v in videos},
    }
