"""관리자 콘텐츠 등록의 핵심.

흐름: 콘텐츠 생성(DRAFT) → 임시저장 반복 → 공개 요청 시 공개 조건 검사 → PUBLISHED
"""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..errors import ApiError
from ..files import require_file
from ..models import AdminLog, Content, Practice, Quiz, QuizOption, Resource, Skill, Subtitle, Tag
from ..schemas import (
    ContentCreateIn, ContentDetail, ContentSaveIn, FileOut, OptionOut, PracticeIn, PracticeOut, QuizIn, QuizOut,
    SubtitleIO,
)
from .courses import find_course

router = APIRouter(prefix="/api/admin/contents", tags=["콘텐츠"])

MAX_OPTIONS = 6


def _blank(s: str | None) -> bool:
    return s is None or not s.strip()


def _nvl(s: str | None) -> str:
    return "" if s is None else s.strip()


def find_content(db: Session, content_id: int) -> Content:
    content = db.get(Content, content_id)
    if content is None:
        raise ApiError.not_found("콘텐츠")
    return content


def first_quiz(db: Session, content_id: int) -> Quiz | None:
    return db.scalar(select(Quiz).where(Quiz.content_id == content_id).order_by(Quiz.id).limit(1))


def first_practice(db: Session, content_id: int) -> Practice | None:
    return db.scalar(select(Practice).where(Practice.content_id == content_id).order_by(Practice.id).limit(1))


def check_publishable(db: Session, content: Content) -> list[str]:
    """공개 조건 (DB 명세서 8-1). 빈 목록이면 공개 가능"""
    missing: list[str] = []
    if _blank(content.title):
        missing.append("콘텐츠 제목을 입력해 주세요.")
    if content.video_file_id is None:
        missing.append("숏폼 영상을 업로드해 주세요.")
    elif not content.duration_sec or content.duration_sec <= 0:
        missing.append("영상 길이를 읽지 못했습니다. 영상을 다시 업로드해 주세요.")
    quiz = first_quiz(db, content.id)
    if quiz is None or _blank(quiz.question):
        missing.append("퀴즈 문제를 입력해 주세요.")
    else:
        filled = [o for o in quiz.options if not _blank(o.option_text)]
        correct = [o for o in quiz.options if o.is_correct]
        if len(filled) < 2:
            missing.append("퀴즈 보기를 2개 이상 입력해 주세요.")
        if len(filled) != len(quiz.options):
            missing.append("빈 퀴즈 보기를 채우거나 삭제해 주세요.")
        if len(correct) != 1:
            missing.append("퀴즈 정답을 정확히 1개 선택해 주세요.")
        if _blank(quiz.explanation):
            missing.append("퀴즈 해설을 입력해 주세요.")
    return missing


def to_detail(db: Session, c: Content) -> ContentDetail:
    quiz = first_quiz(db, c.id)
    practice = first_practice(db, c.id)
    subtitles = db.scalars(select(Subtitle).where(Subtitle.content_id == c.id).order_by(Subtitle.start_sec)).all()
    return ContentDetail(
        id=c.id, course_id=c.course_id, course_title=c.course.title, title=c.title,
        learning_goal=c.learning_goal, work_use=c.work_use,
        video=FileOut.of(c.video_file), thumbnail=FileOut.of(c.thumbnail_file),
        duration_sec=c.duration_sec, aspect_ratio=c.aspect_ratio, sort_order=c.sort_order, version=c.version,
        status=c.status, published_at=c.published_at, updated_at=c.updated_at,
        quiz=None if quiz is None else QuizOut(
            id=quiz.id, question=quiz.question, explanation=quiz.explanation,
            options=[OptionOut(id=o.id, option_no=o.option_no, option_text=o.option_text, correct=o.is_correct,
                               feedback=o.feedback, feedback_source=o.feedback_source, rewatch_sec=o.rewatch_sec)
                     for o in sorted(quiz.options, key=lambda o: o.option_no)],
        ),
        practice=None if practice is None else PracticeOut(
            id=practice.id, title=practice.title, instruction=practice.instruction,
            example_file=FileOut.of(practice.example_file), expected_result=practice.expected_result,
            result_type=practice.result_type, tolerance=float(practice.tolerance or 0),
            required_function=practice.required_function, answer_formula=practice.answer_formula,
        ),
        tag_ids=[t.id for t in c.tags],
        skill_ids=[s.id for s in c.skills],
        resource_ids=[r.id for r in c.resources],
        subtitles=[SubtitleIO(start_sec=float(s.start_sec), end_sec=float(s.end_sec), text=s.caption_text)
                   for s in subtitles],
    )


