"""백엔드 없이 검색만 띄워보는 개발용 서버.

실행: .venv\\Scripts\\python -m uvicorn dev_server:app --port 8001
"""

from fastapi import FastAPI

from ai_search import router

app = FastAPI(title="AI 검색 (개발용)")
app.include_router(router)
