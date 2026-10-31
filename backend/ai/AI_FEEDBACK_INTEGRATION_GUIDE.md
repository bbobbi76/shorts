# WorkFit AI 피드백 연동 안내

작성자: 전세현 · AI 피드백 담당  
작성일: 2026-10-31  
대상: 현지민님(백엔드), 박서빈님(프론트엔드)

## 1. 현재 연동 상태

메인 `backend/app/main.py`에는 AI 피드백 라우터가 등록되어 있습니다.
실제 평가 API는 과제 ID로 서버 DB를 조회하도록 구현되어 있습니다.
그러나 **이번 환경에서는 실제 DB 조회 및 Gemini 외부 호출 성공을 확인하지 못했습니다.**
사용자 페이지의 실습 제출 버튼 연결도 미구현 상태이며, 아래 프론트엔드 코드는 연동 예시입니다.

| 구분 | 확인 결과 |
| --- | --- |
| API 요청·오류 처리, 대체 제공자 응답 검증 | 자동 테스트 통과 |
| SUMIF·SUMIFS·IF 구조 평가 및 보류 | 로컬 고정 평가 세트로 확인 |
| Mock | API 및 데모 테스트 통과 |
| SQLite ORM 조회 | SQLAlchemy 미설치로 통합 테스트 모듈 건너뜀 |
| 실제 MySQL 조회 | 명시적 연결 설정 없음, 미검증 |
| 실제 Gemini 호출 | API 키 없음, 호출하지 않음 |
| 독립 데모 JS | DOM/fetch 대체 환경의 상호작용 검사 통과 |
| 실제 브라우저 렌더링·사용자 페이지 제출 연결 | 미검증 / 추후 연동 예정 |

## 2. 엔드포인트

호스트와 포트는 실행 환경에 따라 지정합니다. 경로와 HTTP 메서드는 다음과 같습니다.

| 메서드 | 경로 | 용도 | 등록 위치 |
| --- | --- | --- | --- |
| POST | `/api/ai/feedback` | DB 기준으로 실제 AI 평가 | 메인 백엔드·독립 앱 |
| POST | `/api/ai/feedback/mock` | 기존 고정 점수 Mock | 메인 백엔드·독립 앱 |
| POST | `/api/ai/demo/feedback?mode=rubric` | 서버 고정 과제의 구조 루브릭 데모 | 독립 앱만 |
| POST | `/api/ai/demo/feedback?mode=gemini` | 서버 고정 과제 + Gemini 교차 확인 | 독립 앱만 |
| GET | `/demo` | AI 담당 독립 데모 화면 | 독립 앱만 |

`mode` 쿼리는 데모 API에만 있습니다. 실제 API의 제공자는 서버 환경 변수로 선택합니다.
독립 데모 API는 운영 API를 대체하지 않으며, 메인 앱에는 등록하지 않았습니다.

## 3. 실제 평가 요청

`Content-Type: application/json`

```json
{
  "practice_id": 1,
  "learner_answer": "=SUMIF(A:A,\"영업팀\",B:B)",
  "answer_type": "FORMULA"
}
```

- `practice_id`: `practices.practice_id`인 양의 정수입니다. 콘텐츠 ID나 문자열 ID가 아닙니다.
- `learner_answer`: 학습자가 입력한 수식 또는 결과값입니다. 앞뒤 공백 제거 후 1~4000자입니다.
- `answer_type`: `FORMULA` 또는 `RESULT`입니다. 생략하면 `FORMULA`입니다.
- `expected_answer`, `task_instruction`, `evaluation_criteria`, 점수 등의 추가 필드는 무시합니다.
  프론트엔드가 정답을 조회하거나 요청에 포함할 필요가 없습니다.

결과값 제출은 다음과 같습니다. 해당 과제에 함수 사용 제한이 있다면 결과만으로 확인할 수 없어 보류합니다.

```json
{"practice_id": 1, "learner_answer": "120.01", "answer_type": "RESULT"}
```

## 4. 서버 정답 조회와 채점

