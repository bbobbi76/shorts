"""질문 목록으로 검색 품질을 확인하고 MIN_SCORE 기준을 정한다. .env의 SEARCH_PROVIDER 모드로 실행된다.

사용 (ai-search 폴더에서, 먼저 index_subtitles로 인덱싱): .venv\\Scripts\\python -m scripts.evaluate_search
점수 분포를 보려고 MIN_SCORE를 0으로 두고 검색한다.
"""

import os
import sys

os.environ["MIN_SCORE"] = "0"

from ai_search import get_search_service  # noqa: E402
from ai_search.config import DEFAULT_MIN_SCORE, load_settings  # noqa: E402

# (질문, 정답 영상 ID). 함수 이름 없이 업무 상황으로 묻는다. None은 관련 영상이 없어야 하는 질문
CASES = [
    ("이번 달 부서별 매출 합치려면?", "1"),
    ("영업팀 실적만 따로 더하고 싶어", "1"),
    ("사번으로 다른 시트에서 이름 가져오기", "2"),
    ("직원 명단에 부서를 자동으로 채우고 싶어", "2"),
    ("판매 데이터를 월별로 한눈에 정리하고 싶어", "3"),
    ("수천 줄 데이터를 부서별로 요약해서 보고하려면", "3"),
    ("영업팀이면서 3월 매출만 더하려면", "4"),
    ("기간이랑 부서 두 가지 조건으로 합계 내기", "4"),
    ("지각한 사람이 몇 명인지 세기", "5"),
    ("80점 넘은 사람 수 구하기", "5"),
    ("고객 명단에 같은 사람이 여러 번 들어가 있어", "6"),
    ("겹치는 데이터 지우기", "6"),
    ("한 칸에 이름이랑 부서가 쉼표로 붙어 있어", "7"),
    ("주소에서 시만 따로 뽑고 싶어", "7"),
    ("주말 빼고 프로젝트 기간이 며칠인지", "8"),
    ("입사일로 근속 연수 계산하기", "8"),
    ("목표 넘으면 달성 못 넘으면 미달로 표시", "9"),
    ("점수에 따라 등급을 자동으로 매기고 싶어", "9"),
    ("수식에 샵 N/A가 떠요", "10"),
    ("0으로 나눴다는 오류가 나와", "10"),
    ("목표 못 채운 사람만 빨간색으로 표시하고 싶어", "11"),  # SRT 파일 자막
    ("숫자 크기를 막대로 비교해서 보고 싶어", "11"),
    ("스크롤 내리면 맨 위 제목 줄이 안 보여", "12"),  # SMI 파일 자막
    ("인쇄할 때 모든 페이지에 제목 넣기", "12"),
    ("오늘 점심 메뉴 추천해줘", None),
    ("회의실 예약은 어떻게 해", None),
    ("연차 신청 방법 알려줘", None),
    ("파워포인트 슬라이드 디자인 바꾸기", None),
]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    settings = load_settings()
    print(f"모드: {settings.provider} / 컬렉션: {settings.collection}\n")
    service = get_search_service()

    related, unrelated, correct = [], [], 0
    print(f"{'결과':4} {'점수':>5}  {'1위':>3} {'정답':>4}  질문 → 정제된 검색어")
    for query, expected in CASES:
        outcome = service.search(query, top_k=3)
        top = outcome.results[0] if outcome.results else None
        score = top.score if top else 0.0
        if expected is None:
            unrelated.append(score)
            mark = "-"
        else:
            related.append(score)
            ok = top is not None and top.video_id == expected
            correct += ok
            mark = "O" if ok else "X"
        top_id = top.video_id if top else "-"
        print(f"{mark:4} {score:5.3f}  {top_id:>3} {expected or '-':>4}  {query} → {outcome.refined_query or '(정제 안 함)'}")

    print(f"\n관련 질문 1위 정답: {correct}/{len(related)}")
    print(f"관련 질문 1위 점수: 최저 {min(related):.3f} / 최고 {max(related):.3f}")
    print(f"관련 없는 질문 1위 점수: 최고 {max(unrelated):.3f}")
    print(f"현재 기본 MIN_SCORE: {DEFAULT_MIN_SCORE[settings.provider]}")


if __name__ == "__main__":
    main()
