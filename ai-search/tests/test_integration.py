"""백엔드 연결(공개 필터, DB 자막 동기화, 라우터 등록) 테스트. MySQL 대신 SQLite로 DB 명세서의 테이블을 흉내 낸다."""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from ai_search import Segment, SearchService, get_search_service
from ai_search.embedders import MockEmbedder
from ai_search.integration import install_search, public_only, sync_index
from ai_search.store import SubtitleStore
from test_search import SAMPLE

SCHEMA = [
    "CREATE TABLE courses (course_id INTEGER PRIMARY KEY, status TEXT)",
    "CREATE TABLE contents (content_id INTEGER PRIMARY KEY, course_id INTEGER, title TEXT, status TEXT)",
    "CREATE TABLE subtitles (subtitle_id INTEGER PRIMARY KEY AUTOINCREMENT, content_id INTEGER,"
    " start_sec NUMERIC, end_sec NUMERIC, caption_text TEXT)",
]


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        for sql in SCHEMA:
            conn.execute(text(sql))
        conn.execute(text("INSERT INTO courses VALUES (1, 'PUBLISHED'), (2, 'DRAFT')"))
        # 샘플 영상 1·2는 공개 과정의 공개 콘텐츠, 3은 비공개 과정에 있어서 검색되면 안 된다
        for video, course, status in [(SAMPLE[0], 1, "PUBLISHED"), (SAMPLE[1], 1, "PUBLISHED"), (SAMPLE[2], 2, "PUBLISHED")]:
            conn.execute(text("INSERT INTO contents VALUES (:id, :course, :title, :status)"),
                         {"id": int(video["video_id"]), "course": course, "title": video["title"], "status": status})
            for s in video["segments"]:
                conn.execute(text("INSERT INTO subtitles (content_id, start_sec, end_sec, caption_text) VALUES (:id, :s, :e, :t)"),
                             {"id": int(video["video_id"]), "s": s["start"], "e": s["end"], "t": s["text"]})
    return engine, sessionmaker(bind=engine)


def make_service():
    return SearchService(MockEmbedder(), SubtitleStore(None, f"test_{uuid.uuid4().hex}"), None, 0.1)


def test_public_only_keeps_published_content_in_published_course(db):
    engine, sessions = db
    assert sorted(public_only(sessions)(["1", "2", "3", "99", "abc"])) == ["1", "2"]
    with engine.begin() as conn:
        conn.execute(text("UPDATE contents SET status = 'HIDDEN' WHERE content_id = 2"))
    assert public_only(sessions)(["1", "2"]) == ["1"]


def test_sync_indexes_public_only_and_skips_unchanged(db):
    _, sessions = db
    service = make_service()
    first = sync_index(sessions, service)
    assert sorted(first.indexed) == ["1", "2"] and first.removed == []
    assert set(service.indexed_signatures()) == {"1", "2"}

    again = sync_index(sessions, service)
    assert again.indexed == [] and again.removed == [] and again.unchanged == 2


def test_sync_reindexes_changed_and_removes_unpublished(db):
    engine, sessions = db
    service = make_service()
    sync_index(sessions, service)
    with engine.begin() as conn:
        conn.execute(text("UPDATE subtitles SET caption_text = '완전히 새 내용' WHERE content_id = 1"))
        conn.execute(text("UPDATE contents SET status = 'HIDDEN' WHERE content_id = 2"))
    result = sync_index(sessions, service)
    assert result.indexed == ["1"] and result.removed == ["2"]
    hits = service.search("완전히 새 내용", group_by_video=False).results
    assert hits and hits[0].text.startswith("완전히 새 내용")


def test_sync_drops_public_content_whose_subtitles_were_all_deleted(db):
    engine, sessions = db
    service = make_service()
    sync_index(sessions, service)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM subtitles WHERE content_id = 1"))
    sync_index(sessions, service)
    assert set(service.indexed_signatures()) == {"2"}


def test_install_search_mounts_route_and_hides_private_content(db, monkeypatch):
    _, sessions = db
    monkeypatch.delenv("CHROMA_PATH", raising=False)
    service = make_service()
    # 비공개 과정의 영상 3도 인덱스에 들어 있다고 가정한다 (예: 공개가 풀린 직후)
    for video in SAMPLE:
        service.index_video(video["video_id"], [Segment(s["start"], s["end"], s["text"]) for s in video["segments"]], video["title"])

    app = FastAPI()
    assert install_search(app, sessions, sync_interval_seconds=None) is None
    app.dependency_overrides[get_search_service] = lambda: service
    client = TestClient(app)

    body = client.post("/api/ai/search", json={"query": "피벗 테이블 월별 요약"}).json()
    assert all(r["video_id"] != "3" for r in body["results"])
    assert client.post("/api/ai/search", json={"query": "사번으로 이름 찾아오기"}).json()["results"][0]["video_id"] == "2"
    assert client.post("/search", json={"query": "사번"}).status_code == 404  # 접두어 아래에만 붙는다
