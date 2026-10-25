"""서빈 React 화면과 기존 WorkFit 테이블을 연결하는 호환 API.

기존 /api/admin API는 유지하고 /api/ui 아래에 프론트 계약을 제공합니다.
UiRecord는 UUID 중복 방지와 기존 DB에 없는 화면 메타데이터를 보관합니다.
"""
import secrets
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import JSON, String, UniqueConstraint, select, delete
from sqlalchemy.orm import Mapped, Session, mapped_column

from .auth import check_password
from .config import FRONTEND_ORIGIN, UPLOAD_DIR
from .database import Base, get_db
from .errors import ApiError
from .models import Category, Content, Course, Practice, Resource, StoredFile, User, Tag, TagSynonym, Skill, Subtitle
from .routers import contents as native
from .schemas import QuizIn
from . import files
from .ui_contract import (CatalogOut, ContentOut, CourseOut, ErrorOut, MediaOut,
                          PublicContentOut, ResourceOut, SessionOut, TagOut)


class UiRecord(Base):
    __tablename__ = "ui_records"
    __table_args__ = (UniqueConstraint("kind", "owner_id", "request_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    owner_id: Mapped[int]
    request_key: Mapped[str] = mapped_column(String(64))
    native_id: Mapped[int | None]
    payload: Mapped[dict] = mapped_column(JSON)


class MediaRef(BaseModel):
    id: str


class CourseBody(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(max_length=100)
    summary: str = Field(default="", max_length=500)
    learningGoal: str = Field(default="", max_length=500)
    categoryId: str
    level: Literal["INTRO", "BASIC", "ADVANCED"] = "BASIC"
    status: Literal["DRAFT", "PUBLISHED", "HIDDEN"] = "DRAFT"
    thumbnail: MediaRef | None = None


class LoginBody(BaseModel):
    email: str
    password: str


class QuizBody(BaseModel):
    question: str = Field(default="", max_length=500)
    options: list[str] = Field(default_factory=list, max_length=4)
    correctIndex: int = Field(default=-1, ge=-1, le=3)
    explanation: str = ""


class OptionFeedbackBody(BaseModel):
    feedback: str = ""
    feedbackSource: Literal["NONE", "AI_DRAFT", "ADMIN"] = "NONE"
    rewatchSec: int | None = Field(default=None, ge=0)


class PracticeSettingsBody(BaseModel):
    title: str = Field(default="", max_length=100)
    expectedResult: str = Field(default="", max_length=255)
    resultType: Literal["NUMBER", "TEXT"] = "NUMBER"
    tolerance: float = Field(default=0, ge=0, le=99999999.9999, allow_inf_nan=False)
    requiredFunction: str = Field(default="", max_length=50)
    answerFormula: str = Field(default="", max_length=1000)


class SubtitleBody(BaseModel):
    id: str = Field(max_length=64)
    startSec: float = Field(ge=0, le=99999.99, allow_inf_nan=False)
    endSec: float = Field(gt=0, le=99999.99, allow_inf_nan=False)
    text: str = Field(min_length=1, max_length=500)


class ContentBody(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    courseId: str = ""
    title: str = Field(default="", max_length=100)
    learningGoal: str = Field(default="", max_length=500)
    workUse: str = Field(default="", max_length=255)
    sortOrder: int = Field(default=1, ge=0, le=2147483647)
    status: Literal["DRAFT", "REVIEW", "PUBLISHED", "HIDDEN"] = "DRAFT"
    video: MediaRef | None = None
    thumbnail: MediaRef | None = None
    quiz: QuizBody = Field(default_factory=QuizBody)
    practiceText: str = ""
    practice: MediaRef | None = None
    resource: MediaRef | None = None
    optionFeedbacks: list[OptionFeedbackBody] = Field(default_factory=list, max_length=4)
    practiceSettings: PracticeSettingsBody = Field(default_factory=PracticeSettingsBody)
    tagIds: list[str] = Field(default_factory=list)
    skillIds: list[str] = Field(default_factory=list)
    resourceIds: list[str] = Field(default_factory=list)
    subtitles: list[SubtitleBody] = Field(default_factory=list, max_length=5000)


router = APIRouter(prefix="/api/ui", tags=["React 연동"], responses={
    code: {"model": ErrorOut, "description": description}
    for code, description in {400: "입력 형식·파일 검증 오류", 401: "미로그인·세션 만료",
        403: "권한·CSRF·Origin 거절", 404: "자료 없음", 409: "DB 제약 충돌",
        422: "저장·공개 조건 위반", 500: "서버 오류"}.items()
})
# 서버 재시작 시 만료되는 로컬 개발용 세션. 클라이언트에 사용자 ID를 신뢰하지 않습니다.
sessions: dict[str, tuple[int, str, float]] = {}
COOKIE = "workfit_session"


def allowed_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in {FRONTEND_ORIGIN, "http://127.0.0.1:5173", "http://localhost:5173"}:
        raise ApiError(403, "허용되지 않은 요청 출처입니다.")


def admin(request: Request, db: Session = Depends(get_db)) -> int:
    entry = sessions.get(request.cookies.get(COOKIE, ""))
    if not entry or entry[2] <= time.time():
        raise ApiError(401, "로그인이 필요합니다.")
    user = db.get(User, entry[0])
    if not user or user.role != "ADMIN" or user.status != "ACTIVE":
        raise ApiError(403, "관리자 권한이 없습니다.")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        allowed_origin(request)
        if not secrets.compare_digest(request.headers.get("x-csrf-token", ""), entry[1]):
            raise ApiError(403, "요청 인증값이 유효하지 않습니다. 다시 로그인해 주세요.")
    return user.id


@router.post("/auth/login", response_model=SessionOut)
def login(body: LoginBody, request: Request, response: Response, db: Session = Depends(get_db)):
    allowed_origin(request)
    user = db.scalar(select(User).where(User.email == body.email.strip()))
    if not user or not check_password(body.password, user.password_hash):
        raise ApiError(401, "이메일 또는 비밀번호가 맞지 않습니다.")
    if user.role != "ADMIN" or user.status != "ACTIVE":
        raise ApiError(403, "관리자 계정만 로그인할 수 있습니다.")
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    old = request.cookies.get(COOKIE)
    sessions.pop(old, None)
    sessions[token] = (user.id, csrf, time.time() + 8 * 3600)
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", max_age=8*3600,
                        secure=request.url.scheme == "https", path="/api/ui")
    return {"name": user.name, "role": "admin", "csrfToken": csrf}


@router.get("/auth/session", response_model=SessionOut)
def session(request: Request, uid: int = Depends(admin), db: Session = Depends(get_db)):
    return {"name": db.get(User, uid).name, "role": "admin",
            "csrfToken": sessions[request.cookies[COOKIE]][1]}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, _: int = Depends(admin)):
    sessions.pop(request.cookies.get(COOKIE), None)
    response.delete_cookie(COOKIE, path="/api/ui")


def record(db, kind, native_id):
    return db.scalar(select(UiRecord).where(UiRecord.kind == kind, UiRecord.native_id == native_id))


def media(db, f, duration=None):
    if f is None:
        return None
    extra = record(db, "media", f.id)
    return {"id": str(f.id), "name": f.original_name, "size": f.size_bytes, "type": f.mime_type,
            "kind": f.file_type.lower(), **(extra.payload if extra else {}),
            **({"duration": duration} if duration is not None else {})}


def course_out(db, c):
    return {"id": str(c.id), "title": c.title, "summary": c.summary or "",
            "learningGoal": c.learning_goal or "", "categoryId": str(c.category_id),
            "level": c.level, "status": c.status, "thumbnail": media(db, c.thumbnail_file),
            "updatedAt": c.updated_at.isoformat() if c.updated_at else ""}


def resource_out(db, r):
    return {"id": str(r.id), "title": r.title, "resourceType": r.resource_type,
            "description": r.description or "", "file": media(db, r.file),
            "promptText": r.prompt_text or "", "categoryId": str(r.category_id) if r.category_id else "",
            "status": r.status}


def tag_out(t):
    return {"id": str(t.id), "name": t.name, "tagType": t.tag_type,
            "synonyms": [s.synonym for s in t.synonyms]}


def content_out(db, c, public=False):
    q = native.first_quiz(db, c.id)
    p = native.first_practice(db, c.id)
    subtitles = list(db.scalars(select(Subtitle).where(Subtitle.content_id == c.id).order_by(Subtitle.start_sec, Subtitle.id)))
    data = {"id": str(c.id), "courseId": str(c.course_id), "title": c.title,
            "learningGoal": c.learning_goal or "", "workUse": c.work_use or "",
            "video": media(db, c.video_file, c.duration_sec), "thumbnail": media(db, c.thumbnail_file),
            "practiceText": p.instruction if p else "", "practice": media(db, p.example_file) if p else None,
            "resource": None,
            "subtitles": [{"id": str(r.id), "startSec": float(r.start_sec), "endSec": float(r.end_sec), "text": r.caption_text} for r in subtitles],
            "updatedAt": c.updated_at.isoformat() if c.updated_at else ""}
    if public:
        data["resources"] = [{k: v for k, v in resource_out(db, r).items() if k not in {"status", "categoryId"}}
                             for r in c.resources if r.status == "PUBLISHED"]
    else:
        options = sorted(q.options, key=lambda x: x.option_no) if q else []
        data.update(status=c.status, sortOrder=c.sort_order, version=c.version,
            tagIds=[str(t.id) for t in c.tags], skillIds=[str(t.id) for t in c.skills],
            resourceIds=[str(r.id) for r in c.resources],
            optionFeedbacks=[{"feedback": o.feedback or "", "feedbackSource": o.feedback_source,
                             "rewatchSec": o.rewatch_sec} for o in options],
            practiceSettings={"title": p.title, "expectedResult": p.expected_result,
                "resultType": p.result_type, "tolerance": float(p.tolerance),
                "requiredFunction": p.required_function or "", "answerFormula": p.answer_formula or ""} if p else PracticeSettingsBody().model_dump(),
            quiz={"question": q.question if q else "", "options": [o.option_text for o in options],
                  "correctIndex": next((i for i, o in enumerate(options) if o.is_correct), -1),
                  "explanation": (q.explanation or "") if q else ""})
    return data


def get_id(db, model, value):
    try:
        obj = db.get(model, int(value))
    except (ValueError, TypeError):
        obj = None
    if obj is None and model is Content:
        alias = db.scalar(select(UiRecord).where(UiRecord.kind == "content", UiRecord.request_key == value))
        if alias and alias.native_id:
            obj = db.get(Content, alias.native_id)
    if obj is None:
        raise ApiError(404, "자료를 찾을 수 없습니다.")
    return obj


@router.get("/admin/courses", response_model=list[CourseOut])
def courses(db: Session = Depends(get_db), _: int = Depends(admin)):
    return [course_out(db, c) for c in db.scalars(select(Course).order_by(Course.id.desc()))]


@router.get("/admin/courses/{cid}", response_model=CourseOut)
def course(cid: str, db: Session = Depends(get_db), _: int = Depends(admin)):
    return course_out(db, get_id(db, Course, cid))


def duplicate(db, kind, uid, key):
    return db.scalar(select(UiRecord).where(UiRecord.kind == kind, UiRecord.owner_id == uid,
                                            UiRecord.request_key == key))


def save_course(body, db, uid, cid=None, key=None):
    if not body.title.strip():
        raise ApiError(422, "과정명을 입력해 주세요.")
    previous = duplicate(db, "course", uid, key or body.id) if cid is None else None
    if previous:
        return course_out(db, db.get(Course, previous.native_id))
    c = get_id(db, Course, cid) if cid else Course(created_by=uid, status="DRAFT")
    category = get_id(db, Category, body.categoryId)
    if body.status == "PUBLISHED":
        if not body.learningGoal.strip():
            raise ApiError(422, "공개할 과정의 학습 목표를 입력해 주세요.")
        if not c.id or not db.scalar(select(Content.id).where(Content.course_id == c.id, Content.status == "PUBLISHED").limit(1)):
            raise ApiError(422, "공개된 콘텐츠가 1개 이상 필요합니다.")
    thumbnail = reference(db, body.thumbnail, "THUMBNAIL")
    c.category_id, c.title = category.id, body.title.strip()
    c.summary, c.learning_goal = body.summary, body.learningGoal
    c.level, c.status, c.updated_at = body.level, body.status, datetime.now()
    c.thumbnail_file_id = thumbnail.id if thumbnail else None
    if c.status == "PUBLISHED":
        c.published_at = c.published_at or datetime.now()
    db.add(c)
    db.flush()
    r = record(db, "course", c.id)
    if not r:
        r = UiRecord(kind="course", owner_id=uid, request_key=key or body.id, native_id=c.id)
        db.add(r)
    r.payload = {}
    db.commit()
    db.refresh(c)
    return course_out(db, c)


@router.post("/admin/courses", status_code=201, response_model=CourseOut)
def create_course(body: CourseBody, db: Session = Depends(get_db), uid: int = Depends(admin),
                  key: str | None = Header(None, alias="Idempotency-Key", max_length=64)):
    return save_course(body, db, uid, key=key)


@router.patch("/admin/courses/{cid}", response_model=CourseOut)
def edit_course(cid: str, body: CourseBody, db: Session = Depends(get_db), uid: int = Depends(admin)):
    return save_course(body, db, uid, cid)


@router.get("/admin/contents", response_model=list[ContentOut])
def contents(db: Session = Depends(get_db), _: int = Depends(admin)):
    drafts = list(db.scalars(select(UiRecord).where(UiRecord.kind == "content", UiRecord.native_id.is_(None))))
    return [draft_out(r.payload) for r in drafts] + [content_out(db, c) for c in db.scalars(select(Content).order_by(Content.id.desc()))]


def draft_out(payload):
    """이전 버전 보조테이블 초안도 최신 화면에서 열 수 있도록 기본값을 채웁니다."""
    data = dict(payload)
    data.setdefault("learningGoal", data.get("objective", ""))
    if data.get("status") == "PRIVATE":
        data["status"] = "HIDDEN"
    value = ContentBody.model_validate(data).model_dump()
    value.update(version=data.get("version", 1), updatedAt=data.get("updatedAt", ""))
    for name in ("video", "thumbnail", "practice", "resource"):
        value[name] = data.get(name)
    if not value["optionFeedbacks"]:
        value["optionFeedbacks"] = [OptionFeedbackBody().model_dump() for _ in value["quiz"]["options"]]
    return value


@router.get("/admin/contents/{cid}", response_model=ContentOut)
def content(cid: str, db: Session = Depends(get_db), _: int = Depends(admin)):
    r = db.scalar(select(UiRecord).where(UiRecord.kind == "content", UiRecord.request_key == cid,
                                        UiRecord.native_id.is_(None)))
    if r:
        return draft_out(r.payload)
    return content_out(db, get_id(db, Content, cid))


def reference(db, ref, kind):
    f = get_id(db, StoredFile, ref.id) if ref else None
    if f and (f.file_type != kind or not (UPLOAD_DIR / f.stored_path).is_file()):
        raise ApiError(422, "파일 종류 또는 저장 상태를 확인해 주세요.")
    return f


def save_content(body, db, uid, cid=None, key=None):
    for row in body.subtitles:
        if row.endSec <= row.startSec or not row.text.strip():
            raise ApiError(422, "자막 시간과 내용을 확인해 주세요.")
        if any(abs(v * 100 - round(v * 100)) > 0.00001 for v in (row.startSec, row.endSec)):
            raise ApiError(422, "자막 시점은 소수점 둘째 자리까지 입력해 주세요.")
    tolerance = body.practiceSettings.tolerance
    if abs(tolerance * 10000 - round(tolerance * 10000)) > 0.0001:
        raise ApiError(422, "실습 허용 오차는 소수점 넷째 자리까지 입력해 주세요.")
    if body.practiceSettings.resultType == "NUMBER" and body.practiceSettings.expectedResult.strip():
        try:
            if not Decimal(body.practiceSettings.expectedResult).is_finite():
                raise InvalidOperation
        except InvalidOperation:
            raise ApiError(422, "숫자 정답 결과에는 유효한 숫자를 입력해 주세요.")
    if body.optionFeedbacks and len(body.optionFeedbacks) != len(body.quiz.options):
        raise ApiError(422, "보기와 보기별 피드백 개수를 맞춰 주세요.")
    tags = [get_id(db, Tag, value) for value in dict.fromkeys(body.tagIds)]
    skills = [get_id(db, Skill, value) for value in dict.fromkeys(body.skillIds)]
    resources = [get_id(db, Resource, value) for value in dict.fromkeys(body.resourceIds)]
    old = duplicate(db, "content", uid, key or body.id) if cid is None else None
    if old:
        return content_out(db, db.get(Content, old.native_id)) if old.native_id else draft_out(old.payload)
    pending = db.scalar(select(UiRecord).where(UiRecord.kind == "content", UiRecord.request_key == cid,
                                              UiRecord.native_id.is_(None))) if cid else None
    if not body.courseId:
        if cid and not pending:
            raise ApiError(422, "저장된 콘텐츠의 소속 과정을 선택해 주세요.")
        data = body.model_dump()
        if body.status == "PUBLISHED":
            raise ApiError(422, "과정을 선택하고 필수 항목을 입력한 뒤 공개해 주세요.")
        data.update(status=body.status, sortOrder=body.sortOrder, version=1, updatedAt=datetime.now().isoformat())
        # 화면이 보낸 파일 스냅샷을 실제 저장된 파일 메타데이터로 치환합니다.
        for name in ("video", "thumbnail", "practice", "resource"):
            data[name] = media(db, reference(db, getattr(body, name), name.upper()))
        r = pending or UiRecord(kind="content", owner_id=uid, request_key=key or body.id, native_id=None)
        r.payload = data
        db.add(r)
        db.commit()
        return data
    course = get_id(db, Course, body.courseId)
    c = get_id(db, Content, cid) if cid and not pending else Content(created_by=uid, status="DRAFT", sort_order=0, version=1)
    c.course_id, c.title, c.learning_goal = course.id, body.title.strip(), body.learningGoal
    c.work_use, c.sort_order = body.workUse, body.sortOrder
    # 공개는 별도 publish API로만 허용합니다. 검수·비공개·초안은 저장 가능합니다.
    if body.status != "PUBLISHED":
        c.status = body.status
    video = reference(db, body.video, "VIDEO")
    thumb = reference(db, body.thumbnail, "THUMBNAIL")
    practice = reference(db, body.practice, "PRACTICE")
    resource = reference(db, body.resource, "RESOURCE")
    if c.published_at and c.video_file_id != (video.id if video else None):
        c.version += 1
    c.video_file_id, c.thumbnail_file_id = video.id if video else None, thumb.id if thumb else None
    extra = record(db, "media", video.id) if video else None
    c.duration_sec = round(extra.payload.get("duration", 0)) if extra else None
    duration = extra.payload.get("duration") if extra else None
    if duration and (any(row.endSec > duration for row in body.subtitles) or
                     any(row.rewatchSec is not None and row.rewatchSec > duration for row in body.optionFeedbacks)):
        raise ApiError(422, "자막과 다시 볼 시점은 영상 길이 이내여야 합니다.")
    c.updated_at = datetime.now()
    db.add(c)
    db.flush()
    q = body.quiz
    if any(len(o) > 255 for o in q.options):
        raise ApiError(422, "퀴즈 보기는 255자 이하여야 합니다.")
    existing = native.first_quiz(db, c.id)
    by_no = {o.option_no: o for o in existing.options} if existing else {}
    native._save_quiz(db, c.id, QuizIn(question=q.question, explanation=q.explanation,
        options=[{"option_text": o, "correct": i == q.correctIndex,
                  "feedback": body.optionFeedbacks[i].feedback if body.optionFeedbacks else (by_no[i+1].feedback if i+1 in by_no else None),
                  "rewatch_sec": body.optionFeedbacks[i].rewatchSec if body.optionFeedbacks else (by_no[i+1].rewatch_sec if i+1 in by_no else None)}
                 for i, o in enumerate(q.options)]))
    # 피드백 작성 주체는 클라이언트 값 대신 서버에서 결정합니다.
    for option in native.first_quiz(db, c.id).options if native.first_quiz(db, c.id) else []:
        if not option.feedback:
            option.feedback_source = "NONE"
    settings = body.practiceSettings
    p = native.first_practice(db, c.id)
    if body.practiceText or practice or settings != PracticeSettingsBody():
        if p is None:
            p = Practice(content_id=c.id)
            db.add(p)
        p.title, p.instruction = settings.title, body.practiceText
        p.example_file_id = practice.id if practice else None
        p.expected_result, p.result_type, p.tolerance = settings.expectedResult, settings.resultType, settings.tolerance
        p.required_function, p.answer_formula = settings.requiredFunction or None, settings.answerFormula or None
    elif p:
        db.delete(p)
    if resource and not any(r.file_id == resource.id for r in resources):
        r = Resource(title=resource.original_name[:100], resource_type="TEMPLATE", file_id=resource.id,
                     created_by=uid, status="DRAFT")
        db.add(r)
        resources.append(r)
    c.tags, c.skills, c.resources = tags, skills, resources
    native._save_subtitles(db, c.id, [native.SubtitleIO(start_sec=r.startSec, end_sec=r.endSec, text=r.text) for r in body.subtitles])
    db.flush()
    db.expire(c)
    if c.status == "PUBLISHED":
        issues = native.check_publishable(db, c)
        if issues:
            raise ApiError(422, "공개 중인 콘텐츠의 필수 항목을 확인해 주세요.", issues)
    if pending:
        pending.native_id, pending.payload = c.id, {}
    elif cid is None:
        db.add(UiRecord(kind="content", owner_id=uid, request_key=key or body.id, native_id=c.id, payload={}))
    db.commit()
    db.refresh(c)
    return content_out(db, c)


@router.post("/admin/contents", status_code=201, response_model=ContentOut)
def create_content(body: ContentBody, db: Session = Depends(get_db), uid: int = Depends(admin),
                   key: str | None = Header(None, alias="Idempotency-Key", max_length=64)):
    return save_content(body, db, uid, key=key)


@router.patch("/admin/contents/{cid}", response_model=ContentOut)
def edit_content(cid: str, body: ContentBody, db: Session = Depends(get_db), uid: int = Depends(admin)):
    return save_content(body, db, uid, cid)


@router.post("/admin/contents/{cid}/publish", response_model=ContentOut)
def publish(cid: str, db: Session = Depends(get_db), uid: int = Depends(admin)):
    if db.scalar(select(UiRecord).where(UiRecord.kind == "content", UiRecord.request_key == cid,
                                        UiRecord.native_id.is_(None))):
        raise ApiError(422, "소속 과정과 필수 항목을 입력한 뒤 공개해 주세요.")
    c = get_id(db, Content, cid)
    if not c.video_file or not (UPLOAD_DIR / c.video_file.stored_path).is_file():
        raise ApiError(422, "실제 영상 파일을 먼저 업로드해 주세요.")
    if not c.course.learning_goal:
        raise ApiError(422, "소속 과정의 학습 목표를 먼저 입력해 주세요.")
    native.publish(c.id, db, uid)
    return content_out(db, c)


@router.post("/admin/contents/{cid}/unpublish", response_model=ContentOut)
def unpublish(cid: str, db: Session = Depends(get_db), uid: int = Depends(admin)):
    c = get_id(db, Content, cid)
    native.hide(c.id, db, uid)
    return content_out(db, c)


@router.post("/admin/media", status_code=201, response_model=MediaOut)
def upload(file: UploadFile = File(...), kind: Literal["video", "thumbnail", "practice", "resource"] = Form(...), db: Session = Depends(get_db),
           uid: int = Depends(admin)):
    out = files.upload(file, kind.upper(), uid, db)
    f = db.get(StoredFile, out.id)
    if kind == "video":
        # 실제 MP4에서 길이를 읽어 브라우저가 보낸 재생 시간을 신뢰하지 않습니다.
        from .mp4 import duration_seconds
        try:
            duration = duration_seconds(UPLOAD_DIR / f.stored_path)
            if duration <= 0:
                raise ValueError("empty duration")
        except Exception:
            (UPLOAD_DIR / f.stored_path).unlink(missing_ok=True)
            db.delete(f)
            db.commit()
            raise ApiError(422, "유효한 MP4 영상을 분석할 수 없습니다. 다른 영상을 선택해 주세요.")
        db.add(UiRecord(kind="media", owner_id=uid, request_key=str(f.id), native_id=f.id,
                        payload={"duration": duration}))
        db.commit()
    return media(db, f)


@router.get("/admin/media/{mid}/file")
def admin_file(mid: str, request: Request, db: Session = Depends(get_db), _: int = Depends(admin)):
    f = get_id(db, StoredFile, mid)
    return files.serve(f.stored_path, request)


def public_contents(db):
    return list(db.scalars(select(Content).join(Course).where(Content.status == "PUBLISHED",
                                                            Course.status == "PUBLISHED").order_by(Content.sort_order, Content.id)))


@router.get("/courses", response_model=list[CourseOut])
def public_courses(db: Session = Depends(get_db)):
    ids = {c.course_id for c in public_contents(db)}
    return [course_out(db, c) for c in db.scalars(select(Course).where(Course.id.in_(ids)))]


@router.get("/courses/{cid}", response_model=CourseOut)
def public_course(cid: str, db: Session = Depends(get_db)):
    if not any(str(c.course_id) == cid for c in public_contents(db)):
        raise ApiError(404, "공개된 과정이 없습니다.")
    return course_out(db, get_id(db, Course, cid))


@router.get("/contents", response_model=list[PublicContentOut])
def public_list(courseId: str | None = None, db: Session = Depends(get_db)):
    return [content_out(db, c, True) for c in public_contents(db) if not courseId or str(c.course_id) == courseId]


@router.get("/contents/{cid}", response_model=PublicContentOut)
def public_detail(cid: str, db: Session = Depends(get_db)):
    c = next((c for c in public_contents(db) if str(c.id) == cid), None)
    if not c:
        raise ApiError(404, "공개된 콘텐츠가 없습니다.")
    return content_out(db, c, True)


@router.get("/media/{mid}/file")
def public_file(mid: str, request: Request, db: Session = Depends(get_db)):
    visible = [c for c in public_contents(db) if any(
        m and m["id"] == mid for m in (content_out(db, c, True)[k] for k in ("video", "thumbnail", "practice", "resource"))) or any(r.status == "PUBLISHED" and str(r.file_id) == mid for r in c.resources)]
    if not visible:
        raise ApiError(404, "공개된 파일이 없습니다.")
    return files.serve(get_id(db, StoredFile, mid).stored_path, request)


class TagBody(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=50)
    tagType: Literal["SITUATION", "ERROR", "FUNCTION", "TOOL"]
    synonyms: list[str] = Field(default_factory=list)


class ResourceBody(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=100)
    resourceType: Literal["TEMPLATE", "EXAMPLE_DOC", "PROMPT"]
    description: str = Field(default="", max_length=500)
    file: MediaRef | None = None
    promptText: str = ""
    categoryId: str = ""
    status: Literal["DRAFT", "PUBLISHED", "HIDDEN"] = "DRAFT"


@router.get("/admin/catalog", response_model=CatalogOut)
def catalog(db: Session = Depends(get_db), _: int = Depends(admin)):
    return {"tags": [tag_out(t) for t in db.scalars(select(Tag).order_by(Tag.id))],
            "resources": [resource_out(db, r) for r in db.scalars(select(Resource).order_by(Resource.id))]}


def catalog_record(db, model, kind, value, uid):
    if value.isdecimal():
        return get_id(db, model, value)
    previous = duplicate(db, kind, uid, value)
    return db.get(model, previous.native_id) if previous else None


def remember_catalog(db, kind, uid, key, obj):
    db.flush()
    if not key.isdecimal() and not duplicate(db, kind, uid, key):
        db.add(UiRecord(kind=kind, owner_id=uid, request_key=key, native_id=obj.id, payload={}))


@router.post("/admin/tags", response_model=TagOut)
def save_tag(body: TagBody, db: Session = Depends(get_db), uid: int = Depends(admin)):
    tag = catalog_record(db, Tag, "tag", body.id, uid)
    name = body.name.strip()
    synonyms = [s.strip() for s in body.synonyms if s.strip()]
    if not name or any(len(s) > 50 for s in synonyms):
        raise ApiError(422, "태그와 동의어는 1~50자로 입력해 주세요.")
    if len({s.casefold() for s in synonyms}) != len(synonyms):
        raise ApiError(422, "동의어가 중복됩니다.")
    for other in db.scalars(select(Tag)):
        if tag and other.id == tag.id:
            continue
        if other.name.casefold() == name.casefold():
            raise ApiError(409, "이미 등록된 태그 이름입니다.")
        if {s.synonym.casefold() for s in other.synonyms} & {s.casefold() for s in synonyms}:
            raise ApiError(409, "다른 태그에 등록된 동의어입니다.")
    if tag is None:
        tag = Tag()
        db.add(tag)
    tag.name, tag.tag_type = name, body.tagType
    # UNIQUE 동의어 제약과 충돌하지 않도록 기존 행을 먼저 삭제합니다.
    tag.synonyms.clear()
    db.flush()
    tag.synonyms = [TagSynonym(synonym=s) for s in synonyms]
    remember_catalog(db, "tag", uid, body.id, tag)
    db.commit()
    return tag_out(tag)


@router.post("/admin/resources", response_model=ResourceOut)
def save_resource(body: ResourceBody, db: Session = Depends(get_db), uid: int = Depends(admin)):
    if not body.title.strip():
        raise ApiError(422, "자료 제목을 입력해 주세요.")
    f = reference(db, body.file, "RESOURCE") if body.resourceType != "PROMPT" else None
    if body.resourceType == "PROMPT" and not body.promptText.strip():
        raise ApiError(422, "프롬프트 본문을 입력해 주세요.")
    if body.resourceType != "PROMPT" and not f:
        raise ApiError(422, "자료 파일을 선택해 주세요.")
    category = get_id(db, Category, body.categoryId) if body.categoryId else None
    r = catalog_record(db, Resource, "resource", body.id, uid)
    if r is None:
        r = Resource(created_by=uid, download_count=0)
        db.add(r)
    r.title, r.resource_type, r.description = body.title.strip(), body.resourceType, body.description
    r.file_id, r.prompt_text = (f.id if f else None), (body.promptText if body.resourceType == "PROMPT" else None)
    r.category_id, r.status = (category.id if category else None), body.status
    remember_catalog(db, "resource", uid, body.id, r)
    db.commit()
    return resource_out(db, r)