`get_feedback_db()`가 기존 `app.database.get_db()` 세션을 사용합니다.
`Practice`를 `Content`, `Course`와 조인하여 실습 ID를 조회하며,
콘텐츠와 과정 모두 `PUBLISHED`인 실습만 처리합니다.

| DB 필드 | 사용 용도 |
| --- | --- |
| `title`, `instruction` | 서버 과제 제목·지시문 |
| `answer_formula` | FORMULA 모범 수식 |
| `expected_result` | RESULT 기대 결과 |
| `result_type` | NUMBER 또는 TEXT 결과 비교 |
| `tolerance` | NUMBER의 0 이상 허용 오차 |
| `required_function` | 저장된 필수 함수 제약, 선택 항목 |

필수 함수가 비어 있는 것 자체는 오류가 아닙니다. 지시문에 탐지 가능한 함수 사용 요구가 있는데
DB 기준이 비어 있거나 충돌하면 보류합니다. 임의 자연어 요구 전체를 해석하는 기능은 없습니다.

수식은 비교 함수 25점·인수 개수 15점·인수별 구조 합계 60점으로 평가합니다.
100점은 correct, 1~99점은 partially_correct, 0점은 incorrect입니다.
지원 범위 밖이거나 판단 근거가 부족하면 needs_review로 처리합니다.
이 점수는 **제한된 수식 구조 루브릭이며 Excel 실행 결과나 모든 풀이의 동등성 판정이 아닙니다.**
결과값은 NUMBER에서 Decimal과 허용 오차, TEXT에서 문자열로 비교합니다.

Gemini가 반환한 점수·상태·수정 답안·내부 항목별 근거를 서버 결과와 대조합니다.
불일치는 보류하며, 사용자에게 표시하는 설명은 서버 근거로 구성합니다.
내부 `criterion_checks`는 공개 응답 필드가 아닙니다.

## 5. 정상 응답 예시

아래는 고정 데모 과제 1의 정답 제출을 로컬에서 확인한 예시입니다.
실제 DB·Gemini 호출에서 얻은 응답이라는 의미는 아닙니다. 실제 과제의 내용과 결과는 달라집니다.

```json
{
  "status": "correct",
  "score": 100,
  "good_points": [
    "비교 함수: 기준 SUMIF / 제출 SUMIF — 일치",
    "인수 개수: 기준 3 / 제출 3 — 일치",
    "인수 1: 기준 ('reference', 'A:A') / 제출 ('reference', 'A:A') — 일치",
    "인수 2: 기준 ('text', '영업팀') / 제출 ('text', '영업팀') — 일치",
    "인수 3: 기준 ('reference', 'B:B') / 제출 ('reference', 'B:B') — 일치"
  ],
  "improvement_points": [],
  "corrected_answer": "=SUMIF(A:A,\"영업팀\",B:B)",
  "explanation": "서버 루브릭으로 수식의 함수·인수 구조를 비교했습니다. Excel을 실행하거나 계산 결과를 검증하지 않았습니다.",
  "next_practice": "조건과 범위를 한 가지씩 바꾸어 같은 유형의 과제를 연습해 보세요."
}
```

`partially_correct`, `incorrect`도 같은 필드를 반환합니다.
`next_practice`는 연습 안내 문자열이며 다음 과제 ID·URL 추천 기능은 구현하지 않았습니다.

## 6. 평가 보류 응답 예시

고정 데모 과제 4에서 모범 수식이 없을 때 확인한 응답입니다. HTTP 상태는 200입니다.

```json
{
  "status": "needs_review",
  "score": null,
  "good_points": [],
  "improvement_points": [],
  "corrected_answer": "",
  "explanation": "서버 과제의 평가 정보가 없거나 유효하지 않아 평가를 보류했습니다: 모범 수식",
  "next_practice": "담당자가 과제 정답과 평가 기준을 확인한 뒤 다시 제출해 주세요."
}
```

프론트에서는 `needs_review` 또는 `score === null`이면 ‘평가 보류’를 표시해야 합니다.
`null`을 0점으로 바꾸거나 정답·오답으로 표시하면 안 됩니다.

