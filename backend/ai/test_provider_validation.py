"""Provider boundary tests with controlled malformed/contradictory responses."""
import json
import sys
import types
from unittest.mock import Mock

import pytest

from ai.ai_feedback import evaluate_gemini
from ai.demo_service import prepare_demo
from ai.rubric import grade_request
from ai.schemas import PracticeFeedbackRequest


@pytest.fixture
def gemini(monkeypatch):
    request = prepare_demo(PracticeFeedbackRequest(practice_id=1, learner_answer='=SUMIF(A:A,"영업팀",B:B)'))
    grade = grade_request(request)
    data = grade.feedback.model_dump() | {"criterion_checks":[
        {k:v for k,v in c.items() if k != "points"} for c in grade.checks]}
    client = Mock()
    module = types.ModuleType("google.genai")
    module.Client = Mock(return_value=client)
    module.types = types.SimpleNamespace(HttpOptions=lambda **kw:kw, GenerateContentConfig=lambda **kw:kw)
    google = types.ModuleType("google")
    google.genai = module
    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.genai", module)
    monkeypatch.setenv("GEMINI_API_KEY", "fake-no-network")
    return request, data, client, module


def test_valid_gemini_assessment_and_timeout(gemini):
    request, data, client, module = gemini
    client.models.generate_content.return_value = Mock(text=json.dumps(data))
    assert evaluate_gemini(request).score == 100
    assert module.Client.call_args.kwargs["http_options"]["timeout"] == 30000


@pytest.mark.parametrize("text", [None, "", "not JSON", "[]", '{"status":"correct","score":101}'])
def test_bad_provider_responses_fail_validation(gemini, text):
    request, data, client, module = gemini
    client.models.generate_content.return_value = Mock(text=text)
    with pytest.raises(ValueError):
        evaluate_gemini(request)


def test_provider_made_up_score_is_not_shown(gemini):
    request, data, client, module = gemini
    data.update(status="partially_correct", score=73)
    client.models.generate_content.return_value = Mock(text=json.dumps(data))
    result = evaluate_gemini(request)
    assert result.status == "needs_review" and result.score is None


def test_provider_timeout_propagates(gemini):
    request, data, client, module = gemini
    client.models.generate_content.side_effect = TimeoutError("simulated timeout")
    with pytest.raises(TimeoutError):
        evaluate_gemini(request)
