"""검색 태그와 동의어 관리 (상황별 검색의 기반 데이터)"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..errors import ApiError
from ..models import Tag, TagSynonym
from ..schemas import SynonymIn, TagIn, TagOut

router = APIRouter(prefix="/api/admin/tags", tags=["검색 태그"], dependencies=[Depends(require_admin)])


def _synonym_exists(db: Session, value: str) -> bool:
    return db.scalar(select(TagSynonym.id).where(TagSynonym.synonym == value)) is not None


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    return [TagOut.of(t) for t in db.scalars(select(Tag).order_by(Tag.name)).all()]


@router.post("", response_model=TagOut, status_code=201)
def create(body: TagIn, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise ApiError.bad_request("태그 이름을 입력해 주세요.")
    if db.scalar(select(Tag.id).where(Tag.name == name)) is not None:
        raise ApiError.bad_request(f"이미 있는 태그입니다: {name}")
    tag = Tag(name=name, tag_type=body.tag_type)
    seen: set[str] = set()
    for raw in body.synonyms or []:
        s = (raw or "").strip()
        if not s or s == name or s in seen:
            continue
        if _synonym_exists(db, s):
            raise ApiError.bad_request(f"다른 태그에 이미 등록된 동의어입니다: {s}")
        seen.add(s)
        tag.synonyms.append(TagSynonym(synonym=s))
    db.add(tag)
    db.commit()
    return TagOut.of(tag)


@router.post("/{tag_id}/synonyms", response_model=TagOut, status_code=201)
def add_synonym(tag_id: int, body: SynonymIn, db: Session = Depends(get_db)):
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise ApiError.not_found("태그")
    value = body.synonym.strip()
    if _synonym_exists(db, value):
        raise ApiError.bad_request(f"이미 등록된 동의어입니다: {value}")
    tag.synonyms.append(TagSynonym(synonym=value))
    db.commit()
    return TagOut.of(tag)
