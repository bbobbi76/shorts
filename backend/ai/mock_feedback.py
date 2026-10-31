"""Clearly labeled, deterministic offline demo — NOT AI scoring."""
from .schemas import FeedbackRequest, FeedbackResponse


def evaluate_mock(request: FeedbackRequest) -> FeedbackResponse:
    expected = request.expected_answer.strip().replace(" ", "").upper()
    given = request.learner_answer.strip().replace(" ", "").upper()
    if given == expected:
        return FeedbackResponse(status="correct", score=100,
            good_points=["예시 정답과 수식이 일치합니다."], improvement_points=[],
            corrected_answer=request.expected_answer,
            explanation="정답 문자열을 단순 비교한 목업 결과이며 엑셀 계산을 실행하지 않았습니다.",
            next_practice="다른 조건을 적용한 수식을 연습해 보세요.")
    if given.startswith("=SUMIF(") and expected.startswith("=SUMIF("):
        return FeedbackResponse(status="partially_correct", score=70,
            good_points=["조건별 합계를 위한 SUMIF 함수를 선택했습니다."],
            improvement_points=["조건 범위·조건·합계 범위를 모두 올바르게 지정했는지 확인하세요."],
            corrected_answer=request.expected_answer,
            explanation="목업의 고정 예시 점수입니다. 실제 수식 의미나 실행 결과를 검증하지 않습니다.",
            next_practice="SUMIFS로 여러 조건을 적용해 보세요.")
    return FeedbackResponse(status="incorrect", score=20,
        good_points=["과제를 시도했습니다."],
        improvement_points=["사용한 함수와 인수 구성을 다시 확인하세요."],
        corrected_answer=request.expected_answer,
        explanation="목업의 고정 예시 점수입니다. 실제 AI 평가가 아닙니다.",
        next_practice="기본 SUMIF 구문을 먼저 연습해 보세요.")
