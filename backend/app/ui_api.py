"""서빈 React 화면과 기존 WorkFit 테이블을 연결하는 호환 API.

기존 /api/admin API는 유지하고 /api/ui 아래에 프론트 계약을 제공합니다.
UiRecord는 UUID 중복 방지와 기존 DB에 없는 화면 메타데이터를 보관합니다.
"""
import secrets
import time
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import JSON, String, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .auth import check_password
from .config import FRONTEND_ORIGIN, UPLOAD_DIR
from .database import Base, get_db
from .errors import ApiError
from .models import Category, Content, Course, Practice, Resource, StoredFile, User
from .routers import contents as native
from .schemas import QuizIn
from . import files


class UiRecord(Base):
    __tablename__ = "ui_records"
    __table_args__ = (UniqueConstraint("kind", "owner_id", "request_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    owner_id: Mapped[int]
    request_key: Mapped[str] = mapped_column(String(64))
    native_id: Mapped[int | None]
    payload: Mapped[dict] = mapped_column(JSON)


class CourseBody(BaseModel):
    id: str = Field(max_length=64)
    title: str = Field(max_length=100)
    description: str = Field(default="", max_length=500)
    objective: str = Field(default="", max_length=500)
    job: str = Field(default="공통 실무", max_length=50)
    topic: str = Field(default="엑셀", max_length=50)
    level: Literal["기초", "응용"] = "기초"


class MediaRef(BaseModel):
    id: str


class QuizBody(BaseModel):
    question: str = Field(default="", max_length=500)
    options: list[str] = Field(default_factory=list, max_length=6)
    correctIndex: int = -1
    explanation: str = ""


class ContentBody(BaseModel):
    id: str = Field(max_length=64)
    courseId: str = ""
    title: str = Field(default="", max_length=100)
    objective: str = Field(default="", max_length=500)
    status: str = "DRAFT"
    video: MediaRef | None = None
    thumbnail: MediaRef | None = None
    quiz: QuizBody = Field(default_factory=QuizBody)
    practiceText: str = ""
    practice: MediaRef | None = None
    resource: MediaRef | None = None


router = APIRouter(prefix="/api/ui", tags=["React 연동"])
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


@router.post("/auth/login")
def login(body: dict, request: Request, response: Response, db: Session = Depends(get_db)):
    allowed_origin(request)
    user = db.scalar(select(User).where(User.email == str(body.get("email", "")).strip()))
    if not user or not check_password(str(body.get("password", "")), user.password_hash):
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


@router.get("/auth/session")
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
    extra = record(db, "course", c.id)
    return {"id": str(c.id), "title": c.title, "description": c.summary or "",
            "objective": c.learning_goal or "", "topic": c.category.name,
            "job": "공통 실무" if c.category.category_type == "COMMON" else c.category.name,
            "level": "응용" if c.level == "ADVANCED" else "기초",
            "updatedAt": c.updated_at.isoformat() if c.updated_at else "",
            **(extra.payload if extra else {})}


def content_out(db, c, public=False):
    q = native.first_quiz(db, c.id)
    p = native.first_practice(db, c.id)
    data = {"id": str(c.id), "courseId": str(c.course_id), "title": c.title,
            "objective": c.learning_goal or "", "video": media(db, c.video_file, c.duration_sec),
            "thumbnail": media(db, c.thumbnail_file), "practiceText": p.instruction if p else "",
            "practice": media(db, p.example_file) if p else None,
            "resource": media(db, c.resources[0].file) if c.resources else None,
            "updatedAt": c.updated_at.isoformat() if c.updated_at else ""}
    if not public:
        options = sorted(q.options, key=lambda x: x.option_no) if q else []
        data.update(status={"HIDDEN": "PRIVATE", "REVIEW": "DRAFT"}.get(c.status, c.status),
                    quiz={"question": q.question if q else "", "options": [o.option_text for o in options],
                          "correctIndex": next((i for i, o in enumerate(options) if o.is_correct), -1),
                          "explanation": q.explanation or "" if q else ""})
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


@router.get("/admin/courses")
def courses(db: Session = Depends(get_db), _: int = Depends(admin)):
    return [course_out(db, c) for c in db.scalars(select(Course).order_by(Course.id.desc()))]


@router.get("/admin/courses/{cid}")
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
    if c.status == "PUBLISHED" and not body.objective.strip():
        raise ApiError(422, "공개된 과정의 학습 목표는 비울 수 없습니다.")
    category = db.scalar(select(Category).where(Category.name == body.topic))
    if category is None:
        raise ApiError(422, "등록된 교육 분야를 주제로 입력해 주세요.", ["예: 엑셀, 문서 작성, AI 업무 활용"])
    c.category_id, c.title = category.id, body.title.strip()
    c.summary, c.learning_goal = body.description, body.objective
    c.level, c.updated_at = ("ADVANCED" if body.level == "응용" else "BASIC"), datetime.now()
    db.add(c)
    db.flush()
    r = record(db, "course", c.id)
    if not r:
        r = UiRecord(kind="course", owner_id=uid, request_key=key or body.id, native_id=c.id)
        db.add(r)
    r.payload = {"job": body.job, "topic": body.topic}
    db.commit()
    db.refresh(c)
    return course_out(db, c)


@router.post("/admin/courses", status_code=201)
def create_course(body: CourseBody, db: Session = Depends(get_db), uid: int = Depends(admin),
                  key: str | None = Header(None, alias="Idempotency-Key", max_length=64)):
    return save_course(body, db, uid, key=key)


@router.patch("/admin/courses/{cid}")
def edit_course(cid: str, body: CourseBody, db: Session = Depends(get_db), uid: int = Depends(admin)):
    return save_course(body, db, uid, cid)


@router.get("/admin/contents")
def contents(db: Session = Depends(get_db), _: int = Depends(admin)):
    drafts = list(db.scalars(select(UiRecord).where(UiRecord.kind == "content", UiRecord.native_id.is_(None))))
    return [r.payload for r in drafts] + [content_out(db, c) for c in db.scalars(select(Content).order_by(Content.id.desc()))]


@router.get("/admin/contents/{cid}")
def content(cid: str, db: Session = Depends(get_db), _: int = Depends(admin)):
    r = db.scalar(select(UiRecord).where(UiRecord.kind == "content", UiRecord.request_key == cid,
                                        UiRecord.native_id.is_(None)))
    if r:
        return r.payload
    return content_out(db, get_id(db, Content, cid))


def reference(db, ref, kind):
    f = get_id(db, StoredFile, ref.id) if ref else None
    if f and (f.file_type != kind or not (UPLOAD_DIR / f.stored_path).is_file()):
        raise ApiError(422, "파일 종류 또는 저장 상태를 확인해 주세요.")
    return f


def save_content(body, db, uid, cid=None, key=None):
    old = duplicate(db, "content", uid, key or body.id) if cid is None else None
    if old:
        return content_out(db, db.get(Content, old.native_id)) if old.native_id else old.payload
    pending = db.scalar(select(UiRecord).where(UiRecord.kind == "content", UiRecord.request_key == cid,
                                              UiRecord.native_id.is_(None))) if cid else None
    if not body.courseId:
        if cid and not pending:
            raise ApiError(422, "저장된 콘텐츠의 소속 과정을 선택해 주세요.")
        data = body.model_dump()
        data.update(status="DRAFT", updatedAt=datetime.now().isoformat())
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
    c.course_id, c.title, c.learning_goal = course.id, body.title.strip(), body.objective
    video = reference(db, body.video, "VIDEO")
    thumb = reference(db, body.thumbnail, "THUMBNAIL")
    practice = reference(db, body.practice, "PRACTICE")
    resource = reference(db, body.resource, "RESOURCE")
    if c.published_at and c.video_file_id != (video.id if video else None):
        c.version += 1
    c.video_file_id, c.thumbnail_file_id = video.id if video else None, thumb.id if thumb else None
    extra = record(db, "media", video.id) if video else None
    c.duration_sec = round(extra.payload.get("duration", 0)) if extra else None
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
                                "feedback": by_no[i+1].feedback if i+1 in by_no else None,
                                "rewatch_sec": by_no[i+1].rewatch_sec if i+1 in by_no else None}
                               for i, o in enumerate(q.options)]))
    p = native.first_practice(db, c.id)
    if body.practiceText or practice:
        if p is None:
            p = Practice(content_id=c.id, title="선택 실습", expected_result="")
            db.add(p)
        p.instruction, p.example_file_id = body.practiceText, practice.id if practice else None
    elif p:
        db.delete(p)
    # 화면이 표현하지 못하는 기존 자료·태그·자막·보기별 피드백은 유지합니다.
    other_resources = list(c.resources[1:])
    if resource:
        r = next((r for r in c.resources if r.file_id == resource.id), None)
        if r is None:
            r = Resource(title=resource.original_name[:100], resource_type="TEMPLATE", file_id=resource.id,
                         created_by=uid, status="DRAFT")
            db.add(r)
        c.resources = [r] + [other for other in other_resources if other is not r]
    else:
        c.resources = other_resources
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


