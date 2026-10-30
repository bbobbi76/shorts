"""검색 품질·할루시네이션 방지 장치 테스트. 키·네트워크 없이 돈다."""
import time
import uuid

import pytest

from ai_search import Segment, SearchService
from ai_search.embedders import MockEmbedder
from ai_search.refine import GeminiRefiner, _retry_seconds, clean_refined
from ai_search.store import SubtitleStore
from test_search import SAMPLE


class FixedRefiner:
    def __init__(self, text):
        self.text = text

    def refine(self, query):
        return self.text


def make_service(refiner=None, min_score=0.1, refine_min_similarity=0.0, relative_margin=None):
    store = SubtitleStore(None, collection=f"test_{uuid.uuid4().hex}")
    service = SearchService(MockEmbedder(), store, refiner, min_score, refine_min_similarity, relative_margin)
    for video in SAMPLE:
        segments = [Segment(s["start"], s["end"], s["text"]) for s in video["segments"]]
        service.index_video(video["video_id"], segments, video["title"])
    return service


def test_relative_margin_drops_results_far_below_the_top():
    wide = make_service().search("매출 합계", top_k=10).results
    narrow = make_service(relative_margin=0.05).search("매출 합계", top_k=10).results
    assert len(narrow) < len(wide)
    assert all(r.score >= narrow[0].score - 0.05 for r in narrow)
    assert narrow[0].video_id == wide[0].video_id


def test_original_query_still_counts_when_refiner_makes_things_up():
    # 정제가 질문과 상관없는 기능 이름을 붙여도 원문으로 찾은 정답 영상이 결과에 남는다
    query = "사번으로 이름 찾아오기"
    refined_only = make_service().search("피벗 테이블 월별 요약").results
    assert refined_only[0].video_id != "2"
    results = make_service(refiner=FixedRefiner("피벗 테이블 월별 요약")).search(query).results
    assert "2" in [r.video_id for r in results]


def test_refinement_far_from_question_is_discarded():
    service = make_service(refiner=FixedRefiner("피벗 테이블 월별 요약"), refine_min_similarity=0.9)
    outcome = service.search("사번으로 이름 찾아오기")
    assert outcome.refined_query is None
    assert outcome.results[0].video_id == "2"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("엑셀 SUMIF 부서별 합계", "엑셀 SUMIF 부서별 합계"),
        ("검색어: 엑셀 중복 제거", "엑셀 중복 제거"),
        ("\"엑셀 틀 고정\".", "엑셀 틀 고정"),
        ("엑셀 틀 고정\n이 검색어는 제목 줄을 고정하는 방법입니다.", None),  # 설명을 붙임
        ("가" * 61, None),  # 너무 김
        ("...", None),
        ("", None),
        (None, None),
        ("부서별 매출 합계", None),  # 원문과 같으면 정제할 필요 없음
    ],
)
def test_clean_refined(raw, expected):
    assert clean_refined(raw, "부서별 매출 합계") == expected


def test_retry_delay_is_read_from_quota_error():
    error = Exception("429 RESOURCE_EXHAUSTED. {'details': [{'retryDelay': '29s'}]}")
    assert _retry_seconds(error) == 29.0
    assert _retry_seconds(Exception("500")) is None


class QuotaError(Exception):
    code = 429

    def __str__(self):
        return "429 RESOURCE_EXHAUSTED {'retryDelay': '30s'}"


def make_refiner(call, wait_seconds=0.5):
    refiner = GeminiRefiner("test-key", "test-model", wait_seconds=wait_seconds)
    refiner._call = call
    return refiner


def test_refiner_remembers_successful_results():
    calls = []
    refiner = make_refiner(lambda q: calls.append(q) or "엑셀 중복 제거")
    assert refiner.refine("겹치는 데이터 지우기") == "엑셀 중복 제거"
    assert refiner.refine("겹치는  데이터 지우기 ") == "엑셀 중복 제거"  # 띄어쓰기만 다른 같은 질문
    assert len(calls) == 1


def test_refiner_does_not_wait_past_the_limit():
    refiner = make_refiner(lambda q: time.sleep(2) or "늦은 결과", wait_seconds=0.2)
    started = time.perf_counter()
    assert refiner.refine("느린 질문") is None
    assert time.perf_counter() - started < 1.0


def test_refiner_pauses_after_quota_error():
    calls = []

    def call(q):
        calls.append(q)
        raise QuotaError()

    refiner = make_refiner(call)
    assert refiner.refine("첫 질문") is None
    assert refiner.refine("둘째 질문") is None  # 한도가 풀릴 때까지 호출하지 않는다
    assert len(calls) == 1


def test_refiner_keeps_result_that_arrives_after_the_limit():
    calls = []
    refiner = make_refiner(lambda q: calls.append(q) or time.sleep(0.3) or "엑셀 중복 제거", wait_seconds=0.05)
    assert refiner.refine("겹치는 데이터 지우기") is None
    refiner._pool.shutdown(wait=True)  # 뒤에서 돌던 호출이 끝나기를 기다린다
    assert refiner.refine("겹치는 데이터 지우기") == "엑셀 중복 제거"
    assert len(calls) == 1


def test_refiner_notices_quota_error_after_the_limit():
    calls = []

    def call(q):
        calls.append(q)
        time.sleep(0.3)
        raise QuotaError()

    refiner = make_refiner(call, wait_seconds=0.05)
    assert refiner.refine("첫 질문") is None
    refiner._pool.shutdown(wait=True)
    assert refiner.refine("둘째 질문") is None
    assert len(calls) == 1


@pytest.mark.parametrize("answer", ["겹치는 데이터 지우기", "엑셀 중복 제거\n이렇게 검색하면 됩니다."])
def test_refiner_does_not_repeat_call_for_unusable_answer(answer):
    # 원문과 같거나 검색어로 못 쓰는 답도 같은 질문으로 한도를 다시 쓰지 않는다
    calls = []
    refiner = make_refiner(lambda q: calls.append(q) or answer)
    assert refiner.refine("겹치는 데이터 지우기") is None
    assert refiner.refine("겹치는 데이터 지우기") is None
    assert len(calls) == 1


def test_refiner_retries_after_failed_call():
    calls = []

    def call(q):
        calls.append(q)
        if len(calls) == 1:
            raise RuntimeError("일시적 오류")
        return "엑셀 중복 제거"

    refiner = make_refiner(call)
    assert refiner.refine("겹치는 데이터 지우기") is None
    assert refiner.refine("겹치는 데이터 지우기") == "엑셀 중복 제거"
