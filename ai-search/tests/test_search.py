import json
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_search import Segment, SearchService, get_search_service, get_visible_filter, router
from ai_search.chunking import chunk_segments
from ai_search.config import SEARCH_ROOT
from ai_search.embedders import EmbeddingError, MockEmbedder
from ai_search.store import SubtitleStore

SAMPLE = json.loads((SEARCH_ROOT / "data" / "subtitles.json").read_text(encoding="utf-8"))


class FixedRefiner:
    def refine(self, query):
        return "엑셀 SUMIF 부서별 합계"


class BrokenEmbedder:
    def embed(self, texts, purpose):
        raise EmbeddingError("down")


def make_service(refiner=None, min_score=0.1) -> SearchService:
    # EphemeralClient는 프로세스 안에서 공유되므로 컬렉션 이름을 매번 다르게
    store = SubtitleStore(None, collection=f"test_{uuid.uuid4().hex}")
    service = SearchService(MockEmbedder(), store, refiner, min_score)
    for video in SAMPLE:
        segments = [Segment(s["start"], s["end"], s["text"]) for s in video["segments"]]
        service.index_video(video["video_id"], segments, video["title"])
    return service


def segs(*texts):
    return [Segment(i * 10.0, (i + 1) * 10.0, t) for i, t in enumerate(texts)]


def test_chunks_overlap_and_cover_last_segment():
    assert [(c.start, c.end) for c in chunk_segments(segs(*"abcdef"))] == [(0, 30), (20, 50), (30, 60)]
    assert [(c.start, c.end) for c in chunk_segments(segs(*"abcde"))] == [(0, 30), (20, 50)]
    assert [(c.start, c.end) for c in chunk_segments(segs("a", "b"))] == [(0, 20)]
    assert chunk_segments([]) == []


@pytest.mark.parametrize(
    ("query", "expected"),
    [("부서별 매출 합계 구하기", "1"), ("사번으로 이름 찾아오기", "2"), ("피벗 테이블 월별 요약", "3")],
)
def test_mock_search_finds_matching_video(query, expected):
    assert make_service().search(query).results[0].video_id == expected


def test_results_are_one_per_video_and_moments_do_not_overlap():
    results = make_service().search("매출 합계", top_k=10).results
    assert len({r.video_id for r in results}) == len(results)
    for r in results:
        assert len(r.moments) <= 3
        assert all(m.end <= r.start or m.start >= r.end for m in r.moments)
        assert [m.start for m in r.moments] == sorted(m.start for m in r.moments)


def test_ungrouped_returns_segments_in_score_order():
    results = make_service().search("SUMIF 합계", top_k=4, group_by_video=False).results
    assert len(results) == 4
    assert [r.score for r in results] == sorted((r.score for r in results), reverse=True)


def test_unrelated_query_returns_nothing():
    assert make_service().search("오늘 점심 메뉴 추천").results == []


def test_visible_filter_hides_private_videos():
    results = make_service().search("부서별 매출 합계", visible=lambda ids: [i for i in ids if i != "1"]).results
    assert results and all(r.video_id != "1" for r in results)


def test_refined_query_is_used_and_returned():
    outcome = make_service(refiner=FixedRefiner()).search("이번 달 돈 다 합치려면?")
    assert outcome.refined_query == "엑셀 SUMIF 부서별 합계"
    assert outcome.results[0].video_id == "1"


def test_reindex_replaces_and_delete_removes():
    service = make_service()
    service.index_video("1", segs("완전히 새 내용"))
    hits = service.search("SUMIF 합계", top_k=20, group_by_video=False).results
    assert all(h.video_id != "1" or h.text == "완전히 새 내용" for h in hits)

    service.delete_video("2")
    assert all(r.video_id != "2" for r in service.search("사번 VLOOKUP").results)


def make_client(service, visible=None) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_search_service] = lambda: service
    if visible:
        app.dependency_overrides[get_visible_filter] = lambda: visible
    return TestClient(app)


def test_api_response_shape():
    body = make_client(make_service()).post("/search", json={"query": "사번으로 이름 찾기"}).json()
    assert body["query"] == "사번으로 이름 찾기"
    assert body["refined_query"] is None
    first = body["results"][0]
    assert first["video_id"] == "2" and first["type"] == "video"
    assert {"start", "end", "score", "text", "moments"} <= first.keys()


def test_api_applies_visible_filter_override():
    client = make_client(make_service(), visible=lambda ids: [])
    assert client.post("/search", json={"query": "사번"}).json()["results"] == []


def test_api_errors():
    client = make_client(SearchService(BrokenEmbedder(), SubtitleStore(None, f"t_{uuid.uuid4().hex}")))
    assert client.post("/search", json={"query": "합계"}).status_code == 503
    assert client.post("/search", json={"query": "   "}).status_code == 422
    assert client.post("/search", json={"query": ""}).status_code == 422
