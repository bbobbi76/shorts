from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .config import load_settings
from .embedders import EmbeddingError, GeminiEmbedder, MockEmbedder
from .refine import GeminiRefiner
from .service import SearchService, VisibleFilter
from .store import SubtitleStore


@lru_cache
def get_search_service() -> SearchService:
    settings = load_settings()
    store = SubtitleStore(settings.chroma_path, settings.collection)
    if settings.provider == "gemini":
        embedder = GeminiEmbedder(settings.gemini_api_key, settings.gemini_embedding_model)
        refiner = (
            GeminiRefiner(settings.gemini_api_key, settings.gemini_refine_model, settings.refine_wait_seconds)
            if settings.gemini_refine
            else None
        )
    else:
        embedder, refiner = MockEmbedder(), None
    return SearchService(
        embedder, store, refiner, settings.min_score, settings.refine_min_similarity, settings.relative_margin
    )


def get_visible_filter() -> VisibleFilter | None:
    """백엔드에서 app.dependency_overrides로 바꿔 끼운다. 기본값은 거르지 않음."""
    return None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    top_k: int = Field(default=5, ge=1, le=20)
    group_by_video: bool = True


class Moment(BaseModel):
    start: float
    end: float
    score: float
    text: str


class SearchResultItem(BaseModel):
    type: Literal["video"] = "video"
    video_id: str
    start: float = Field(description="재생 시작 위치(초)")
    end: float
    score: float = Field(description="코사인 유사도")
    text: str = Field(description="매칭된 자막 구간")
    moments: list[Moment] = Field(default_factory=list, description="같은 영상의 다른 매칭 구간(시간순)")


class SearchResponse(BaseModel):
    query: str
    refined_query: str | None
    results: list[SearchResultItem]


router = APIRouter(tags=["AI 검색"])


@router.post("/search", response_model=SearchResponse)
def search(
    body: SearchRequest,
    service: SearchService = Depends(get_search_service),
    visible: VisibleFilter | None = Depends(get_visible_filter),
):
    query = body.query.strip()
    if not query:
        raise HTTPException(422, "검색어를 입력하세요")
    try:
        outcome = service.search(query, body.top_k, body.group_by_video, visible)
    except EmbeddingError:
        raise HTTPException(503, "AI 검색을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.")

    return SearchResponse(
        query=outcome.query,
        refined_query=outcome.refined_query,
        results=[
            SearchResultItem(
                video_id=r.video_id,
                start=r.start,
                end=r.end,
                score=r.score,
                text=r.text,
                moments=[Moment(start=m.start, end=m.end, score=m.score, text=m.text) for m in r.moments],
            )
            for r in outcome.results
        ],
    )
