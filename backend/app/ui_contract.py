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
    description: str
    objective: str
    topic: str
    job: str
    level: str
    updatedAt: str


class QuizOut(BaseModel):
    question: str = ""
    options: list[str] = Field(default_factory=list)
    correctIndex: int = -1
    explanation: str = ""


class PublicContentOut(BaseModel):
    id: str
    courseId: str
    title: str
    objective: str
    video: MediaOut | None = None
    thumbnail: MediaOut | None = None
    practiceText: str = ""
    practice: MediaOut | None = None
    resource: MediaOut | None = None
    updatedAt: str


class ContentOut(PublicContentOut):
    status: str
    quiz: QuizOut


class ErrorOut(BaseModel):
    message: str
    fields: list[str]
    details: list[str]