## 7. Mock과 실제 Gemini의 차이

Mock은 DB와 API 키 없이 동작하며 아래 기존 요청을 사용합니다.

```json
{
  "task_title": "영업팀 매출 합계",
  "task_instruction": "영업팀 매출 합계를 구하세요.",
  "expected_answer": "=SUMIF(A:A,\"영업팀\",B:B)",
  "learner_answer": "=SUMIF(A:A,\"영업팀\")"
}
```

Mock은 클라이언트의 기대 답안을 사용한 시연용 문자열 비교입니다.
예시 점수는 100/70/20점이며 실제 채점·루브릭 품질의 증거가 아닙니다.
기존 Mock 자체는 needs_review를 만들지 않습니다. 보류 시연은 루브릭 데모를 이용합니다.

실제 API는 클라이언트 정답을 무시하고 DB를 조회한 뒤 제공자를 호출합니다.
키가 없거나 호출에 실패해도 Mock으로 자동 대체하지 않습니다.
데모의 `mode=gemini`는 실제 DB가 아닌 고정 과제에 Gemini를 호출한다는 점도 구분해야 합니다.

## 8. 오류 처리

| HTTP | 의미 | 화면 처리 권장 |
| --- | --- | --- |
| 404 | 없는 실습 또는 비공개 콘텐츠·과정 | 과제를 다시 선택하도록 안내 |
| 422 | ID 누락/문자열/0 이하, 빈 답안, 유형·길이 오류 | 입력값 확인 |
| 503 | DB 의존성·조회 장애, 제공자 설정·키 누락 | 서비스 준비/설정 확인 안내 |
| 502 | AI 호출 실패, 비어 있거나 잘못된 JSON·스키마 | 잠시 후 재시도 안내 |
| 200 + needs_review | 기준 누락·충돌, 지원 범위 밖, AI 근거 불일치 | 점수 없이 보류 사유 표시 |

라우터의 HTTPException 오류는 `{"detail":"..."}` 형태이며,
FastAPI의 422 입력 오류는 `detail` 배열입니다. 두 형식을 모두 처리해야 합니다.
제공자의 429·타임아웃 등을 별도 HTTP 코드로 변환하는 계약은 없으며 현재는 502입니다.
이 라우터 자체의 인증·호출 제한·평가 저장·제출 이력·재시도 정책은 구현하지 않았습니다.
DB 명세의 ‘2회차부터 모범 수식 공개’ 정책 역시 이 API에서 적용하지 않았습니다.

## 9. 환경 변수와 실행

| 이름 | 용도 |
| --- | --- |
| `FEEDBACK_PROVIDER` | `gemini`(기본값) 또는 `openai` |
| `GEMINI_API_KEY` | 실제 Gemini 비밀키 |
| `GEMINI_FEEDBACK_MODEL` | 기본값 `gemini-2.5-flash` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | 선택 제공자 설정, 모델 기본값 `gpt-4o-mini` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | 기존 팀 MySQL 설정 |
| `RUN_GEMINI_LIVE` | 실제 외부 API 테스트를 실행할 때만 `1` |

실제 키·비밀번호는 본 문서에 기록하지 않습니다.
키는 서버 환경 또는 Git에서 제외한 `.env`에 설정하고 브라우저에 전달하지 않습니다.
독립 앱과 진단 도구는 python-dotenv가 설치되어 있으면 루트·backend `.env`를 읽으며 환경 변수가 우선합니다.
메인 백엔드는 기존 설정에서 `backend/.env`를 읽습니다. 모델 이름의 접근 가능성은 실제 키로 확인해야 합니다.

프로젝트 루트 PowerShell에서:

```powershell
$env:PYTHONPATH = (Join-Path (Get-Location) 'backend')
.\.venv\Scripts\python.exe -m pip install -r backend/ai/requirements.txt
.\.venv\Scripts\python.exe -m ai.verify_feedback --require-db
.\.venv\Scripts\python.exe -m pytest backend/ai -q -rs -p no:cacheprovider
.\.venv\Scripts\python.exe -m ai.verify_feedback --live
.\.venv\Scripts\python.exe -m uvicorn ai.standalone:app --host 127.0.0.1 --port 8002
```

