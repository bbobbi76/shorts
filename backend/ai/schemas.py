from pydantic import BaseModel, Field, ConfigDict


class FeedbackRequest(BaseModel):
    """Request body for evaluating a learner's answer."""
    model_config = ConfigDict(str_strip_whitespace=True)

    task_title: str = Field(min_length=1, max_length=200)
    task_instruction: str = Field(min_length=1, max_length=4000)
    expected_answer: str = Field(min_length=1, max_length=2000)
    learner_answer: str = Field(min_length=1, max_length=4000)


class FeedbackResponse(BaseModel):
    status: str = Field(description="correct, partially_correct, or incorrect")
    score: int = Field(ge=0, le=100)
    good_points: list[str]
    improvement_points: list[str]
    corrected_answer: str
    explanation: str
    next_practice: str
