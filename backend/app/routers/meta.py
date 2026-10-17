"""등록 화면의 선택 목록 (분야·스킬)"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import Category, Skill
from ..schemas import CategoryOut, SkillOut

router = APIRouter(prefix="/api/admin", tags=["분야·스킬"], dependencies=[Depends(require_admin)])


@router.get("/categories", response_model=list[CategoryOut])
def categories(db: Session = Depends(get_db)):
    rows = db.scalars(select(Category).order_by(Category.sort_order)).all()
    return [CategoryOut(id=c.id, name=c.name, category_type=c.category_type) for c in rows]


@router.get("/skills", response_model=list[SkillOut])
def skills(categoryId: int | None = None, db: Session = Depends(get_db)):
    stmt = select(Skill).order_by(Skill.sort_order)
    if categoryId is not None:
        stmt = stmt.where(Skill.category_id == categoryId)
    return [SkillOut(id=s.id, category_id=s.category_id, name=s.name, description=s.description)
            for s in db.scalars(stmt).all()]
