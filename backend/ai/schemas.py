from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator


class PracticeFeedbackRequest(BaseModel):
    """Public LIVE input. Client-provided answers/criteria are discarded."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    practice_id: int = Field(gt=0, strict=True)
    learner_answer: str = Field(min_length=1, max_length=4000)
    answer_type: Literal["FORMULA", "RESULT"] = "FORMULA"


class FeedbackRequest(BaseModel):
    """Request body for evaluating a learner's answer."""
    model_config = ConfigDict(str_strip_whitespace=True)

    task_title: str = Field(min_length=1, max_length=200)
    task_instruction: str = Field(min_length=1, max_length=4000)
    expected_answer: str = Field(min_length=1, max_length=2000)
    learner_answer: str = Field(min_length=1, max_length=4000)


class EvaluationCriteria(BaseModel):
    answer_type: Literal["FORMULA", "RESULT"]
    result_type: Literal["NUMBER", "TEXT"]
    expected_result: str | None
    tolerance: str | None
    required_function: str | None
    answer_formula: str | None


class TrustedFeedbackRequest(FeedbackRequest):
    """Internal only: assembled from the practices table, never HTTP input."""
    evaluation_criteria: EvaluationCriteria


class FeedbackResponse(BaseModel):
    status: Literal["correct", "partially_correct", "incorrect", "needs_review"]
    score: int | None = Field(ge=0, le=100)
    good_points: list[str]
    improvement_points: list[str]
    corrected_answer: str
    explanation: str
    next_practice: str

    @model_validator(mode="after")
    def validate_review_score(self):
        if (self.status == "needs_review") != (self.score is None):
            raise ValueError("보류 상태는 점수가 없어야 하며, 평가 결과에는 점수가 필요합니다.")
        return self


class CriterionCheck(BaseModel):
    """Internal provider evidence, not part of the public API response."""
    model_config = ConfigDict(extra="forbid", strict=True)
    criterion_id: str
    passed: bool
    expected: str
    observed: str


class ProviderAssessment(FeedbackResponse):
    model_config = ConfigDict(extra="forbid", strict=True)
    criterion_checks: list[CriterionCheck] = Field(default_factory=list)
