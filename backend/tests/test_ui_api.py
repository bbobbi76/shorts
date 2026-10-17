"""실제 MySQL 자격증명 없이 API 계약·권한·트랜잭션을 검증하는 SQLite 테스트.

MySQL의 ENUM/FULLTEXT 검증은 별도 MySQL 실행이 필요합니다.
"""
import io
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, Integer, create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import files, ui_api
from app.auth import hash_password
from app.database import Base, get_db
from app.main import app
from app.models import Category, Content, Course, StoredFile, User
from app.ui_api import UiRecord


@pytest.fixture
def env(tmp_path, monkeypatch):
    # SQLite는 INTEGER PK에만 자동 증가를 적용합니다. 테스트 메타데이터만 조정합니다.
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, BigInteger):
                col.type = BigInteger().with_variant(Integer, "sqlite")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def enable_fk(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([User(id=1, email="admin@test.local", password_hash=hash_password("testpass"), name="관리자", role="ADMIN"),
                    User(id=2, email="member@test.local", password_hash=hash_password("testpass"), name="회원", role="USER"),
                    Category(id=1, name="엑셀", category_type="COMMON")])
        db.commit()
    def override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override
    monkeypatch.setattr(ui_api, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(files, "UPLOAD_DIR", tmp_path)
    ui_api.sessions.clear()
    client = TestClient(app)  # lifespan은 MySQL에 접속하므로 이 테스트에서 실행하지 않습니다.
    yield client, factory, tmp_path
    app.dependency_overrides.clear()
    ui_api.sessions.clear()
    engine.dispose()


def login(client):
    r = client.post("/api/ui/auth/login", json={"email": "admin@test.local", "password": "testpass"})
    assert r.status_code == 200, r.text
    return {"X-CSRF-Token": r.json()["csrfToken"]}


def course(client, headers):
    body = {"id": str(uuid.uuid4()), "title": "엑셀 과정", "description": "소개", "objective": "합계를 구한다", "topic": "엑셀", "job": "인사", "level": "기초"}
    r = client.post("/api/ui/admin/courses", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json(), body


def draft(cid):
    return {"id": str(uuid.uuid4()), "courseId": cid, "title": "SUMIF", "objective": "조건 합계",
            "quiz": {"question": "함수?", "options": ["SUMIF", "COUNT"], "correctIndex": 0, "explanation": "조건별 합계"},
            "practiceText": "예제 실습", "status": "PUBLISHED"}


def test_auth_csrf_roles_and_logout(env):
    c, _, _ = env
    assert c.get("/api/ui/admin/courses").status_code == 401
    assert c.post("/api/ui/auth/login", json={"email": "member@test.local", "password": "testpass"}).status_code == 403
    assert c.post("/api/ui/auth/login", json={"email": "admin@test.local", "password": "testpass"}, headers={"Origin": "https://bad.example"}).status_code == 403
    h = login(c)
    assert "HttpOnly" in c.cookies.jar._cookies["testserver.local"]["/api/ui"]["workfit_session"]._rest
    assert c.get("/api/ui/auth/session").status_code == 200
    assert c.post("/api/ui/admin/courses", json={"id": "x", "title": "x"}).status_code == 403
    assert c.post("/api/ui/auth/logout", headers=h).status_code == 204
    assert c.get("/api/ui/auth/session").status_code == 401


def test_course_roundtrip_and_idempotency(env):
    c, factory, _ = env
    h = login(c)
    saved, body = course(c, h)
    assert saved["job"] == "인사"
    assert c.post("/api/ui/admin/courses", json=body, headers=h).json()["id"] == saved["id"]
    body["title"] = "수정 과정"
    r = c.patch(f'/api/ui/admin/courses/{saved["id"]}', json=body, headers=h)
    assert r.status_code == 200
    assert c.get(f'/api/ui/admin/courses/{saved["id"]}').json()["title"] == "수정 과정"
    with factory() as db:
        assert len(list(db.scalars(select(Course)))) == 1


def test_draft_publish_privacy_and_rollback(env):
    c, factory, path = env
    h = login(c)
    co, _ = course(c, h)
    body = draft(co["id"])
    r = c.post("/api/ui/admin/contents", json=body, headers=h)
    assert r.status_code == 201, r.text
    saved = r.json()
    assert saved["status"] == "DRAFT"  # 요청 body로 공개 우회 불가
    cid = saved["id"]
    assert c.get(f"/api/ui/contents/{cid}").status_code == 404
    assert c.post(f"/api/ui/admin/contents/{cid}/publish", headers=h).status_code == 422
    with factory() as db:
        f = StoredFile(file_type="VIDEO", original_name="test.mp4", stored_path="test.mp4", mime_type="video/mp4", size_bytes=10, uploaded_by=1)
        db.add(f)
        db.flush()
        mid = str(f.id)
        db.add(UiRecord(kind="media", owner_id=1, request_key=mid, native_id=f.id, payload={"duration": 60}))
        db.commit()
    (path / "test.mp4").write_bytes(b"0123456789")
    body["video"] = {"id": mid, "duration": 9999, "name": "조작.mp4"}
    r = c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["video"]["duration"] == 60
    assert c.post(f"/api/ui/admin/contents/{cid}/publish", headers=h).status_code == 200
    public = c.get(f"/api/ui/contents/{cid}").json()
    assert "quiz" not in public and "status" not in public
    body["quiz"]["explanation"] = ""
    assert c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h).status_code == 422
    assert c.get(f"/api/ui/admin/contents/{cid}").json()["quiz"]["explanation"] == "조건별 합계"
    r = c.get(f"/api/ui/media/{mid}/file", headers={"Range": "bytes=2-5"})
    assert r.status_code == 206 and r.content == b"2345"
    assert c.post(f"/api/ui/admin/contents/{cid}/unpublish", headers=h).json()["status"] == "PRIVATE"
    assert c.get(f"/api/ui/media/{mid}/file").status_code == 404
    assert c.get("/files/test.mp4").status_code == 404


def test_file_validation_and_protection(env):
    c, factory, path = env
    h = login(c)
    r = c.post("/api/ui/admin/media", data={"kind": "resource"}, files={"file": ("sample.txt", b"hello", "text/plain")}, headers=h)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    assert c.get(f"/api/ui/admin/media/{mid}/file").content == b"hello"
    assert c.get(f"/api/ui/media/{mid}/file").status_code == 404
    bad = c.post("/api/ui/admin/media", data={"kind": "video"}, files={"file": ("fake.mp4", b"not mp4", "video/mp4")}, headers=h)
    assert bad.status_code == 422
    with factory() as db:
        assert len(list(db.scalars(select(StoredFile)))) == 1
    c.post("/api/ui/auth/logout", headers=h)
    assert c.get(f"/api/ui/admin/media/{mid}/file").status_code == 401


def test_blank_draft_can_be_saved_then_attached_to_course(env):
    c, factory, _ = env
    h = login(c)
    body = {"id": str(uuid.uuid4()), "title": "", "courseId": ""}
    r = c.post("/api/ui/admin/contents", json=body, headers=h)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert c.get(f"/api/ui/admin/contents/{cid}").status_code == 200
    assert c.post(f"/api/ui/admin/contents/{cid}/publish", headers=h).status_code == 422
    assert c.post("/api/ui/admin/contents", json=body, headers=h).json()["id"] == cid
    co, _ = course(c, h)
    body.update(courseId=co["id"], title="초안 완성")
    r = c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h)
    assert r.status_code == 200, r.text
    assert c.get(f"/api/ui/admin/contents/{cid}").json()["title"] == "초안 완성"
    with factory() as db:
        assert len(list(db.scalars(select(Content)))) == 1


def test_disabled_admin_session_is_rejected(env):
    c, factory, _ = env
    login(c)
    with factory() as db:
        db.get(User, 1).status = "SUSPENDED"
        db.commit()
    assert c.get("/api/ui/admin/courses").status_code == 403


def test_real_silent_mp4_upload_gets_server_duration(env):
    from pathlib import Path
    c, _, _ = env
    h = login(c)
    sample = Path(__file__).resolve().parents[2] / "frontend/public/demo-sample.mp4"
    if not sample.exists():
        sample = Path(__file__).resolve().parents[2] / "Front/public/demo-sample.mp4"
    with sample.open("rb") as f:
        r = c.post("/api/ui/admin/media", data={"kind": "video"}, files={"file": ("silent.mp4", f, "video/mp4")}, headers=h)
    assert r.status_code == 201, r.text
    assert 0 < r.json()["duration"] < 60
