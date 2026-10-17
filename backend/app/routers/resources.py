"""실무자료 (템플릿·예시 문서·프롬프트) 관리"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..errors import ApiError
from ..files import require_file
from ..models import Category, Resource
from ..schemas import ResourceIn, ResourceOut

router = APIRouter(prefix="/api/admin/resources", tags=["실무자료"])


def _apply(db: Session, r: Resource, body: ResourceIn) -> None:
    # 파일 또는 프롬프트 본문 중 하나는 있어야 합니다 (DB 명세서 8-4).
    has_prompt = bool(body.prompt_text and body.prompt_text.strip())
    if body.file_id is None and not has_prompt:
        raise ApiError.bad_request("파일을 올리거나 프롬프트 본문을 입력해 주세요.")
    if not body.title.strip():
        raise ApiError.bad_request("자료 제목을 입력해 주세요.")
    r.title = body.title.strip()
    r.resource_type = body.resource_type
    r.description = body.description
    r.prompt_text = body.prompt_text if has_prompt else None
    if r.file_id != body.file_id:
        require_file(db, body.file_id, "RESOURCE")
        r.file_id = body.file_id
    if body.category_id is not None and db.get(Category, body.category_id) is None:
        raise ApiError.not_found("분야")
    r.category_id = body.category_id
    r.status = body.status or "PUBLISHED"


@router.get("", response_model=list[ResourceOut])
def list_resources(db: Session = Depends(get_db), _: int = Depends(require_admin)):
    return [ResourceOut.of(r) for r in db.scalars(select(Resource).order_by(Resource.id.desc())).all()]


@router.post("", response_model=ResourceOut, status_code=201)
def create(body: ResourceIn, db: Session = Depends(get_db), admin_id: int = Depends(require_admin)):
    resource = Resource(created_by=admin_id, download_count=0)
    _apply(db, resource, body)
    db.add(resource)
    db.commit()
    return ResourceOut.of(resource)


@router.put("/{resource_id}", response_model=ResourceOut)
def update(resource_id: int, body: ResourceIn, db: Session = Depends(get_db), _: int = Depends(require_admin)):
    resource = db.get(Resource, resource_id)
    if resource is None:
        raise ApiError.not_found("자료")
    _apply(db, resource, body)
    db.commit()
    return ResourceOut.of(resource)
