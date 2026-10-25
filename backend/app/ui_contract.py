"""React 연동 응답 계약. Swagger에서도 실제 JSON 필드를 확인합니다."""
from pydantic import BaseModel, Field

class SessionOut(BaseModel):
    name: str
    role: str
    csrfToken: str


class MediaOut(BaseModel):
    id: str
    name: str
    size: int
    type: str
    kind: str
    duration: float | None = None


class CourseOut(BaseModel):
    id: str
    title: str
    summary: str
    learningGoal: str
    categoryId: str
    level: str
    status: str
    thumbnail: MediaOut | None = None
    updatedAt: str


class QuizOut(BaseModel):
    question: str = ""
    options: list[str] = Field(default_factory=list)
    correctIndex: int = -1
    explanation: str = ""


class SubtitleOut(BaseModel):
    id: str
    startSec: float
    endSec: float
    text: str


class OptionFeedbackOut(BaseModel):
    feedback: str
    feedbackSource: str
    rewatchSec: int | None


class PracticeSettingsOut(BaseModel):
    title: str
    expectedResult: str
    resultType: str
    tolerance: float
    requiredFunction: str
    answerFormula: str


class PublicResourceOut(BaseModel):
    id: str
    title: str
    resourceType: str
    description: str
    file: MediaOut | None
    promptText: str


class ResourceOut(PublicResourceOut):
    categoryId: str
    status: str


class TagOut(BaseModel):
    id: str
    name: str
    tagType: str
    synonyms: list[str]


class CatalogOut(BaseModel):
    tags: list[TagOut]
    resources: list[ResourceOut]


class PublicContentOut(BaseModel):
    id: str
    courseId: str
    title: str
    learningGoal: str
    video: MediaOut | None = None
    thumbnail: MediaOut | None = None
    practiceText: str = ""
    practice: MediaOut | None = None
    resource: MediaOut | None = None
    workUse: str = ""
    subtitles: list[SubtitleOut] = Field(default_factory=list)
    resources: list[PublicResourceOut] = Field(default_factory=list)
    updatedAt: str


class ContentOut(PublicContentOut):
    status: str
    quiz: QuizOut
    sortOrder: int
    version: int
    optionFeedbacks: list[OptionFeedbackOut]
    practiceSettings: PracticeSettingsOut
    tagIds: list[str]
    skillIds: list[str]
    resourceIds: list[str]


class ErrorOut(BaseModel):
    message: str
    fields: list[str]
    details: list[str]
