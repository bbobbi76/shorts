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
    body = {"id": str(uuid.uuid4()), "title": "엑셀 과정", "summary": "소개", "learningGoal": "합계를 구한다", "categoryId": "1", "level": "BASIC"}
    r = client.post("/api/ui/admin/courses", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json(), body


def draft(cid):
    return {"id": str(uuid.uuid4()), "courseId": cid, "title": "SUMIF", "learningGoal": "조건 합계",
            "quiz": {"question": "함수?", "options": ["SUMIF", "COUNT"], "correctIndex": 0, "explanation": "조건별 합계"},
            "practiceText": "예제 실습", "status": "DRAFT"}


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
    assert saved["summary"] == "소개"
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
    # 콘텐츠 공개와 과정 공개는 분리합니다.
    assert c.get(f"/api/ui/contents/{cid}").status_code == 404
    course_body = {"id": co["id"], "title": co["title"], "summary": co["summary"],
                   "learningGoal": co["learningGoal"], "categoryId": co["categoryId"],
                   "level": co["level"], "status": "PUBLISHED"}
    assert c.patch(f'/api/ui/admin/courses/{co["id"]}', json=course_body, headers=h).status_code == 200
    public = c.get(f"/api/ui/contents/{cid}").json()
    assert "quiz" not in public and "status" not in public
    body["status"] = "PUBLISHED"
    body["quiz"]["explanation"] = ""
    assert c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h).status_code == 422
    assert c.get(f"/api/ui/admin/contents/{cid}").json()["quiz"]["explanation"] == "조건별 합계"
    r = c.get(f"/api/ui/media/{mid}/file", headers={"Range": "bytes=2-5"})
    assert r.status_code == 206 and r.content == b"2345"
    assert c.post(f"/api/ui/admin/contents/{cid}/unpublish", headers=h).json()["status"] == "HIDDEN"
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


def test_credentialed_cors_and_preflight(env):
    from app.config import FRONTEND_ORIGIN
    c, _, _ = env
    headers = {"Origin": FRONTEND_ORIGIN}
    response = c.post("/api/ui/auth/login", headers=headers,
                      json={"email": "admin@test.local", "password": "testpass"})
    assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    response = c.options("/api/ui/admin/courses", headers={**headers,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token,idempotency-key"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-credentials"] == "true"
    assert c.options("/api/ui/admin/courses", headers={
        "Origin": "https://bad.example", "Access-Control-Request-Method": "POST"}).status_code == 400


def test_openapi_documents_response_and_error_contract(env):
    c, _, _ = env
    schema = c.get("/openapi.json").json()
    operation = schema["paths"]["/api/ui/admin/contents"]["post"]
    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("/ContentBody")
    assert operation["responses"]["201"]["content"]["application/json"]["schema"]["$ref"].endswith("/ContentOut")
    assert operation["responses"]["400"]["content"]["application/json"]["schema"]["$ref"].endswith("/ErrorOut")
    assert "quiz" not in schema["components"]["schemas"]["PublicContentOut"]["properties"]


def test_latest_front_fields_roundtrip_and_removal(env):
    from app.models import Skill, Subtitle, Quiz, Practice
    c, factory, _ = env
    h = login(c)
    co, cb = course(c, h)
    cb["level"] = "INTRO"
    assert c.patch(f'/api/ui/admin/courses/{co["id"]}', json=cb, headers=h).json()["level"] == "INTRO"
    with factory() as db:
        db.add(Skill(id=1, category_id=1, name="함수", description="조건 함수"))
        db.commit()
    tag = c.post("/api/ui/admin/tags", headers=h, json={"id": "tag-uuid", "name": "조건합계", "tagType": "FUNCTION", "synonyms": ["SUMIF"]}).json()
    resource = c.post("/api/ui/admin/resources", headers=h, json={"id": "resource-uuid", "title": "프롬프트", "resourceType": "PROMPT", "promptText": "합계를 설명해 주세요", "status": "PUBLISHED"}).json()
    body = draft(co["id"])
    body.update(status="REVIEW", workUse="매출 집계", sortOrder=3,
        tagIds=[tag["id"]], skillIds=["1"], resourceIds=[resource["id"]],
        practiceSettings={"title": "합계 실습", "expectedResult": "120", "resultType": "NUMBER", "tolerance": 0.01, "requiredFunction": "SUMIF", "answerFormula": "=SUMIF(A:A,1,B:B)"},
        optionFeedbacks=[{"feedback": "조건 합계입니다", "feedbackSource": "ADMIN", "rewatchSec": 4}, {"feedback": "개수 함수입니다", "feedbackSource": "ADMIN", "rewatchSec": None}],
        subtitles=[{"id": "subtitle-uuid", "startSec": 0, "endSec": 3.25, "text": "조건 합계를 구합니다"}])
    r = c.post("/api/ui/admin/contents", json=body, headers=h)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    saved = c.get(f"/api/ui/admin/contents/{cid}").json()
    for key in ["status", "learningGoal", "workUse", "sortOrder", "tagIds", "skillIds", "resourceIds", "practiceSettings", "optionFeedbacks"]:
        assert saved[key] == body[key], key
    assert saved["subtitles"][0]["text"] == body["subtitles"][0]["text"]
    with factory() as db:
        assert db.get(Content, int(cid)).status == "REVIEW"
        assert db.scalar(select(Practice)).expected_result == "120"
        assert db.scalar(select(Subtitle)).caption_text == "조건 합계를 구합니다"
        assert db.scalar(select(Quiz)).options[0].rewatch_sec == 4
    assert c.get(f"/api/ui/contents/{cid}").status_code == 404
    body.update(tagIds=[], skillIds=[], resourceIds=[], subtitles=[], optionFeedbacks=[{"feedback": "", "rewatchSec": None}] * 2,
                practiceText="", practiceSettings={})
    r = c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h)
    assert r.status_code == 200, r.text
    for key in ["tagIds", "skillIds", "resourceIds", "subtitles"]:
        assert r.json()[key] == []
    assert r.json()["practiceSettings"]["expectedResult"] == ""
    assert r.json()["optionFeedbacks"][0]["feedbackSource"] == "NONE"


