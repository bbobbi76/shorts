"""요청·응답 형식 (pydantic).

JSON 키는 프론트엔드와 맞추기 위해 camelCase로 주고받습니다. (예: category_id ↔ categoryId)
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from . import models

Level = Literal["INTRO", "BASIC", "ADVANCED"]
PublishStatus = Literal["DRAFT", "PUBLISHED", "HIDDEN"]
ResultType = Literal["NUMBER", "TEXT"]
ResourceType = Literal["TEMPLATE", "EXAMPLE_DOC", "PROMPT"]
TagType = Literal["SITUATION", "ERROR", "FUNCTION", "TOOL"]
FileType = Literal["VIDEO", "THUMBNAIL", "PRACTICE", "RESOURCE", "SUBTITLE"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ---------- 공통 ----------

class FileOut(CamelModel):
    id: int
    file_type: str
    original_name: str
    url: str
    mime_type: str
    size_bytes: int

    @staticmethod
    def of(f: models.StoredFile | None) -> "FileOut | None":
        if f is None:
            return None
        return FileOut(id=f.id, file_type=f.file_type, original_name=f.original_name, url=f.url,
                       mime_type=f.mime_type, size_bytes=f.size_bytes)


class StatusIn(CamelModel):
    status: str


class CategoryOut(CamelModel):
    id: int
    name: str
    category_type: str


class SkillOut(CamelModel):
    id: int
    category_id: int
    name: str
    description: str | None = None


# ---------- 인증 ----------

class LoginIn(CamelModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginOut(CamelModel):
    token: str
    user_id: int
    name: str
    role: str


# ---------- 과정 ----------

class CourseIn(CamelModel):
    category_id: int
    title: str = Field(min_length=1, max_length=100)
    summary: str | None = Field(default=None, max_length=500)
    learning_goal: str | None = Field(default=None, max_length=500)
    level: Level | None = None
    thumbnail_file_id: int | None = None


class CourseOut(CamelModel):
    id: int
    category_id: int
    category_name: str
    title: str
    summary: str | None
    learning_goal: str | None
    level: str
    status: str
    thumbnail: FileOut | None
    content_count: int
    published_content_count: int
    total_duration_sec: int
    created_at: datetime | None
    published_at: datetime | None


class ContentOrderIn(CamelModel):
    content_ids: list[int]


# ---------- 콘텐츠 ----------

class ContentCreateIn(CamelModel):
    course_id: int
    title: str = Field(min_length=1, max_length=100)


class OptionIn(CamelModel):
    option_text: str | None = None
    correct: bool | None = None
    feedback: str | None = None
    rewatch_sec: int | None = None


class QuizIn(CamelModel):
    question: str | None = None
    explanation: str | None = None
    options: list[OptionIn] | None = None


class PracticeIn(CamelModel):
    title: str | None = None
    instruction: str | None = None
    example_file_id: int | None = None
    expected_result: str | None = None
    result_type: ResultType | None = None
    tolerance: float | None = None
    required_function: str | None = None
    answer_formula: str | None = None


class SubtitleIO(CamelModel):
    start_sec: float | None = None
    end_sec: float | None = None
    text: str | None = None


class ContentSaveIn(CamelModel):
    """임시저장: 필수 항목이 비어 있어도 저장합니다. 공개 조건은 /publish에서 검사합니다."""
    title: str = Field(min_length=1, max_length=100)
    learning_goal: str | None = Field(default=None, max_length=500)
    work_use: str | None = Field(default=None, max_length=255)
    video_file_id: int | None = None
    thumbnail_file_id: int | None = None
    duration_sec: int | None = None
    aspect_ratio: str | None = Field(default=None, max_length=10)
    sort_order: int | None = None
    quiz: QuizIn | None = None
    practice: PracticeIn | None = None
    tag_ids: list[int] | None = None
    skill_ids: list[int] | None = None
    resource_ids: list[int] | None = None
    subtitles: list[SubtitleIO] | None = None


class OptionOut(CamelModel):
    id: int
    option_no: int
    option_text: str
    correct: bool
    feedback: str | None
    feedback_source: str
    rewatch_sec: int | None


class QuizOut(CamelModel):
    id: int
    question: str
    explanation: str | None
    options: list[OptionOut]


class PracticeOut(CamelModel):
    id: int
    title: str
    instruction: str
    example_file: FileOut | None
    expected_result: str
    result_type: str
    tolerance: float
    required_function: str | None
    answer_formula: str | None


class ContentSummary(CamelModel):
    id: int
    title: str
    sort_order: int
    status: str
    duration_sec: int | None
    thumbnail: FileOut | None
    has_video: bool
    updated_at: datetime | None

    @staticmethod
    def of(c: models.Content) -> "ContentSummary":
        return ContentSummary(id=c.id, title=c.title, sort_order=c.sort_order, status=c.status,
                              duration_sec=c.duration_sec, thumbnail=FileOut.of(c.thumbnail_file),
                              has_video=c.video_file_id is not None, updated_at=c.updated_at)


class ContentDetail(CamelModel):
    id: int
    course_id: int
    course_title: str
    title: str
    learning_goal: str | None
    work_use: str | None
    video: FileOut | None
    thumbnail: FileOut | None
    duration_sec: int | None
    aspect_ratio: str | None
    sort_order: int
    version: int
    status: str
    published_at: datetime | None
    updated_at: datetime | None
    quiz: QuizOut | None
    practice: PracticeOut | None
    tag_ids: list[int]
    skill_ids: list[int]
    resource_ids: list[int]
    subtitles: list[SubtitleIO]


# ---------- 실무자료 ----------

class ResourceIn(CamelModel):
    title: str = Field(min_length=1, max_length=100)
    resource_type: ResourceType
    description: str | None = Field(default=None, max_length=500)
    file_id: int | None = None
    prompt_text: str | None = None
    category_id: int | None = None
    status: PublishStatus | None = None


class ResourceOut(CamelModel):
    id: int
    title: str
    resource_type: str
    description: str | None
    file: FileOut | None
    prompt_text: str | None
    category_id: int | None
    status: str
    download_count: int

    @staticmethod
    def of(r: models.Resource) -> "ResourceOut":
        return ResourceOut(id=r.id, title=r.title, resource_type=r.resource_type, description=r.description,
                           file=FileOut.of(r.file), prompt_text=r.prompt_text, category_id=r.category_id,
                           status=r.status, download_count=r.download_count)


# ---------- 검색 태그 ----------

class TagIn(CamelModel):
    name: str = Field(min_length=1, max_length=50)
    tag_type: TagType
    synonyms: list[str] | None = None


class SynonymIn(CamelModel):
    synonym: str = Field(min_length=1, max_length=50)


class TagOut(CamelModel):
    id: int
    name: str
    tag_type: str
    synonyms: list[str]

    @staticmethod
    def of(t: models.Tag) -> "TagOut":
        return TagOut(id=t.id, name=t.name, tag_type=t.tag_type, synonyms=[s.synonym for s in t.synonyms])


# ---------- 대시보드 ----------

class LogOut(CamelModel):
    id: int
    action: str
    target_type: str
    target_id: int
    created_at: datetime | None


class DashboardOut(CamelModel):
    user_count: int
    course_count: int
    published_course_count: int
    content_count: int
    draft_content_count: int
    published_content_count: int
    hidden_content_count: int
    resource_count: int
    tag_count: int
    recent_contents: list[ContentSummary]
    recent_logs: list[LogOut]