def _save_quiz(db: Session, content_id: int, data: QuizIn | None) -> None:
    quiz = first_quiz(db, content_id)
    empty = data is None or (_blank(data.question) and _blank(data.explanation) and not data.options)
    if empty:
        if quiz is not None:
            db.delete(quiz)
        return
    assert data is not None
    if quiz is None:
        quiz = Quiz(content_id=content_id, question="")
        db.add(quiz)
    quiz.question = _nvl(data.question)
    quiz.explanation = data.explanation

    inputs = data.options or []
    if len(inputs) > MAX_OPTIONS:
        raise ApiError.bad_request(f"보기는 최대 {MAX_OPTIONS}개까지 입력할 수 있습니다.")
    # 보기는 번호(option_no) 기준으로 덮어씁니다. 지웠다 다시 넣으면 UNIQUE(quiz_id, option_no)와 충돌하기 때문입니다.
    by_no = {o.option_no: o for o in quiz.options}
    for no, opt in list(by_no.items()):
        if no > len(inputs):
            quiz.options.remove(opt)
    db.flush()  # 남는 보기를 먼저 지워 둡니다.
    for i, item in enumerate(inputs, start=1):
        option = by_no.get(i)
        if option is None:
            option = QuizOption(option_no=i, option_text="", is_correct=False, feedback_source="NONE")
            quiz.options.append(option)
        option.option_text = _nvl(item.option_text)
        option.is_correct = bool(item.correct)
        feedback = None if _blank(item.feedback) else (item.feedback or "").strip()
        if feedback != option.feedback:
            option.feedback = feedback
            option.feedback_source = "NONE" if feedback is None else "ADMIN"
        option.rewatch_sec = item.rewatch_sec


def _save_practice(db: Session, content_id: int, data: PracticeIn | None) -> None:
    practice = first_practice(db, content_id)
    empty = data is None or (_blank(data.title) and _blank(data.instruction) and _blank(data.expected_result))
    if empty:
        if practice is not None:
            db.delete(practice)
        return
    assert data is not None
    if practice is None:
        practice = Practice(content_id=content_id)
        db.add(practice)
    practice.title = _nvl(data.title)
    practice.instruction = _nvl(data.instruction)
    practice.expected_result = _nvl(data.expected_result)
    practice.result_type = data.result_type or "NUMBER"
    practice.tolerance = Decimal(str(data.tolerance or 0))
    practice.required_function = None if _blank(data.required_function) else _nvl(data.required_function).upper()
    practice.answer_formula = data.answer_formula
    if practice.example_file_id != data.example_file_id:
        require_file(db, data.example_file_id, "PRACTICE")
        practice.example_file_id = data.example_file_id


def _save_subtitles(db: Session, content_id: int, rows: list[SubtitleIO] | None) -> None:
    db.execute(delete(Subtitle).where(Subtitle.content_id == content_id))
    for row in rows or []:
        if row is None or _blank(row.text) or row.start_sec is None or row.end_sec is None:
            continue
        if row.end_sec <= row.start_sec:
            raise ApiError.bad_request(f'자막 끝 시간은 시작 시간보다 커야 합니다: "{row.text}"')
        db.add(Subtitle(content_id=content_id, start_sec=Decimal(str(row.start_sec)),
                        end_sec=Decimal(str(row.end_sec)), caption_text=_nvl(row.text)[:500]))


# ---------------------------------------------------------------------------

@router.post("", response_model=ContentDetail, status_code=201)
def create(body: ContentCreateIn, db: Session = Depends(get_db), admin_id: int = Depends(require_admin)):
    """제목만으로 빈 콘텐츠(DRAFT)를 만들고, 과정의 맨 뒤 순서에 붙입니다."""
    course = find_course(db, body.course_id)
    if _blank(body.title):
        raise ApiError.bad_request("콘텐츠 제목을 입력해 주세요.")
    last = db.scalar(select(func.max(Content.sort_order)).where(Content.course_id == course.id)) or 0
    content = Content(course_id=course.id, title=body.title.strip(), created_by=admin_id,
                      sort_order=last + 1, version=1, status="DRAFT")
    db.add(content)
    db.commit()
    return to_detail(db, content)