def test_catalog_uses_existing_cookie_csrf_and_supports_updates(env):
    c, _, _ = env
    tag = {"id": "tag-a", "name": "함수", "tagType": "FUNCTION", "synonyms": ["함수검색"]}
    assert c.get("/api/ui/admin/catalog").status_code == 401
    assert c.post("/api/ui/admin/tags", json=tag).status_code == 401
    h = login(c)
    assert c.post("/api/ui/admin/tags", json=tag).status_code == 403
    saved = c.post("/api/ui/admin/tags", json=tag, headers=h).json()
    assert c.post("/api/ui/admin/tags", json=tag, headers=h).json()["id"] == saved["id"]
    saved["synonyms"] = ["수식검색"]
    assert c.post("/api/ui/admin/tags", json=saved, headers=h).json()["synonyms"] == ["수식검색"]
    assert c.post("/api/ui/admin/tags", json={**tag, "id": "another"}, headers=h).status_code == 409
    resource = {"id": "resource-a", "title": "자료", "resourceType": "PROMPT", "promptText": "질문", "status": "DRAFT"}
    assert c.post("/api/ui/admin/resources", json=resource).status_code == 403
    r = c.post("/api/ui/admin/resources", json=resource, headers=h)
    assert r.status_code == 200, r.text
    resource.update(id=r.json()["id"], title="수정 자료", status="HIDDEN")
    assert c.post("/api/ui/admin/resources", json=resource, headers=h).json()["title"] == "수정 자료"
    catalog = c.get("/api/ui/admin/catalog").json()
    assert len(catalog["tags"]) == 1 and len(catalog["resources"]) == 1
    c.post("/api/ui/auth/logout", headers=h)
    assert c.get("/api/ui/admin/catalog").status_code == 401


def test_invalid_connections_and_subtitles_do_not_change_saved_data(env):
    c, _, _ = env
    h = login(c)
    co, _ = course(c, h)
    body = draft(co["id"])
    cid = c.post("/api/ui/admin/contents", json=body, headers=h).json()["id"]
    body.update(title="바뀌면 안 됨", tagIds=["999"])
    assert c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h).status_code == 404
    body.update(tagIds=[], subtitles=[{"id": "s", "startSec": 5, "endSec": 2, "text": "역전"}])
    assert c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h).status_code == 422
    assert c.get(f"/api/ui/admin/contents/{cid}").json()["title"] == "SUMIF"


