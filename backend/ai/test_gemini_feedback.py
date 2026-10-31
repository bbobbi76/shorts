import json
from pathlib import Path
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from ai.schemas import FeedbackRequest
from ai.mock_feedback import evaluate_mock
from ai import ai_feedback
from ai.standalone import app

REQ = FeedbackRequest.model_validate(json.loads(Path(__file__).with_name("example_request.json").read_text(encoding="utf-8")))

def test_mock_three_cases():
    for answer, status in [
        ('=SUMIF(A:A,"영업팀",B:B)', "correct"),
        ('=SUMIF(A:A,"영업팀")', "partially_correct"),
        ('=AVERAGE(B:B)', "incorrect"),
    ]:
        result = evaluate_mock(REQ.model_copy(update={"learner_answer":answer}))
        assert result.status == status
        assert 0 <= result.score <= 100

def test_mock_api_and_demo():
    client = TestClient(app)
    r = client.post("/api/ai/feedback/mock", json=REQ.model_dump())
    assert r.status_code == 200
    assert r.json()["status"] == "partially_correct"
    assert client.get("/demo").status_code == 200

def test_missing_key_for_live(monkeypatch):
    from ai.practice_feedback import get_feedback_db
    app.dependency_overrides[get_feedback_db] = lambda: None
    monkeypatch.setattr("app.routers.ai_feedback.load_practice_feedback", lambda *_: REQ)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("FEEDBACK_PROVIDER", "gemini")
    try:
        assert TestClient(app).post("/api/ai/feedback", json={"practice_id":1, "learner_answer":REQ.learner_answer}).status_code == 503
    finally:
        app.dependency_overrides.pop(get_feedback_db, None)

def test_provider_dispatch(monkeypatch):
    sentinel = evaluate_mock(REQ)
    monkeypatch.setenv("FEEDBACK_PROVIDER", "gemini")
    monkeypatch.setattr(ai_feedback, "evaluate_gemini", lambda _: sentinel)
    assert ai_feedback.evaluate_answer(REQ) == sentinel

def test_gemini_validates_json(monkeypatch):
    import sys
    import types
    key = 'fake-no-network-key'
    monkeypatch.setenv("GEMINI_API_KEY", key)
    fake_response = Mock(text=json.dumps(evaluate_mock(REQ).model_dump(), ensure_ascii=False))
    fake_client = Mock()
    fake_client.models.generate_content.return_value = fake_response
    genai_module = types.ModuleType("google.genai")
    genai_module.Client = Mock(return_value=fake_client)
    genai_module.types = types.SimpleNamespace(GenerateContentConfig=lambda **kw: kw, HttpOptions=lambda **kw: kw)
    google_module = types.ModuleType("google")
    google_module.genai = genai_module
    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.genai", genai_module)
    got = ai_feedback.evaluate_gemini(REQ)
    assert got.score == 70
    fake_client.models.generate_content.assert_called_once()


def test_gemini_receives_server_criteria(monkeypatch):
    from types import SimpleNamespace
    from ai.practice_feedback import prepare_practice_feedback
    from ai.schemas import PracticeFeedbackRequest
    import sys
    import types

    trusted = prepare_practice_feedback(SimpleNamespace(
        title="서버 과제", instruction="합계 수식", answer_formula="=SUM(A1:A3)",
        expected_result="120", result_type="NUMBER", tolerance="0.01", required_function="SUM"),
        PracticeFeedbackRequest(practice_id=1, learner_answer="=SUM(A1:A3)"))
    fake_client = Mock()
    fake_client.models.generate_content.return_value = Mock(text=json.dumps(evaluate_mock(REQ).model_dump()))
    genai_module = types.ModuleType("google.genai")
    genai_module.Client = Mock(return_value=fake_client)
    genai_module.types = SimpleNamespace(GenerateContentConfig=lambda **kw: kw, HttpOptions=lambda **kw: kw)
    google_module = types.ModuleType("google")
    google_module.genai = genai_module
    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.genai", genai_module)
    monkeypatch.setenv("GEMINI_API_KEY", "fake-no-network-key")
    ai_feedback.evaluate_gemini(trusted)
    contents = fake_client.models.generate_content.call_args.kwargs["contents"]
    payload = json.loads(contents.split("과제 데이터(JSON):\n", 1)[1])
    assert payload["expected_answer"] == "=SUM(A1:A3)"
    assert payload["evaluation_criteria"]["tolerance"] == "0.01"
    assert payload["evaluation_criteria"]["required_function"] == "SUM"
    assert payload["server_rubric"]["score"] == 100
    assert "authoritative" in fake_client.models.generate_content.call_args.kwargs["config"]["system_instruction"]
