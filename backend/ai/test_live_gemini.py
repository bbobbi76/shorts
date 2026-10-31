"""External verification is opt-in to avoid charges during ordinary pytest."""
import os
import pytest

from ai.verify_feedback import load_feedback_env, verify_live


def test_live_gemini_evaluation_set():
    load_feedback_env()
    if os.getenv("RUN_GEMINI_LIVE") != "1":
        pytest.skip("실제 Gemini 호출 미검증: RUN_GEMINI_LIVE=1일 때만 실행")
    if not os.getenv("GEMINI_API_KEY", "").strip():
        pytest.skip("실제 Gemini 호출 미검증: API 키 없음")
    result = verify_live()
    assert result["external_api"] == "attempted"
    assert all(case["passed"] for case in result["cases"]), result
