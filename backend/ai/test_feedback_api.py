"""Offline verification of AI API request/response with stubbed OpenAI evaluation."""
import os
from unittest.mock import patch
from fastapi.testclient import TestClient
from ai.standalone import app
from ai.schemas import FeedbackResponse
from ai.practice_feedback import get_feedback_db
from ai.schemas import TrustedFeedbackRequest, EvaluationCriteria
import pytest

client = TestClient(app)
PAYLOAD = {"practice_id":1, "learner_answer":"=SUM(A1:A2)"}


@pytest.fixture(autouse=True)
def stub_server_lookup():
    trusted = TrustedFeedbackRequest(
        task_title="엑셀 합계", task_instruction="합계", expected_answer="=SUM(A1:A3)",
        learner_answer=PAYLOAD["learner_answer"],
        evaluation_criteria=EvaluationCriteria(answer_type="FORMULA", result_type="NUMBER",
            expected_result="10", tolerance="0", required_function="SUM", answer_formula="=SUM(A1:A3)"),
    )
    app.dependency_overrides[get_feedback_db] = lambda: None
    with patch('app.routers.ai_feedback.load_practice_feedback', return_value=trusted):
        yield
    app.dependency_overrides.pop(get_feedback_db, None)

def test_missing_api_key():
    with patch.dict(os.environ, {}, clear=True):
        response = client.post('/api/ai/feedback', json=PAYLOAD)
    assert response.status_code == 503

def test_mocked_ai_evaluation():
    mock_response = FeedbackResponse(status="partially_correct",score=70,good_points=["함수 선택"],improvement_points=["범위 누락"],corrected_answer="=SUM(A1:A3)",explanation="A3 누락",next_practice="합계 범위 연습")
    with patch.dict(os.environ, {"FEEDBACK_PROVIDER":"openai", "OPENAI_API_KEY":"test-not-a-real-key"}):
        with patch('app.routers.ai_feedback.evaluate_answer', return_value=mock_response):
            response = client.post('/api/ai/feedback', json=PAYLOAD)
    assert response.status_code == 200, response.text
    assert response.json()['score'] == 70

def test_invalid_payload():
    response = client.post('/api/ai/feedback',json={"task_title":""})
    assert response.status_code == 422
