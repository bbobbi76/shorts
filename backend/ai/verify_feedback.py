"""Safe diagnostics and opt-in external verification. Never prints secrets."""
import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import platform


def load_feedback_env():
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env", override=False)
    load_dotenv(root / "backend" / ".env", override=False)


def environment_report():
    load_feedback_env()
    versions = {}
    for package in ("SQLAlchemy", "PyMySQL", "python-dotenv", "google-genai", "fastapi", "pytest"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = "not_installed"
    return dict(python=platform.python_version(), packages=versions,
        gemini_key_present=bool(os.getenv("GEMINI_API_KEY", "").strip()),
        mysql_explicit_config_present=all(os.getenv(k) for k in ("DB_HOST","DB_NAME","DB_USER","DB_PASSWORD")),
        mysql_connection="not_verified")


def verify_live():
    from .ai_feedback import evaluate_gemini
    from .demo_service import load_evaluation_set, prepare_demo
    from .schemas import FeedbackResponse, PracticeFeedbackRequest

    if not os.getenv("GEMINI_API_KEY", "").strip():
        return {"external_api":"not_verified", "reason":"GEMINI_API_KEY_not_set", "cases":[]}
    results = []
    for case in load_evaluation_set()["cases"]:
        request = prepare_demo(PracticeFeedbackRequest(practice_id=case["practice_id"], learner_answer=case["answer"]))
        if isinstance(request, FeedbackResponse):
            results.append(dict(case=case["id"], external_call=False, status=request.status,
                                passed=request.status==case["status"]))
            continue
        try:
            response = evaluate_gemini(request)
            results.append(dict(case=case["id"], external_call=True, status=response.status, score=response.score,
                passed=(response.status,response.score)==(case["status"],case["score"])))
        except Exception as exc:
            # Exception messages/URLs may contain credentials: report type only.
            results.append(dict(case=case["id"], external_call=True, passed=False, error_type=type(exc).__name__))
    return dict(external_api="attempted", cases=results)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Call Gemini if a key is present; may incur charges")
    parser.add_argument("--require-db", action="store_true", help="Exit nonzero if DB dependencies are missing")
    args = parser.parse_args()
    report = environment_report()
    report["gemini_verification"] = verify_live() if args.live else {"external_api":"not_verified","reason":"not_requested"}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.require_db and any(report["packages"][p]=="not_installed" for p in ("SQLAlchemy","PyMySQL","python-dotenv")):
        return 1
    if args.live and any(not c["passed"] for c in report["gemini_verification"]["cases"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
