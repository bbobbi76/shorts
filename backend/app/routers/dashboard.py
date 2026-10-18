"""관리자 대시보드: 등록 현황과 최근 작업"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import AdminLog, Content, Course, Resource, Tag, User
from ..schemas import ContentSummary, DashboardOut, LogOut

router = APIRouter(prefix="/api/admin/dashboard", tags=["대시보드"], dependencies=[Depends(require_admin)])


def _count(db: Session, model, *where) -> int:
    stmt = select(func.count()).select_from(model)
    for w in where:
        stmt = stmt.where(w)
    return db.scalar(stmt) or 0


@router.get("", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db)):
    recent = db.scalars(select(Content).order_by(Content.id.desc()).limit(5)).all()
    logs = db.scalars(select(AdminLog).order_by(AdminLog.id.desc()).limit(10)).all()
    return DashboardOut(
        user_count=_count(db, User),
        course_count=_count(db, Course),
        published_course_count=_count(db, Course, Course.status == "PUBLISHED"),
        content_count=_count(db, Content),
        draft_content_count=_count(db, Content, Content.status == "DRAFT"),
        published_content_count=_count(db, Content, Content.status == "PUBLISHED"),
        hidden_content_count=_count(db, Content, Content.status == "HIDDEN"),
        resource_count=_count(db, Resource),
        tag_count=_count(db, Tag),
        recent_contents=[ContentSummary.of(c) for c in recent],
        recent_logs=[LogOut(id=l.id, action=l.action, target_type=l.target_type, target_id=l.target_id,
                            created_at=l.created_at) for l in logs],
    )
