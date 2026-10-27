"""질문 목록으로 검색 품질을 확인한다. .env의 SEARCH_PROVIDER 모드로 실행된다.

사용 (ai-search 폴더에서, 먼저 index_subtitles로 인덱싱): .venv\\Scripts\\python -m scripts.evaluate_search
--raw를 주면 MIN_SCORE를 0으로 두고 점수 분포만 본다 (기준 점수를 정할 때).

확인하는 것
- 관련 질문: 1위가 정답 영상인지, 정답 외에 몇 개를 더 보여주는지
- 답이 없는 질문: 결과를 하나도 보여주지 않는지. 엑셀이지만 영상이 없는 주제도 넣어서
  '엑셀'이라는 말만 보고 엉뚱한 영상을 내놓는지(할루시네이션처럼 보이는 결과) 확인한다
"""

import os
import sys
import time

if "--raw" in sys.argv:
    os.environ["MIN_SCORE"] = "0"

from ai_search import get_search_service  # noqa: E402
from ai_search.config import load_settings  # noqa: E402

# Gemini 무료 등급은 정제 모델을 분당 15번까지만 부를 수 있다. 한도에 걸리면 정제 없이 검색해 평가가 흔들리므로 간격을 둔다
GEMINI_SECONDS_PER_QUERY = 4.3

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
    # 업무와 상관없는 질문
    ("오늘 점심 메뉴 추천해줘", None),
    ("회의실 예약은 어떻게 해", None),
    ("연차 신청 방법 알려줘", None),
    ("파워포인트 슬라이드 디자인 바꾸기", None),
    # 엑셀이지만 샘플 영상이 없는 주제. 결과가 나오면 잘못 안내하는 것
    ("엑셀 파일에 암호 거는 방법", None),
    ("매크로로 반복 작업 자동으로 돌리기", None),
    ("엑셀로 꺾은선 차트 만들기", None),
    ("셀에 드롭다운 목록 만들기", None),
]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    settings = load_settings()
    print(f"모드: {settings.provider} / 컬렉션: {settings.collection} / MIN_SCORE: {settings.min_score} "
          f"/ 간격: {settings.relative_margin} / 정제 유사도 기준: {settings.refine_min_similarity}\n")
    pace = GEMINI_SECONDS_PER_QUERY if settings.provider == "gemini" and settings.gemini_refine else 0
    service = get_search_service()

    top1 = extra = false_alarm = refine_fail = 0
    related = [q for q, e in CASES if e]
    seconds = []
    print(f"{'결과':4} {'1위':>3} {'정답':>4} {'점수':>5} {'개수':>3} {'시간':>5}  질문 → 정제된 검색어")
    for query, expected in CASES:
        started = time.perf_counter()
        outcome = service.search(query, top_k=5)
        seconds.append(time.perf_counter() - started)
        results = outcome.results
        refine_fail += outcome.refined_query is None
        top = results[0] if results else None
        if expected is None:
            false_alarm += bool(results)
            mark = "O" if not results else "X"
        else:
            ok = top is not None and top.video_id == expected
            top1 += ok
            extra += sum(r.video_id != expected for r in results)
            mark = "O" if ok else "X"
        print(f"{mark:4} {top.video_id if top else '-':>3} {expected or '-':>4} {top.score if top else 0:5.3f} "
              f"{len(results):>3} {seconds[-1]:4.1f}s  {query} → {outcome.refined_query or '(정제 안 함)'}")
        time.sleep(max(0.0, pace - seconds[-1]))

    no_answer = len(CASES) - len(related)
    print(f"\n관련 질문 1위 정답: {top1}/{len(related)}")
    print(f"관련 질문에서 정답 외에 보여준 결과: 평균 {extra / len(related):.1f}개")
    print(f"답이 없는 질문에 결과를 보여줌: {false_alarm}/{no_answer}")
    print(f"정제 없이 원문으로만 검색 (정제 실패·한도·mock 모드): {refine_fail}/{len(CASES)}")
    print(f"검색 시간: 평균 {sum(seconds) / len(seconds):.1f}초 / 최대 {max(seconds):.1f}초")


if __name__ == "__main__":
    main()
