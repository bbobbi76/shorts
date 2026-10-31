"""Run with: python -m uvicorn ai.standalone:app --port 8001"""
from pathlib import Path
import os
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from app.routers.ai_feedback import router
from .demo_service import evaluate_demo, prepare_demo
from .ai_feedback import evaluate_gemini
from .schemas import FeedbackResponse, PracticeFeedbackRequest
from .verify_feedback import load_feedback_env

load_feedback_env()

app = FastAPI(title="AI 피드백 독립 데모 · Gemini/mock")
app.include_router(router)


@app.post("/api/ai/demo/feedback", response_model=FeedbackResponse, tags=["AI 담당 독립 데모"])
def demo_feedback(request: PracticeFeedbackRequest, mode: Literal["rubric", "gemini"] = "rubric"):
    """Fixed local fixtures only. Not registered in the main application."""
    if mode == "rubric":
        return evaluate_demo(request)
    trusted = prepare_demo(request)
    if isinstance(trusted, FeedbackResponse):
        return trusted
    if not os.getenv("GEMINI_API_KEY", "").strip():
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY 설정이 필요합니다.")
    try:
        return evaluate_gemini(trusted)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gemini 호출 또는 응답 검증에 실패했습니다.") from exc

@app.get("/", include_in_schema=False)
def home():
    return RedirectResponse("/demo")

@app.get("/demo", include_in_schema=False)
def demo():
    return FileResponse(Path(__file__).with_name("demo.html"), media_type="text/html")
