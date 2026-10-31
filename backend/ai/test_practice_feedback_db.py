"""Real SQLAlchemy lookup tests against isolated SQLite, never production DB."""
import pytest

pytest.importorskip("sqlalchemy")
pytest.importorskip("pymysql")
pytest.importorskip("dotenv")

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from unittest.mock import Mock

from app.database import Base
from app.models import Category, User, Content, Course, Practice
from ai.practice_feedback import load_practice_feedback
from ai.schemas import PracticeFeedbackRequest, TrustedFeedbackRequest


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread":False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Category(id=1, name="엑셀", category_type="COMMON"))
        session.add(User(id=1, email="ai-test@example.invalid", password_hash="not-a-login", name="AI 테스트"))
        session.flush()
        session.add(Course(id=1, title="과정", category_id=1, created_by=1, status="PUBLISHED"))
        session.flush()
        session.add(Content(id=1, title="콘텐츠", course_id=1, created_by=1, status="PUBLISHED"))
        session.flush()
        session.add(Practice(id=1, content_id=1, title="실습", instruction="합계 수식",
            answer_formula="=SUM(A1:A3)", expected_result="120", result_type="NUMBER",
            tolerance=0, required_function="SUM"))
        session.commit()
        yield session
    engine.dispose()


def request():
    return PracticeFeedbackRequest(practice_id=1, learner_answer="=SUM(A1:A3)")


def test_real_lookup(db):
    result = load_practice_feedback(db, request())
    assert isinstance(result, TrustedFeedbackRequest)
    assert result.expected_answer == "=SUM(A1:A3)"
    assert result.evaluation_criteria.required_function == "SUM"


@pytest.mark.parametrize("entity,status", [(Content,"DRAFT"), (Content,"HIDDEN"), (Course,"DRAFT")])
def test_unpublished_practice_not_available(db, entity, status):
    db.get(entity, 1).status = status
    db.flush()
    with pytest.raises(HTTPException) as exc:
        load_practice_feedback(db, request())
    assert exc.value.status_code == 404


def test_nonexistent_practice(db):
    with pytest.raises(HTTPException) as exc:
        load_practice_feedback(db, request().model_copy(update={"practice_id":999}))
    assert exc.value.status_code == 404


def test_missing_answer_from_database_defers(db):
    db.get(Practice, 1).answer_formula = None
    db.flush()
    result = load_practice_feedback(db, request())
    assert result.status == "needs_review" and result.score is None


def test_database_error_is_503():
    db = Mock()
    db.scalar.side_effect = OperationalError("select", {}, Exception("unavailable"))
    with pytest.raises(HTTPException) as exc:
        load_practice_feedback(db, request())
    assert exc.value.status_code == 503


def test_sqlite_lookup_through_live_api(db, monkeypatch):
    from fastapi.testclient import TestClient
    from ai.practice_feedback import get_feedback_db
    from ai.rubric import grade_request
    from ai.standalone import app

    monkeypatch.setenv("FEEDBACK_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "fake-no-external-call")
    monkeypatch.setattr("app.routers.ai_feedback.evaluate_answer", lambda request: grade_request(request).feedback)
    app.dependency_overrides[get_feedback_db] = lambda: db
    try:
        response = TestClient(app).post("/api/ai/feedback", json={
            "practice_id":1, "learner_answer":"=SUM(A1:A3)", "expected_answer":"spoofed"})
        assert response.status_code == 200
        assert response.json()["score"] == 100
        assert response.json()["corrected_answer"] == "=SUM(A1:A3)"
        db.get(Practice, 1).answer_formula = None
        db.flush()
        response = TestClient(app).post("/api/ai/feedback", json={"practice_id":1, "learner_answer":"=SUM(A1:A3)"})
        assert response.json()["status"] == "needs_review"
    finally:
        app.dependency_overrides.pop(get_feedback_db, None)