def test_unassigned_review_draft_keeps_new_fields_when_attached(env):
    c, _, _ = env
    h = login(c)
    body = draft("")
    body.update(status="REVIEW", workUse="검수 업무", subtitles=[{"id": "s", "startSec": 0, "endSec": 1, "text": "안내"}])
    r = c.post("/api/ui/admin/contents", json=body, headers=h)
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert c.get(f"/api/ui/admin/contents/{cid}").json()["status"] == "REVIEW"
    co, _ = course(c, h)
    body["courseId"] = co["id"]
    r = c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REVIEW" and r.json()["workUse"] == "검수 업무"
    assert r.json()["subtitles"][0]["text"] == "안내"


def test_public_resources_and_private_answers_are_filtered(env):
    from pathlib import Path
    c, _, _ = env
    h = login(c)
    co, cb = course(c, h)
    sample = Path(__file__).resolve().parents[2] / "Front/public/demo-sample.mp4"
    with sample.open("rb") as f:
        uploaded = c.post("/api/ui/admin/media", data={"kind": "video"}, files={"file": ("sample.mp4", f, "video/mp4")}, headers=h)
    assert uploaded.status_code == 201
    resources = []
    files = []
    for status in ("PUBLISHED", "HIDDEN"):
        asset = c.post("/api/ui/admin/media", data={"kind": "resource"}, files={"file": ("data.txt", b"resource", "text/plain")}, headers=h).json()
        files.append(asset)
        saved = c.post("/api/ui/admin/resources", json={"id": str(uuid.uuid4()), "title": status, "resourceType": "TEMPLATE", "file": asset, "status": status}, headers=h)
        assert saved.status_code == 200, saved.text
        resources.append(saved.json())
    body = draft(co["id"])
    body.update(video=uploaded.json(), resourceIds=[r["id"] for r in resources],
        practiceSettings={"expectedResult": "secret-answer", "resultType": "TEXT", "answerFormula": "secret-formula"},
        subtitles=[{"id": "s", "startSec": 0, "endSec": 1, "text": "공개 자막"}])
    saved = c.post("/api/ui/admin/contents", json=body, headers=h)
    assert saved.status_code == 201, saved.text
    cid = saved.json()["id"]
    assert c.post(f"/api/ui/admin/contents/{cid}/publish", headers=h).status_code == 200
    cb["status"] = "PUBLISHED"
    assert c.patch(f'/api/ui/admin/courses/{co["id"]}', json=cb, headers=h).status_code == 200
    public = c.get(f"/api/ui/contents/{cid}")
    assert public.status_code == 200
    assert "secret-answer" not in public.text and "secret-formula" not in public.text
    assert not {"quiz", "optionFeedbacks", "practiceSettings"} & public.json().keys()
    assert [r["id"] for r in public.json()["resources"]] == [resources[0]["id"]]
    assert public.json()["subtitles"][0]["text"] == "공개 자막"
    assert c.get(f'/api/ui/media/{files[0]["id"]}/file').status_code == 200
    assert c.get(f'/api/ui/media/{files[1]["id"]}/file').status_code == 404
    body["subtitles"][0]["endSec"] = uploaded.json()["duration"] + 1
    assert c.patch(f"/api/ui/admin/contents/{cid}", json=body, headers=h).status_code == 422


def test_legacy_unassigned_draft_can_still_be_opened(env):
    c, factory, _ = env
    login(c)
    with factory() as db:
        db.add(UiRecord(kind="content", owner_id=1, request_key="legacy", native_id=None,
            payload={"id": "legacy", "courseId": "", "title": "예전 초안", "objective": "목표", "status": "DRAFT",
                     "quiz": {"question": "", "options": ["", ""], "correctIndex": -1, "explanation": ""}, "updatedAt": ""}))
        db.commit()
    r = c.get("/api/ui/admin/contents/legacy")
    assert r.status_code == 200, r.text
    assert r.json()["learningGoal"] == "목표" and len(r.json()["optionFeedbacks"]) == 2
    assert c.get("/api/ui/admin/contents").status_code == 200


