"""Authored structural regression cases and adversarial provider responses."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from ai.demo_service import evaluate_demo, load_evaluation_set, prepare_demo
from ai.practice_feedback import prepare_practice_feedback
from ai.rubric import grade_request, parse_formula, validate_model_assessment, FormulaUnsupported
from ai.schemas import FeedbackResponse, PracticeFeedbackRequest, TrustedFeedbackRequest
from ai.standalone import app

DATA = load_evaluation_set()


@pytest.mark.parametrize("case", DATA["cases"], ids=lambda c:c["id"])
def test_gold_evaluation_set(case):
    result = evaluate_demo(PracticeFeedbackRequest(practice_id=case["practice_id"], learner_answer=case["answer"]))
    assert (result.status, result.score) == (case["status"], case["score"])
    if result.status == "needs_review":
        assert result.corrected_answer == "" and result.good_points == []
    else:
        assert result.corrected_answer == DATA["practices"][str(case["practice_id"])]["answer_formula"]
        assert "실행하거나 계산 결과를 검증하지 않았습니다" in result.explanation


def trusted(answer=None, **updates):
    practice = DATA["practices"]["1"] | updates
    return prepare_practice_feedback(SimpleNamespace(**practice), PracticeFeedbackRequest(
        practice_id=1, learner_answer=answer or practice["answer_formula"]))


def assessment(request):
    grade = grade_request(request)
    data = grade.feedback.model_dump() | {"criterion_checks":[
        {k:v for k,v in c.items() if k != "points"} for c in grade.checks]}
    return data, grade


def test_no_function_constraint_is_not_missing_criteria():
    request = trusted(required_function=None, instruction="A열이 영업팀인 B열 매출 합계를 구하세요.")
    assert isinstance(request, TrustedFeedbackRequest)
    assert grade_request(request).feedback.score == 100


@pytest.mark.parametrize("updates", [
    {"required_function":None},
    {"required_function":"IF"},
    {"instruction":"함수 제한 없음", "required_function":"SUMIF"},
])
def test_instruction_criterion_conflicts_defer(updates):
    assert trusted(**updates).status == "needs_review"


def test_unrestricted_alternative_needs_proof():
    result = trusted(answer="=SUM(B1:B3)", required_function=None, instruction="매출 합계를 구하세요.")
    assert result.status == "needs_review"


def test_quoted_spaces_and_case_are_not_erased():
    a = '=SUMIF(A:A,"Sales Team",B:B)'
    assert parse_formula(a) != parse_formula('=SUMIF(A:A,"SalesTeam",B:B)')
    assert parse_formula(a) != parse_formula('=SUMIF(A:A,"sales team",B:B)')
    assert parse_formula(a) == parse_formula('= sumif( a:a , "Sales Team", b:b )')


@pytest.mark.parametrize("answer", ["=SUMIF(A:A,)", "=SUMIF(A:A", "=SUMIF(A:A) garbage",
    "=__import__(A1)", "=SUMPRODUCT(A1:A3)", "=SUM(Sheet1!A1)", "=SUM(MyRange)", "="+"("*30+"A1"+")"*30])
def test_unsupported_or_malformed_formulas_are_not_guessed(answer):
    with pytest.raises(FormulaUnsupported):
        parse_formula(answer)


@pytest.mark.parametrize("formula", ['=SUMIF(A:A)', '=SUMIFS(B:B,A:A)', '=IF(A1)'])
def test_invalid_reference_formula_defers(formula):
    name = formula.split('(')[0][1:]
    assert trusted(answer=formula, answer_formula=formula, required_function=name, instruction="과제를 풀어보세요.").status == "needs_review"


def test_ai_correct_assessment_returns_only_server_proven_prose():
    request = trusted()
    data, grade = assessment(request)
    data.update(good_points=["실제로 Excel에서 999원을 계산했습니다."],
                explanation="데이터를 실행해 확인했습니다.", next_practice="없는 과제 999번으로 이동하세요.")
    response = validate_model_assessment(request, data, grade)
    assert response == grade.feedback
    assert "999" not in response.model_dump_json()


@pytest.mark.parametrize("field,value", [("score",99), ("status","incorrect"),
    ("corrected_answer","=SUM(B:B)"), ("criterion_checks",[])])
def test_model_score_status_and_evidence_cannot_override_server(field, value):
    request = trusted()
    data, grade = assessment(request)
    data[field] = value
    result = validate_model_assessment(request, data, grade)
    assert result.status == "needs_review" and result.score is None


@pytest.mark.parametrize("field,value", [("passed",False), ("expected","invented"),
    ("observed","invented"), ("criterion_id","invented")])
def test_fabricated_criterion_evidence_is_held(field, value):
    request = trusted()
    data, grade = assessment(request)
    data["criterion_checks"][0][field] = value
    assert validate_model_assessment(request, data, grade).status == "needs_review"


def test_missing_provider_evidence_is_held():
    request = trusted()
    data, grade = assessment(request)
    del data["criterion_checks"]
    assert validate_model_assessment(request, data, grade).status == "needs_review"


def test_wrong_json_types_rejected():
    request = trusted()
    data, grade = assessment(request)
    data["score"] = "100"
    with pytest.raises(ValidationError):
        validate_model_assessment(request, data, grade)


@pytest.mark.parametrize("answer,expected,tolerance,status", [
    ("120.01","120","0.01","correct"), ("120.0101","120","0.01","incorrect"),
    ("NaN","120","0.01","needs_review"), ("Infinity","120","0.01","needs_review"),
    ("1e999999999","120","0.01","needs_review"), ("-1","0","0","incorrect"),
])
def test_numeric_tolerance_boundaries(answer, expected, tolerance, status):
    result = prepare_practice_feedback(SimpleNamespace(**(DATA["practices"]["1"] | dict(
        instruction="결과값을 제출하세요.", required_function=None,
        expected_result=expected, tolerance=tolerance))), PracticeFeedbackRequest(
        practice_id=1, learner_answer=answer, answer_type="RESULT"))
    feedback = result if isinstance(result, FeedbackResponse) else grade_request(result).feedback
    assert feedback.status == status


@pytest.mark.parametrize("case", DATA["cases"], ids=lambda c:c["id"])
def test_standalone_demo_real_endpoint(case):
    response = TestClient(app).post("/api/ai/demo/feedback", json={
        "practice_id":case["practice_id"], "learner_answer":case["answer"],
        "expected_answer":"client spoof", "evaluation_criteria":{"score":100}})
    assert response.status_code == 200
    assert response.json()["status"] == case["status"]
    assert response.json()["score"] == case["score"]


def test_demo_deferral_missing_reference():
    response = TestClient(app).post("/api/ai/demo/feedback", json={"practice_id":4,"learner_answer":"=SUM(B:B)"})
    assert response.json()["status"] == "needs_review"


def test_demo_no_key_and_provider_failure(monkeypatch):
    client = TestClient(app)
    body = {"practice_id":1,"learner_answer":DATA["practices"]["1"]["answer_formula"]}
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.post("/api/ai/demo/feedback?mode=gemini", json=body).status_code == 503
    monkeypatch.setenv("GEMINI_API_KEY", "fake-no-network")
    def fail(*_):
        raise RuntimeError("timeout")
    monkeypatch.setattr("ai.standalone.evaluate_gemini", fail)
    assert client.post("/api/ai/demo/feedback?mode=gemini", json=body).status_code == 502


def test_demo_reference_missing_never_calls_provider(monkeypatch):
    def fail(*_):
        raise AssertionError("must not call provider")
    monkeypatch.setattr("ai.standalone.evaluate_gemini", fail)
    response = TestClient(app).post("/api/ai/demo/feedback?mode=gemini", json={
        "practice_id":4,"learner_answer":"=SUM(B:B)"})
    assert response.json()["status"] == "needs_review"
