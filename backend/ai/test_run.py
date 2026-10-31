"""Run offline examples (default) or live Gemini with --live."""
import argparse
import json
from pathlib import Path
from .schemas import FeedbackRequest
from .mock_feedback import evaluate_mock
from .ai_feedback import evaluate_answer

EXAMPLE = Path(__file__).with_name("example_request.json")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Use real Gemini API (may incur charges)")
    args = parser.parse_args()
    request = FeedbackRequest.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    if args.live:
        print("[LIVE Gemini feedback; actual model response]")
        result = evaluate_answer(request)
    else:
        print("[MOCK - example feedback, NOT an AI evaluation]")
        result = evaluate_mock(request)
    print(result.model_dump_json(indent=2))

if __name__ == "__main__":
    main()
