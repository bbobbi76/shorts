"""Verify the running demo against real MySQL and Gemini. Run from backend.

Only run against the dedicated demo DB: temporary visibility changes are restored.
No credentials or API keys are included in the JSON report.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from sqlalchemy import select, text
from app.config import DB_NAME, INITIAL_ADMIN_PASSWORD
from app.database import SessionLocal, engine
from app.models import Content, Practice

if DB_NAME != "workfit_jimin_week6_demo":
    raise SystemExit("This check is restricted to workfit_jimin_week6_demo.")

report = {"database": DB_NAME, "checks": {}}
out = Path(__file__).resolve().parents[1] / "docs/WEEK6_LIVE_VERIFICATION.json"


def require(response, expected=200):
    assert response.status_code == expected, (response.status_code, response.text[:400])
    return response


with httpx.Client(base_url="http://127.0.0.1:8000", timeout=90) as client:
    require(client.get("/api/health"))
    courses = require(client.get("/api/ui/courses")).json()
    contents = require(client.get("/api/ui/contents")).json()
    assert len(courses) == 3 and len(contents) == 12
    report["checks"]["public_counts"] = {"courses": len(courses), "contents": len(contents)}
    file_ids = set()
    for item in courses + contents:
        for kind in ("thumbnail", "video", "practice", "resource"):
            media = item.get(kind)
            if media:
                file_ids.add(media["id"])
    for mid in sorted(file_ids, key=int):
        response = require(client.get(f"/api/ui/media/{mid}/file"))
        assert response.content
    assert len(file_ids) == 38
    video_id = next(item["video"]["id"] for item in contents if item.get("video"))
    response = require(client.get(f"/api/ui/media/{video_id}/file", headers={"Range": "bytes=0-15"}), 206)
    assert len(response.content) == 16
    report["checks"]["files"] = {"downloaded": len(file_ids), "video_range": "206/16 bytes"}
    assert all("practiceSettings" not in item and "quiz" not in item for item in contents)
    assert sum(item.get("practiceId") is not None for item in contents) == 11
    login = require(client.post("/api/ui/auth/login", json={"email": "admin@workfit.dev", "password": INITIAL_ADMIN_PASSWORD}))
    require(client.get("/api/ui/admin/contents"))
    report["checks"]["admin_login"] = "passed"

    for query, expected_word in [("사번으로 이름 찾고 싶어", "VLOOKUP"), ("이번 달 부서별 매출 합치려면?", None), ("오늘 점심 메뉴 추천해줘", "EMPTY")]:
        data = require(client.post("/api/ai/search", json={"query": query, "top_k": 5})).json()
        ids = [row["video_id"] for row in data["results"]]
        titles = [item["title"] for item in contents if item["id"] in ids]
        if expected_word == "EMPTY":
            assert not ids, titles
        else:
            assert ids, query
            if expected_word:
                assert any(expected_word in title for title in titles), titles
        report["checks"].setdefault("search", []).append({"query": query, "titles": titles})

    with SessionLocal() as db:
        practice = db.scalar(select(Practice).join(Content).where(Practice.required_function == "SUMIF", Content.status == "PUBLISHED"))
        pid, cid, formula = practice.id, practice.content_id, practice.answer_formula
        content = db.get(Content, cid)
        course_id, content_file = content.course_id, content.video_file_id
    data = require(client.post("/api/ai/feedback", json={"practice_id": pid, "learner_answer": formula})).json()
    assert data["status"] == "correct" and data["score"] == 100, data
    report["checks"]["feedback"] = {"practice_id": pid, "status": data["status"], "score": data["score"]}
    for table, column, ident in [("contents", "content_id", cid), ("courses", "course_id", course_id)]:
        with engine.begin() as conn:
            conn.execute(text(f"UPDATE {table} SET status='HIDDEN' WHERE {column}=:id"), {"id": ident})
        try:
            require(client.get(f"/api/ui/contents/{cid}"), 404)
            require(client.get(f"/api/ui/media/{content_file}/file"), 404)
            require(client.post("/api/ai/feedback", json={"practice_id": pid, "learner_answer": formula}), 404)
            results = require(client.post("/api/ai/search", json={"query": "영업팀 매출 조건별 합계", "top_k": 20})).json()["results"]
            assert str(cid) not in [row["video_id"] for row in results]
        finally:
            with engine.begin() as conn:
                conn.execute(text(f"UPDATE {table} SET status='PUBLISHED' WHERE {column}=:id"), {"id": ident})
        report["checks"][f"hidden_{table}"] = "content, file, feedback, search blocked; restored"
    assert len(require(client.get("/api/ui/contents")).json()) == 12
    report["result"] = "passed"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