이번 환경은 Python 3.15.1이며 패키지 설치가 실패했습니다.
이미 설치된 의존성만으로 루브릭 데모는 실행할 수 있지만 DB 통합 테스트는 건너뜁니다.
실제 Gemini 진단은 키가 있을 때 최대 9개 사례를 외부 호출하므로 비용이 발생할 수 있습니다.

## 10. 프론트엔드 담당자: 제출 버튼 연결 예시

아래 예시는 아직 사용자 페이지에 적용하지 않았습니다. `apiBase`는 기존 API 설정을 사용합니다.
정답을 포함하지 말고 서버 실습 ID와 학습자 답안만 보내야 합니다.

```javascript
async function submitPractice(apiBase, practiceId, answer) {
  const response = await fetch(`${apiBase}/api/ai/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      practice_id: practiceId, // API에서 제공받은 양의 정수 실습 ID
      learner_answer: answer,
      answer_type: 'FORMULA'
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const message = typeof data.detail === 'string'
      ? data.detail : '입력값 또는 서버 상태를 확인해 주세요.';
    throw new Error(message);
  }
  return data; // needs_review는 HTTP 오류가 아니라 정상 응답의 보류 상태
}
```

제출 중 중복 클릭을 막고, 결과의 배열·문자열을 HTML 삽입 없이 텍스트로 표시해 주세요.
잘한 점, 개선점, 수정 답안, 설명, 다음 실습 안내를 모두 표시하고 오류 후 버튼을 복구해 주세요.
`practice_id`를 사용자 페이지에 전달하는 기존 공개 API 계약은 팀에서 확인해야 합니다.
이번 작업에서 공개 학습 API에 해당 필드를 추가하지 않았습니다.
현재 `Front/vite.config.ts`는 `/api`를 `127.0.0.1:8000`으로 프록시하므로 실제 실행 포트와 맞춰야 합니다.
이 설정이나 프론트 코드는 이번 작업에서 변경하지 않았습니다.

## 11. 백엔드 담당자 확인 사항

1. 기존 DB 스키마·ORM과 의존성을 설치하고 SQLite 통합 테스트를 건너뜀 없이 실행해 주세요.
2. 실제 MySQL의 실습 ID와 연결된 과정·콘텐츠 공개 상태를 확인해 주세요.
3. 실습의 지시문·모범 수식·기대 결과·유형·허용 오차·필수 함수 기준을 검수해 주세요.
4. 사용자 페이지에서 사용할 실습 ID 제공 방식을 협의해 주세요. 콘텐츠 ID를 대신 사용하면 안 됩니다.
5. 서버 키 및 모델 접근 권한을 설정한 뒤 실제 API 응답을 확인해 주세요.
6. 인증·요청 제한·평가 이력 저장·정답 공개 시점은 미구현이므로 별도 통합 범위를 협의해 주세요.
7. 서버 루브릭의 구문·의미 판정 한계를 감안하여 다른 유효한 풀이를 추가 검수해 주세요.

추가 검증 절차는 `FEEDBACK_WEEK5_VALIDATION.md`에 정리했습니다.

## 12. 전달 및 업로드 상태

사용자가 지정한 저장소는 `https://github.com/bbobbi76/shorts`,
대상 브랜치는 `feature/week5-ai-feedback`입니다.
현재 작업 폴더에 `.git`이 없고 GitHub 443 포트 연결도 실패하여 commit·push는 실행하지 못했습니다.
이 문서는 현재 로컬 파일 기준이며 원격 브랜치에 반영되었다는 의미는 아닙니다.
GitHub 접속이 가능한 환경에서 원격 이력·기존 브랜치를 확인한 후,
`backend/ai/`와 `backend/app/routers/ai_feedback.py`의 검토된 파일만 반영해야 합니다.
팀원 변경을 덮어쓰거나 main으로 올리거나 force push하면 안 됩니다.
