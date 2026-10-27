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
        refine_min_similarity: float = 0.0,
        relative_margin: float | None = None,
    ):
        self._embedder = embedder
        self._store = store
        self._refiner = refiner
        self._min_score = min_score
        self._refine_min_similarity = refine_min_similarity
        # 1위 영상보다 이만큼 이상 낮은 결과는 버린다 (None이면 끔). 약하게 걸린 영상이 줄줄이 붙지 않게
        self._relative_margin = relative_margin

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
        if refined == query:
            refined = None
        embeddings = self._embedder.embed([query, refined] if refined else [query], "query")

        # 영상별로 묶거나 비공개를 거르면 개수가 줄어드니 넉넉히 가져온다
        n = top_k * 5
        hits = self._store.query(embeddings[0], n)
        # 정제 검색어는 원문 검색에 더하기만 한다. LLM이 질문을 엉뚱하게 바꿔도 원문 결과는 남고,
        # 원문과 의미가 너무 멀어진 검색어는 지어낸 것으로 보고 버린다
        if refined and _cosine(embeddings[0], embeddings[1]) >= self._refine_min_similarity:
            hits = _merge_hits(hits, self._store.query(embeddings[1], n))
        else:
            refined = None
        hits = [h for h in hits if h.score >= self._min_score]
        if visible is not None and hits:
            allowed = set(visible(sorted({h.video_id for h in hits})))
            hits = [h for h in hits if h.video_id in allowed]

        if group_by_video:
            results = _group_by_video(hits)
        else:
            results = [VideoResult(h.video_id, h.start, h.end, h.score, h.text) for h in hits]
        if self._relative_margin is not None and results:
            results = [r for r in results if r.score >= results[0].score - self._relative_margin]
        return SearchOutcome(query=query, refined_query=refined, results=results[:top_k])


def _cosine(a: list[float], b: list[float]) -> float:
    # 임베더가 정규화된 벡터를 돌려주므로 내적이 코사인 유사도
    return sum(x * y for x, y in zip(a, b))


def _merge_hits(*hit_lists: list[Hit]) -> list[Hit]:
    """같은 구간은 높은 점수 하나만 남기고 점수 내림차순으로 합친다."""
    best: dict[tuple[str, float], Hit] = {}
    for hit in (h for hits in hit_lists for h in hits):
        key = (hit.video_id, hit.start)
        if key not in best or hit.score > best[key].score:
            best[key] = hit
    return sorted(best.values(), key=lambda h: h.score, reverse=True)


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