@pytest.mark.parametrize("phase", ["flush", "commit"])
def test_upload_db_failure_removes_disk_file_and_rolls_back(env, monkeypatch, phase):
    c, factory, path = env
    h = login(c)
    client = TestClient(app, raise_server_exceptions=False)
    client.cookies.update(c.cookies)
    def fail(*args, **kwargs):
        raise RuntimeError("simulated database failure")
    with monkeypatch.context() as patch:
        patch.setattr(factory.class_, phase, fail)
        r = client.post("/api/ui/admin/media", data={"kind": "resource"},
                        files={"file": ("test.txt", b"keep no orphan", "text/plain")}, headers=h)
    assert r.status_code == 500
    assert not [p for p in path.rglob("*") if p.is_file()]
    with factory() as db:
        assert list(db.scalars(select(StoredFile))) == []
    # 다음 업로드가 정상 동작하는지도 확인합니다.
    assert c.post("/api/ui/admin/media", data={"kind": "resource"},
                  files={"file": ("ok.txt", b"ok", "text/plain")}, headers=h).status_code == 201


def test_video_metadata_failure_is_one_transaction(env):
    from pathlib import Path
    c, factory, path = env
    h = login(c)
    client = TestClient(app, raise_server_exceptions=False)
    client.cookies.update(c.cookies)
    def fail(*args):
        raise RuntimeError("simulated media metadata failure")
    event.listen(UiRecord, "before_insert", fail)
    try:
        sample = Path(__file__).resolve().parents[2] / "Front/public/demo-sample.mp4"
        with sample.open("rb") as f:
            r = client.post("/api/ui/admin/media", data={"kind": "video"},
                files={"file": ("sample.mp4", f, "video/mp4")}, headers=h)
    finally:
        event.remove(UiRecord, "before_insert", fail)
    assert r.status_code == 500
    assert not [p for p in path.rglob("*") if p.is_file()]
    with factory() as db:
        assert list(db.scalars(select(StoredFile))) == []
        assert list(db.scalars(select(UiRecord))) == []


def test_stream_read_failure_removes_partial_file(env):
    from fastapi import UploadFile
    _, factory, path = env
    class BrokenReader(io.BytesIO):
        def read(self, size=-1):
            if self.tell():
                raise OSError("simulated stream interruption")
            return super().read(2)
    with factory() as db:
        with pytest.raises(OSError, match="stream interruption"):
            files.upload(UploadFile(file=BrokenReader(b"partial"), filename="broken.txt"), "RESOURCE", 1, db)
    assert not [p for p in path.rglob("*") if p.is_file()]


def test_failed_upload_does_not_delete_existing_file(env, monkeypatch):
    from fastapi import UploadFile
    _, factory, path = env
    monkeypatch.setattr(files.uuid, "uuid4", lambda: "existing")
    target = path / "resource" / "existing.txt"
    target.parent.mkdir()
    target.write_bytes(b"original")
    with factory() as db:
        with pytest.raises(FileExistsError):
            files.upload(UploadFile(file=io.BytesIO(b"replacement"), filename="file.txt"), "RESOURCE", 1, db)
    assert target.read_bytes() == b"original"


def test_metadata_lists_use_cookie_auth_and_database_ids(env):
    from app.models import Skill
    c, factory, _ = env
    assert c.get("/api/ui/admin/categories").status_code == 401
    assert c.get("/api/ui/admin/skills").status_code == 401
    login(c)
    with factory() as db:
        db.add(Category(id=2, name="문서 작성", category_type="COMMON"))
        db.add(Skill(id=1, category_id=1, name="함수", description="조건 함수"))
        db.commit()
    assert c.get("/api/ui/admin/categories").json()[0] == {"id": "1", "name": "엑셀", "categoryType": "COMMON"}
    assert c.get("/api/ui/admin/skills?categoryId=1").json()[0]["categoryId"] == "1"
    assert c.get("/api/ui/admin/skills?categoryId=2").json() == []
    assert c.get("/api/ui/admin/skills?categoryId=999").status_code == 404
