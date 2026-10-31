"""Server-owned, isolated demo fixtures. Never substitutes for production DB."""
import json
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from .practice_feedback import prepare_practice_feedback
from .rubric import grade_request
from .schemas import FeedbackResponse


def load_evaluation_set():
    return json.loads(Path(__file__).with_name("evaluation_cases.json").read_text(encoding="utf-8"))


def prepare_demo(request):
    practice = load_evaluation_set()["practices"].get(str(request.practice_id))
    if practice is None:
        raise HTTPException(status_code=404, detail="AI 데모 과제가 없습니다.")
    return prepare_practice_feedback(SimpleNamespace(**practice), request)


def evaluate_demo(request):
    trusted = prepare_demo(request)
    return trusted if isinstance(trusted, FeedbackResponse) else grade_request(trusted).feedback
