from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Protocol

from .chunking import Segment, chunk_segments
from .embedders import Embedder
from .store import Hit, SubtitleStore

MAX_MOMENTS = 3

# 검색된 video_id 중 사용자에게 보여줘도 되는 것만 돌려준다 (비공개 콘텐츠 제외용)
VisibleFilter = Callable[[list[str]], Iterable[str]]


class Refiner(Protocol):
    def refine(self, query: str) -> str | None: ...


@dataclass
class VideoResult:
    video_id: str
    start: float
    end: float
    score: float
    text: str
    moments: list[Hit] = field(default_factory=list)


@dataclass
class SearchOutcome:
    query: str
    refined_query: str | None
    results: list[VideoResult]


class SearchService:
    def __init__(
        self,
        embedder: Embedder,
        store: SubtitleStore,
        refiner: Refiner | None = None,
        min_score: float = 0.5,
    ):
        self._embedder = embedder
        self._store = store
        self._refiner = refiner
        self._min_score = min_score

    def index_video(self, video_id: str, segments: list[Segment], title: str = "") -> int:
        """영상 공개·수정 시 호출. 같은 video_id의 기존 자막은 교체된다."""
        chunks = chunk_segments(segments)
        # 제목을 붙여 임베딩하면 자막에 기능 이름이 안 나와도 걸린다. 저장되는 텍스트는 자막 원문.
        prefix = f"{title}\n" if title else ""
        embeddings = self._embedder.embed([prefix + c.text for c in chunks], "document") if chunks else []
        return self._store.replace_video(video_id, chunks, embeddings)

    def delete_video(self, video_id: str) -> None:
        """영상 비공개·삭제 시 호출."""
        self._store.delete_video(video_id)

    def search(
        self,
        query: str,
        top_k: int = 5,
        group_by_video: bool = True,
        visible: VisibleFilter | None = None,
    ) -> SearchOutcome:
        refined = self._refiner.refine(query) if self._refiner else None
        embedding = self._embedder.embed([refined or query], "query")[0]

        # 영상별로 묶거나 비공개를 거르면 개수가 줄어드니 넉넉히 가져온다
        hits = [h for h in self._store.query(embedding, top_k * 5) if h.score >= self._min_score]
        if visible is not None and hits:
            allowed = set(visible(sorted({h.video_id for h in hits})))
            hits = [h for h in hits if h.video_id in allowed]

        if group_by_video:
            results = _group_by_video(hits)[:top_k]
        else:
            results = [VideoResult(h.video_id, h.start, h.end, h.score, h.text) for h in hits[:top_k]]
        return SearchOutcome(query=query, refined_query=refined, results=results)


def _group_by_video(hits: list[Hit]) -> list[VideoResult]:
    """hits는 점수 내림차순. 영상마다 첫 hit이 대표 구간, 나머지는 moments(시간순).

    청크가 한 줄씩 겹치므로 이미 고른 구간과 겹치는 hit은 건너뛴다.
    """
    grouped: dict[str, list[Hit]] = {}
    for hit in hits:
        picked = grouped.setdefault(hit.video_id, [])
        if not any(hit.start < p.end and p.start < hit.end for p in picked):
            picked.append(hit)

    return [
        VideoResult(
            video_id=best.video_id,
            start=best.start,
            end=best.end,
            score=best.score,
            text=best.text,
            moments=sorted(rest[:MAX_MOMENTS], key=lambda h: h.start),
        )
        for best, *rest in grouped.values()
    ]
