"""백엔드(FastAPI)에 AI 검색을 붙인다. 백엔드 main.py에서 install_search(app, SessionLocal) 한 줄로 쓴다.

- POST {prefix}/search 를 붙인다 (기본 /api/ai/search)
- 검색 결과에는 과정과 콘텐츠가 모두 공개(PUBLISHED)인 영상만 남긴다
- 공개 콘텐츠의 DB 자막(subtitles)을 백엔드 프로세스 안에서 인덱싱한다. 켜질 때 한 번, 그 뒤 일정 간격으로
  바뀐 콘텐츠만 다시 인덱싱하고 공개가 풀린 콘텐츠는 지운다. 다른 프로세스에서 인덱싱하면 실행 중인 서버가
  바뀐 인덱스를 보지 못하므로 같은 프로세스에서 한다.

DB는 읽기만 하며 DB 명세서의 contents·courses·subtitles 테이블을 쓴다.
"""

import hashlib
import json
import logging
import os
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from .chunking import Segment
from .router import get_search_service, get_visible_filter, router
from .service import SearchService, VisibleFilter

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AbstractContextManager[Session]]

# 서비스 인덱스는 data/subtitles.json 데모 인덱스와 섞이지 않게 따로 둔다 (ai-search 폴더 기준)
SERVICE_CHROMA_PATH = "./chroma_service"

_PUBLIC = "c.status = 'PUBLISHED' AND k.status = 'PUBLISHED'"
_PUBLIC_IDS = text(
    f"SELECT c.content_id FROM contents c JOIN courses k ON k.course_id = c.course_id "
    f"WHERE {_PUBLIC} AND c.content_id IN :ids"
).bindparams(bindparam("ids", expanding=True))
_PUBLIC_SUBTITLES = text(
    f"SELECT c.content_id, c.title, s.start_sec, s.end_sec, s.caption_text "
    f"FROM contents c JOIN courses k ON k.course_id = c.course_id "
    f"LEFT JOIN subtitles s ON s.content_id = c.content_id "
    f"WHERE {_PUBLIC} ORDER BY c.content_id, s.start_sec, s.subtitle_id"
)


def public_only(session_factory: SessionFactory) -> VisibleFilter:
    """검색된 video_id(= contents.content_id) 중 과정과 콘텐츠가 모두 공개인 것만 돌려준다."""

    def visible(video_ids: list[str]) -> list[str]:
        ids = [int(v) for v in video_ids if v.isdigit()]
        if not ids:
            return []
        with session_factory() as db:
            return [str(row[0]) for row in db.execute(_PUBLIC_IDS, {"ids": ids})]

    return visible


@dataclass(frozen=True)
class SyncResult:
    indexed: list[str]
    removed: list[str]
    unchanged: int


def _signature(title: str, segments: list[Segment]) -> str:
    raw = json.dumps([title, [(s.start, s.end, s.text) for s in segments]], ensure_ascii=False)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def sync_index(session_factory: SessionFactory, service: SearchService) -> SyncResult:
    """공개 콘텐츠의 DB 자막에 검색 인덱스를 맞춘다. 바뀐 콘텐츠만 임베딩하므로 반복 호출해도 비용이 적다."""
    videos: dict[str, tuple[str, list[Segment]]] = {}
    with session_factory() as db:
        for content_id, title, start, end, caption in db.execute(_PUBLIC_SUBTITLES):
            _, segments = videos.setdefault(str(content_id), (title or "", []))
            if caption:
                segments.append(Segment(float(start), float(end), caption))

    indexed_before = service.indexed_signatures()
    indexed, unchanged = [], 0
    for video_id, (title, segments) in videos.items():
        signature = _signature(title, segments)
        if indexed_before.get(video_id) == signature:
            unchanged += 1
            continue
        if segments:
            service.index_video(video_id, segments, title, signature)
            indexed.append(video_id)
        elif video_id in indexed_before:
            # 자막을 모두 지운 공개 콘텐츠는 검색에서 뺀다
            service.delete_video(video_id)
    removed = sorted(set(indexed_before) - set(videos))
    for video_id in removed:
        service.delete_video(video_id)
    return SyncResult(indexed, removed, unchanged)


def _sync_loop(session_factory: SessionFactory, interval_seconds: float, stop: threading.Event) -> None:
    while True:
        try:
            result = sync_index(session_factory, get_search_service())
            if result.indexed or result.removed:
                logger.info("AI 검색 인덱스 동기화: 인덱싱 %s, 삭제 %s", result.indexed, result.removed)
        except Exception:
            # Gemini 장애·DB 연결 문제가 있어도 백엔드는 계속 돌고, 다음 주기에 다시 시도한다
            logger.warning("AI 검색 인덱스 동기화 실패, 다음 주기에 다시 시도", exc_info=True)
        if stop.wait(interval_seconds):
            return


def install_search(app, session_factory: SessionFactory, prefix: str = "/api/ai",
                   sync_interval_seconds: float | None = 60.0) -> threading.Event | None:
    """백엔드 앱에 AI 검색을 붙인다. sync_interval_seconds를 None으로 주면 자동 동기화를 하지 않는다.

    돌려받은 Event를 set()하면 동기화를 멈춘다 (테스트용).
    """
    # ai-search/.env의 데모 인덱스 경로보다 먼저 정해 두어야 한다 (설정은 처음 검색할 때 읽는다)
    os.environ.setdefault("CHROMA_PATH", SERVICE_CHROMA_PATH)
    app.include_router(router, prefix=prefix)
    visible = public_only(session_factory)
    app.dependency_overrides[get_visible_filter] = lambda: visible
    if sync_interval_seconds is None:
        return None
    stop = threading.Event()
    threading.Thread(target=_sync_loop, args=(session_factory, sync_interval_seconds, stop),
                     name="ai-search-sync", daemon=True).start()
    return stop
