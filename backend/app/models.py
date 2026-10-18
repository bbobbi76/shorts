"""DB 테이블과 1:1로 대응하는 SQLAlchemy 모델 (db/schema.sql 기준).

ENUM 컬럼은 문자열로 다룹니다. 허용 값은 schemas.py의 Literal 타입으로 검사합니다.
created_at·updated_at은 DB가 자동으로 채우므로 server_default만 지정합니다.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Table, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# ---------- 연결 테이블 (N:M) ----------
content_tags = Table(
    "content_tags", Base.metadata,
    Column("content_id", BigInteger, ForeignKey("contents.content_id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.tag_id"), primary_key=True),
)
content_skills = Table(
    "content_skills", Base.metadata,
    Column("content_id", BigInteger, ForeignKey("contents.content_id"), primary_key=True),
    Column("skill_id", Integer, ForeignKey("skills.skill_id"), primary_key=True),
)
content_resources = Table(
    "content_resources", Base.metadata,
    Column("content_id", BigInteger, ForeignKey("contents.content_id"), primary_key=True),
    Column("resource_id", BigInteger, ForeignKey("resources.resource_id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column("user_id", BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50))
    role: Mapped[str] = mapped_column(String(10), default="USER")
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE")
    tier_code: Mapped[str] = mapped_column(String(20), default="BRONZE")
    learning_score: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column("category_id", Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    category_type: Mapped[str] = mapped_column(String(10))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column("skill_id", Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"))
    name: Mapped[str] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class StoredFile(Base):
    """files 테이블. 실제 파일은 UPLOAD_DIR에, 위치와 정보만 DB에 저장합니다."""
    __tablename__ = "files"
    id: Mapped[int] = mapped_column("file_id", BigInteger, primary_key=True, autoincrement=True)
    file_type: Mapped[str] = mapped_column(String(20))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    @property
    def url(self) -> str:
        return "/files/" + self.stored_path


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column("course_id", BigInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"))
    title: Mapped[str] = mapped_column(String(100))
    summary: Mapped[str | None] = mapped_column(String(500))
    learning_goal: Mapped[str | None] = mapped_column(String(500))
    level: Mapped[str] = mapped_column(String(10), default="BASIC")
    thumbnail_file_id: Mapped[int | None] = mapped_column(ForeignKey("files.file_id"))
    status: Mapped[str] = mapped_column(String(10), default="DRAFT")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    category: Mapped[Category] = relationship()
    thumbnail_file: Mapped[StoredFile | None] = relationship()


class Content(Base):
    """contents 테이블: 숏폼 영상 1개 단위"""
    __tablename__ = "contents"
    id: Mapped[int] = mapped_column("content_id", BigInteger, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.course_id"))
    title: Mapped[str] = mapped_column(String(100))
    learning_goal: Mapped[str | None] = mapped_column(String(500))
    work_use: Mapped[str | None] = mapped_column(String(255))
    video_file_id: Mapped[int | None] = mapped_column(ForeignKey("files.file_id"))
    thumbnail_file_id: Mapped[int | None] = mapped_column(ForeignKey("files.file_id"))
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    aspect_ratio: Mapped[str | None] = mapped_column(String(10))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(10), default="DRAFT")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())

    course: Mapped[Course] = relationship()
    video_file: Mapped[StoredFile | None] = relationship(foreign_keys=[video_file_id])
    thumbnail_file: Mapped[StoredFile | None] = relationship(foreign_keys=[thumbnail_file_id])
    tags: Mapped[list["Tag"]] = relationship(secondary=content_tags)
    skills: Mapped[list[Skill]] = relationship(secondary=content_skills)
    resources: Mapped[list["Resource"]] = relationship(secondary=content_resources)


class Subtitle(Base):
    __tablename__ = "subtitles"
    id: Mapped[int] = mapped_column("subtitle_id", BigInteger, primary_key=True, autoincrement=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.content_id"))
    start_sec: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    end_sec: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    caption_text: Mapped[str] = mapped_column(String(500))


class Quiz(Base):
    __tablename__ = "quizzes"
    id: Mapped[int] = mapped_column("quiz_id", BigInteger, primary_key=True, autoincrement=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.content_id"))
    question: Mapped[str] = mapped_column(String(500), default="")
    explanation: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=1)

    options: Mapped[list["QuizOption"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", order_by="QuizOption.option_no"
    )


class QuizOption(Base):
    """quiz_options 테이블: 보기 + 보기별 피드백"""
    __tablename__ = "quiz_options"
    id: Mapped[int] = mapped_column("option_id", BigInteger, primary_key=True, autoincrement=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.quiz_id"))
    option_no: Mapped[int] = mapped_column(Integer)
    option_text: Mapped[str] = mapped_column(String(255), default="")
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    feedback: Mapped[str | None] = mapped_column(Text)
    feedback_source: Mapped[str] = mapped_column(String(10), default="NONE")
    rewatch_sec: Mapped[int | None] = mapped_column(Integer)

    quiz: Mapped[Quiz] = relationship(back_populates="options")


class Practice(Base):
    """practices 테이블: 선택 실습 (수식·결과 입력형)"""
    __tablename__ = "practices"
    id: Mapped[int] = mapped_column("practice_id", BigInteger, primary_key=True, autoincrement=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("contents.content_id"))
    title: Mapped[str] = mapped_column(String(100), default="")
    instruction: Mapped[str] = mapped_column(Text, default="")
    example_file_id: Mapped[int | None] = mapped_column(ForeignKey("files.file_id"))
    expected_result: Mapped[str] = mapped_column(String(255), default="")
    result_type: Mapped[str] = mapped_column(String(10), default="NUMBER")
    tolerance: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0"))
    required_function: Mapped[str | None] = mapped_column(String(50))
    answer_formula: Mapped[str | None] = mapped_column(String(1000))

    example_file: Mapped[StoredFile | None] = relationship()


class Resource(Base):
    """resources 테이블: 실무자료 (템플릿·예시 문서·프롬프트)"""
    __tablename__ = "resources"
    id: Mapped[int] = mapped_column("resource_id", BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(100))
    resource_type: Mapped[str] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(String(500))
    file_id: Mapped[int | None] = mapped_column(ForeignKey("files.file_id"))
    prompt_text: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.category_id"))
    status: Mapped[str] = mapped_column(String(10), default="DRAFT")
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"))

    file: Mapped[StoredFile | None] = relationship()


class Tag(Base):
    """tags 테이블: 검색 태그 (업무 상황·오류 메시지·함수·툴)"""
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column("tag_id", Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50))
    tag_type: Mapped[str] = mapped_column(String(20))

    synonyms: Mapped[list["TagSynonym"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class TagSynonym(Base):
    __tablename__ = "tag_synonyms"
    id: Mapped[int] = mapped_column("synonym_id", Integer, primary_key=True, autoincrement=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.tag_id"))
    synonym: Mapped[str] = mapped_column(String(50))

    tag: Mapped[Tag] = relationship(back_populates="synonyms")


class AdminLog(Base):
    """admin_logs 테이블: 공개·비공개 같은 관리자 작업 기록"""
    __tablename__ = "admin_logs"
    id: Mapped[int] = mapped_column("log_id", BigInteger, primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    action: Mapped[str] = mapped_column(String(50))
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
