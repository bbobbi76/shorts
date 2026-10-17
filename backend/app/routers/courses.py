"""과정 관리: 생성·수정·공개·콘텐츠 순서"""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..errors import ApiError
from ..files import require_file
from ..models import AdminLog, Category, Content, Course
from ..schemas import ContentOrderIn, ContentSummary, CourseIn, CourseOut, FileOut, StatusIn

router = APIRouter(prefix="/api/admin/courses", tags=["과정"])


def find_course(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise ApiError.not_found("과정")
    return course


def course_contents(db: Session, course_id: int) -> list[Content]:
    stmt = select(Content).where(Content.course_id == course_id).order_by(Content.sort_order, Content.id)
    return list(db.scalars(stmt).all())


def to_out(db: Session, c: Course) -> CourseOut:
    contents = course_contents(db, c.id)
    return CourseOut(
        id=c.id, category_id=c.category_id, category_name=c.category.name, title=c.title, summary=c.summary,
        learning_goal=c.learning_goal, level=c.level, status=c.status, thumbnail=FileOut.of(c.thumbnail_file),
        content_count=len(contents),
        published_content_count=sum(1 for x in contents if x.status == "PUBLISHED"),
        total_duration_sec=sum(x.duration_sec or 0 for x in contents),
        created_at=c.created_at, published_at=c.published_at,
    )


def _apply(db: Session, course: Course, body: CourseIn) -> None:
    if db.get(Category, body.category_id) is None:
        raise ApiError.not_found("분야")
    if not body.title.strip():
        raise ApiError.bad_request("과정명을 입력해 주세요.")
    course.category_id = body.category_id
    course.title = body.title.strip()
    course.summary = body.summary
    course.learning_goal = body.learning_goal
    course.level = body.level or "BASIC"
    if course.thumbnail_file_id != body.thumbnail_file_id:
        require_file(db, body.thumbnail_file_id, "THUMBNAIL")
        course.thumbnail_file_id = body.thumbnail_file_id


@router.get("", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db), _: int = Depends(require_admin)):
    courses = db.scalars(select(Course).order_by(Course.id.desc())).all()
    return [to_out(db, c) for c in courses]


@router.get("/{course_id}", response_model=CourseOut)
def get_course(course_id: int, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    return to_out(db, find_course(db, course_id))


@router.post("", response_model=CourseOut, status_code=201)
def create_course(body: CourseIn, db: Session = Depends(get_db), admin_id: int = Depends(require_admin)):
    course = Course(created_by=admin_id, status="DRAFT")
    _apply(db, course, body)
    db.add(course)
    db.commit()
    return to_out(db, course)


@router.put("/{course_id}", response_model=CourseOut)
def update_course(course_id: int, body: CourseIn, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    course = find_course(db, course_id)
    _apply(db, course, body)
    db.commit()
    return to_out(db, course)


@router.patch("/{course_id}/status", response_model=CourseOut)
def change_status(course_id: int, body: StatusIn, db: Session = Depends(get_db),
                  admin_id: int = Depends(require_admin)):
    """과정 공개: 학습 목표가 있고 공개된 콘텐츠가 1개 이상일 때만 가능"""
    if body.status not in ("DRAFT", "PUBLISHED", "HIDDEN"):
        raise ApiError.bad_request(f"알 수 없는 상태값입니다: {body.status}")
    course = find_course(db, course_id)
    if body.status == "PUBLISHED":
        missing = []
        if not (course.learning_goal or "").strip():
            missing.append("과정의 학습 목표를 입력해 주세요.")
        if not any(c.status == "PUBLISHED" for c in course_contents(db, course_id)):
            missing.append("공개된 콘텐츠가 1개 이상 있어야 합니다.")
        if missing:
            raise ApiError(422, "과정을 공개할 수 없습니다.", missing)
        if course.published_at is None:
            course.published_at = datetime.now()
    course.status = body.status
    db.add(AdminLog(admin_id=admin_id, action=f"COURSE_{body.status}", target_type="COURSE", target_id=course_id))
    db.commit()
    return to_out(db, course)


@router.get("/{course_id}/contents", response_model=list[ContentSummary])
def list_contents(course_id: int, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    find_course(db, course_id)
    return [ContentSummary.of(c) for c in course_contents(db, course_id)]


@router.put("/{course_id}/contents/order", response_model=list[ContentSummary])
def reorder(course_id: int, body: ContentOrderIn, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    """화면에서 바꾼 순서대로 sort_order를 1부터 다시 매깁니다."""
    contents = {c.id: c for c in course_contents(db, course_id)}
    if len(body.content_ids) != len(contents) or set(body.content_ids) != set(contents):
        raise ApiError.bad_request("과정에 속한 콘텐츠 전체의 순서를 보내 주세요.")
    for i, cid in enumerate(body.content_ids, start=1):
        contents[cid].sort_order = i
    db.commit()
    return [ContentSummary.of(contents[cid]) for cid in body.content_ids]
