"""LIVE feedback uses server-owned practices; mock remains offline."""
import logging
import os
from fastapi import APIRouter, Depends, HTTPException
from ai.ai_feedback import evaluate_answer
from ai.mock_feedback import evaluate_mock
from ai.schemas import FeedbackRequest, FeedbackResponse, PracticeFeedbackRequest
from ai.practice_feedback import get_feedback_db, load_practice_feedback

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI 피드백"])

@router.post("/feedback", response_model=FeedbackResponse)
def create_feedback(request: PracticeFeedbackRequest, db=Depends(get_feedback_db)) -> FeedbackResponse:
    """LIVE Gemini evaluation (OpenAI optional). Never fabricate success."""
    trusted_request = load_practice_feedback(db, request)
    if isinstance(trusted_request, FeedbackResponse):
        return trusted_request
    provider = os.getenv("FEEDBACK_PROVIDER", "gemini").strip().lower()
    key = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
    if provider not in ("gemini", "openai"):
        raise HTTPException(status_code=503, detail="FEEDBACK_PROVIDER 설정을 확인하세요.")
    if not os.getenv(key):
        raise HTTPException(status_code=503, detail=f"{key} 설정이 필요합니다.")
    try:
        return evaluate_answer(trusted_request)
    except (ValueError, RuntimeError):
        logger.exception("AI evaluation or JSON validation failure")
        raise HTTPException(status_code=502, detail="AI 평가 결과를 처리하지 못했습니다.")
    except Exception:
        logger.exception("External AI evaluation request failed")
        raise HTTPException(status_code=502, detail="AI 제공자 요청에 실패했습니다.")

@router.post("/feedback/mock", response_model=FeedbackResponse)
def create_mock_feedback(request: FeedbackRequest) -> FeedbackResponse:
    """Offline demo only; scores are synthetic examples, not real evaluations."""
    return evaluate_mock(request)
