"""Read-only bridge to the existing practices table. No schema changes."""
import logging
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException

from .schemas import (
    EvaluationCriteria, FeedbackResponse, PracticeFeedbackRequest, TrustedFeedbackRequest,
)
from .rubric import function_requirement_issue, grade_request

logger = logging.getLogger(__name__)


def get_feedback_db():
    # Keep the offline mock/demo independent of database configuration and drivers.
    try:
        from app.database import get_db
        from sqlalchemy.exc import SQLAlchemyError
    except ImportError as exc:
        logger.exception("Practice database dependencies unavailable")
        raise HTTPException(status_code=503, detail="과제 조회 서비스의 DB 설정이 필요합니다.") from exc

    try:
        yield from get_db()
    except SQLAlchemyError as exc:
        logger.exception("Practice database session failed")
        raise HTTPException(status_code=503, detail="과제 조회 서비스를 사용할 수 없습니다.") from exc


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _finite_number(value):
    try:
        number = Decimal(str(value))
        return number if number.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def _review(missing):
    return FeedbackResponse(
        status="needs_review", score=None, good_points=[], improvement_points=[],
        corrected_answer="",
        explanation="서버 과제의 평가 정보가 없거나 유효하지 않아 평가를 보류했습니다: " + ", ".join(missing),
        next_practice="담당자가 과제 정답과 평가 기준을 확인한 뒤 다시 제출해 주세요.",
    )


def load_practice_feedback(db, submission: PracticeFeedbackRequest):
    from sqlalchemy import select
    from sqlalchemy.exc import SQLAlchemyError
    from app.models import Content, Course, Practice

    try:
        practice = db.scalar(
            select(Practice)
            .join(Content, Practice.content_id == Content.id)
            .join(Course, Content.course_id == Course.id)
            .where(Practice.id == submission.practice_id,
                   Content.status == "PUBLISHED", Course.status == "PUBLISHED")
        )
    except SQLAlchemyError as exc:
        logger.exception("Practice lookup failed")
        raise HTTPException(status_code=503, detail="과제 조회 서비스를 사용할 수 없습니다.") from exc
    if practice is None:
        raise HTTPException(status_code=404, detail="평가 가능한 과제를 찾을 수 없습니다.")

    return prepare_practice_feedback(practice, submission)


def prepare_practice_feedback(practice, submission: PracticeFeedbackRequest):
    """Validate the server record before allowing any model call."""

    title, instruction = _text(practice.title), _text(practice.instruction)
    formula, expected = _text(practice.answer_formula), _text(practice.expected_result)
    function = _text(practice.required_function)
    missing = []
    if not title or len(title) > 200:
        missing.append("과제 제목")
    if not instruction or len(instruction) > 4000:
        missing.append("과제 지시문")
    if practice.result_type not in ("NUMBER", "TEXT"):
        missing.append("결과 유형")
    tolerance = _finite_number(practice.tolerance)
    issue = function_requirement_issue(instruction, function)
    if issue:
        missing.append(issue)
    if submission.answer_type == "FORMULA":
        if not formula or not formula.startswith("=") or len(formula) > 2000:
            missing.append("모범 수식")
    else:
        if not expected:
            missing.append("기대 결과")
        if practice.result_type == "NUMBER":
            if expected and _finite_number(expected) is None:
                missing.append("숫자 정답 형식")
            if tolerance is None or tolerance < 0:
                missing.append("숫자 허용 오차")
        # A result alone cannot establish which function the learner used.
        if function:
            missing.append("필수 함수 확인을 위한 수식 제출")
    if missing:
        return _review(missing)

    trusted = TrustedFeedbackRequest(
        task_title=title, task_instruction=instruction,
        expected_answer=formula if submission.answer_type == "FORMULA" else expected,
        learner_answer=submission.learner_answer,
        evaluation_criteria=EvaluationCriteria(
            answer_type=submission.answer_type, result_type=practice.result_type,
            expected_result=expected or None,
            tolerance=str(tolerance) if tolerance is not None else None,
            required_function=function or None, answer_formula=formula or None,
        ),
    )
    grade = grade_request(trusted)
    return grade.feedback if grade.feedback.status == "needs_review" else trusted