@router.post("/admin/contents", status_code=201)
def create_content(body: ContentBody, db: Session = Depends(get_db), uid: int = Depends(admin),
                   key: str | None = Header(None, alias="Idempotency-Key", max_length=64)):
    return save_content(body, db, uid, key=key)


@router.patch("/admin/contents/{cid}")
def edit_content(cid: str, body: ContentBody, db: Session = Depends(get_db), uid: int = Depends(admin)):
    return save_content(body, db, uid, cid)


@router.post("/admin/contents/{cid}/publish")
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
    # 이 프론트에는 별도 과정 공개 버튼이 없어 콘텐츠 공개와 함께 과정도 공개합니다.
    c.course.status, c.course.published_at = "PUBLISHED", c.course.published_at or datetime.now()
    db.commit()
    return content_out(db, c)


@router.post("/admin/contents/{cid}/unpublish")
def unpublish(cid: str, db: Session = Depends(get_db), uid: int = Depends(admin)):
    c = get_id(db, Content, cid)
    native.hide(c.id, db, uid)
    return content_out(db, c)


@router.post("/admin/media", status_code=201)
def upload(file: UploadFile = File(...), kind: str = Form(...), db: Session = Depends(get_db),
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
                                                            Course.status == "PUBLISHED")))


@router.get("/courses")
def public_courses(db: Session = Depends(get_db)):
    ids = {c.course_id for c in public_contents(db)}
    return [course_out(db, c) for c in db.scalars(select(Course).where(Course.id.in_(ids)))]


@router.get("/courses/{cid}")
def public_course(cid: str, db: Session = Depends(get_db)):
    if not any(str(c.course_id) == cid for c in public_contents(db)):
        raise ApiError(404, "공개된 과정이 없습니다.")
    return course_out(db, get_id(db, Course, cid))


@router.get("/contents")
def public_list(courseId: str | None = None, db: Session = Depends(get_db)):
    return [content_out(db, c, True) for c in public_contents(db) if not courseId or str(c.course_id) == courseId]


@router.get("/contents/{cid}")
def public_detail(cid: str, db: Session = Depends(get_db)):
    c = next((c for c in public_contents(db) if str(c.id) == cid), None)
    if not c:
        raise ApiError(404, "공개된 콘텐츠가 없습니다.")
    return content_out(db, c, True)


@router.get("/media/{mid}/file")
def public_file(mid: str, request: Request, db: Session = Depends(get_db)):
    visible = [c for c in public_contents(db) if any(
        m and m["id"] == mid for m in (content_out(db, c, True)[k] for k in ("video", "thumbnail", "practice", "resource")))]
    if not visible:
        raise ApiError(404, "공개된 파일이 없습니다.")
    return files.serve(get_id(db, StoredFile, mid).stored_path, request)