@router.get("/{content_id}", response_model=ContentDetail)
def get(content_id: int, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    return to_detail(db, find_content(db, content_id))


@router.put("/{content_id}", response_model=ContentDetail)
def save(content_id: int, body: ContentSaveIn, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    """임시저장 (영상·퀴즈·실습·자료·태그·자막·스킬을 한 번에 저장)"""
    content = find_content(db, content_id)
    if _blank(body.title):
        raise ApiError.bad_request("콘텐츠 제목을 입력해 주세요.")
    try:
        content.title = body.title.strip()
        content.learning_goal = body.learning_goal
        content.work_use = body.work_use
        if body.sort_order is not None:
            content.sort_order = body.sort_order

        # 공개 이력이 있는 콘텐츠의 영상을 바꾸면 버전을 올려 학습 기록과 구분합니다.
        if content.video_file_id != body.video_file_id:
            require_file(db, body.video_file_id, "VIDEO")
            content.video_file_id = body.video_file_id
            if content.published_at is not None:
                content.version = (content.version or 1) + 1
        if content.thumbnail_file_id != body.thumbnail_file_id:
            require_file(db, body.thumbnail_file_id, "THUMBNAIL")
            content.thumbnail_file_id = body.thumbnail_file_id
        content.duration_sec = body.duration_sec
        content.aspect_ratio = body.aspect_ratio

        _save_quiz(db, content.id, body.quiz)
        _save_practice(db, content.id, body.practice)
        _save_subtitles(db, content.id, body.subtitles)

        content.tags = list(db.scalars(select(Tag).where(Tag.id.in_(body.tag_ids or []))).all())
        content.skills = list(db.scalars(select(Skill).where(Skill.id.in_(body.skill_ids or []))).all())
        content.resources = list(db.scalars(select(Resource).where(Resource.id.in_(body.resource_ids or []))).all())

        # 공개 중인 콘텐츠를 수정했는데 공개 조건이 깨지면 저장을 막습니다.
        if content.status == "PUBLISHED":
            db.flush()
            db.expire_all()
            content = find_content(db, content_id)
            missing = check_publishable(db, content)
            if missing:
                raise ApiError(422, "공개 중인 콘텐츠라 필수 항목을 비울 수 없습니다.", missing)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(content)
    return to_detail(db, content)


@router.post("/{content_id}/publish", response_model=ContentDetail)
def publish(content_id: int, db: Session = Depends(get_db), admin_id: int = Depends(require_admin)):
    """공개 요청. 조건을 못 채우면 422와 누락 항목 목록(details)을 돌려줍니다."""
    content = find_content(db, content_id)
    missing = check_publishable(db, content)
    if missing:
        raise ApiError(422, "공개 조건을 충족하지 못했습니다.", missing)
    content.status = "PUBLISHED"
    if content.published_at is None:
        content.published_at = datetime.now()
    db.add(AdminLog(admin_id=admin_id, action="CONTENT_PUBLISH", target_type="CONTENT", target_id=content_id))
    db.commit()
    return to_detail(db, content)


@router.post("/{content_id}/hide", response_model=ContentDetail)
def hide(content_id: int, db: Session = Depends(get_db), admin_id: int = Depends(require_admin)):
    """비공개 전환. 학습 기록은 그대로 남습니다."""
    content = find_content(db, content_id)
    if content.status != "PUBLISHED":
        raise ApiError.bad_request("공개 중인 콘텐츠만 비공개로 바꿀 수 있습니다.")
    content.status = "HIDDEN"
    db.add(AdminLog(admin_id=admin_id, action="CONTENT_HIDE", target_type="CONTENT", target_id=content_id))
    db.commit()
    return to_detail(db, content)


@router.delete("/{content_id}", status_code=204)
def remove(content_id: int, db: Session = Depends(get_db), admin_id: int = Depends(require_admin)):
    """한 번도 공개하지 않은 콘텐츠만 실제로 삭제합니다. 공개 이력이 있으면 비공개를 쓰세요."""
    content = find_content(db, content_id)
    if content.published_at is not None:
        raise ApiError.bad_request("공개된 적이 있는 콘텐츠는 삭제할 수 없습니다. 비공개로 바꿔 주세요.")
    for quiz in db.scalars(select(Quiz).where(Quiz.content_id == content_id)).all():
        db.delete(quiz)
    for practice in db.scalars(select(Practice).where(Practice.content_id == content_id)).all():
        db.delete(practice)
    db.execute(delete(Subtitle).where(Subtitle.content_id == content_id))
    content.tags = []
    content.skills = []
    content.resources = []
    db.flush()
    db.delete(content)
    db.add(AdminLog(admin_id=admin_id, action="CONTENT_DELETE", target_type="CONTENT", target_id=content_id))
    db.commit()
    return Response(status_code=204)
