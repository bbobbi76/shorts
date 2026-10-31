# 5주차 1단계: 서버 정답 조회

최신 채점 정책과 실행 검증 결과는 [5주차 검증 문서](FEEDBACK_WEEK5_VALIDATION.md)를 참고한다.

## 기존 구조와 변경 범위

- `app.models.Practice`는 `practices.practice_id`를 `id` 속성으로 매핑한다.
- 기존 `/api/admin/contents`의 `first_practice`, `_save_practice`와 `/api/ui/admin/contents`가
  콘텐츠별 실습을 읽고 저장한다. 별도 루브릭 컬럼은 없다.
- 이 기능은 기존 `get_db`/`Practice`/`Content`/`Course`를 읽기 전용으로 재사용한다.
  테이블, 관리자 API, 타 팀 프론트엔드는 변경하지 않는다.
- 공개 조회 정책과 동일하게 콘텐츠와 과정이 모두 `PUBLISHED`인 실습만 평가한다.

## LIVE 요청

`POST /api/ai/feedback`

```json
{
  "practice_id": 1,
  "learner_answer": "=SUM(A1:A3)",
  "answer_type": "FORMULA"
}
```

`practice_id`는 콘텐츠 ID가 아닌 양의 정수 실습 ID다.
`answer_type`은 `FORMULA`(기본값) 또는 `RESULT`다.
추가로 보낸 `expected_answer`, `task_instruction`, `evaluation_criteria` 등은 제거한다.
기존 LIVE 요청은 과제 ID가 필수가 되므로 클라이언트 전환이 필요하다.
Mock API `/api/ai/feedback/mock`의 기존 요청은 유지한다.

## 서버 데이터 및 보류 정책

모델에 전달하는 지시문은 `instruction`, 제목은 `title`에서 가져온다.
`evaluation_criteria`에는 서버의 `result_type`, `tolerance`, `required_function`,
`expected_result`, `answer_formula`와 제출 유형을 전달한다.

| 제출 유형 | 필수 기준 |
| --- | --- |
| FORMULA | 제목, 지시문, 유효한 결과 유형, 지원 범위의 모범 수식. 필수 함수는 선택 기준 |
| RESULT / NUMBER | 제목, 지시문, 유한 숫자 기대 결과, 0 이상의 유한 허용 오차 |
| RESULT / TEXT | 제목, 지시문, 공백이 아닌 기대 결과 |

필수 함수는 DB에서 선택 필드다. 최초 구현은 빈 함수 기준을 보류했지만,
현재는 빈 값 자체를 오류로 보지 않는다. 지시문에 탐지 가능한 특정 함수 사용 요구가 있는데
필수 함수가 비어 있거나 충돌하면 보류한다. 두 곳 모두 요구가 없으면 저장된 함수 제한이 없는 것으로 취급한다.
임의 자연어의 모든 요구를 탐지한다고 보장하지 않으며, 별도 명시적 루브릭 필드는 후속 DB 협의 사항이다.
RESULT만 제출했는데 서버에 필수 함수가 있으면 함수 사용을 검증할 수 없어 보류한다.
이 단계는 수식 실행 엔진이나 전체 문법 검증을 구현하지 않는다.

필수 기준이 누락되거나 유효하지 않으면 API 키 검사와 모델 호출 전에 HTTP 200으로 반환한다.
기존 JSON 키를 유지하고 `status="needs_review"`, `score=null`, `corrected_answer=""`,
빈 칭찬/개선점 목록 및 보류 사유를 반환한다. 0점으로 대체하지 않는다.
모델도 판단 근거가 부족하면 같은 보류 형식을 사용할 수 있다.

- 잘못된 요청 / ID 누락: 422
- 없는 실습 / 비공개 콘텐츠 또는 과정: 404
- DB 조회 실패 / 제공자 설정 누락: 503
- 모델 호출 또는 응답 검증 실패: 502

API는 정답을 별도 조회 응답으로 공개하지 않는다. 다만 기존 피드백의 `corrected_answer`는 유지한다.
DB 명세의 ‘2회차부터 모범 수식 공개’ 정책과 제출 이력 연계는 이 단계에 포함되지 않는다.
기존 SDK 직접 호출 및 `test_run --live`는 개발용 입력 평가 경로이며 서버 ID 조회 API가 아니다.
운영 클라이언트는 반드시 위 LIVE API를 사용해야 한다.

## 테스트

프로젝트 루트의 PowerShell에서:

```powershell
$env:PYTHONPATH = (Join-Path (Get-Location) 'backend')
.\.venv\Scripts\python.exe -m pytest backend/ai -q -p no:cacheprovider
```

기존 AI 의존성 외에 백엔드의 SQLAlchemy, PyMySQL, python-dotenv가 필요하다.
`test_practice_feedback.py`는 입력 조작 방지, 기준별 보류, API 오류, Mock 호환성을 검증한다.
`test_practice_feedback_db.py`는 실제 ORM 모델로 임시 SQLite에서 조회·공개 조건·보류·DB 오류를 검증한다.
DB 의존성이 없으면 해당 통합 테스트 모듈은 명시적으로 skip된다.
모든 자동 테스트는 실제 운영 DB와 외부 AI를 호출하지 않는다.

### 이번 환경에서의 실행 결과

- `44 passed, 1 skipped` (2026-10-31).
- Gemini/OpenAI SDK 호출을 대체하여 서버 기준이 실제 요청 payload에 포함되는지 검증했다.
- SQLAlchemy가 없어 DB 통합 테스트 모듈 1개가 건너뛰어졌다.
  PyMySQL/python-dotenv도 현재 가상환경에 없으며, 패키지 설치는 네트워크 제한으로 실패했다.
- 실제 ORM 조회 통합 테스트 및 운영 MySQL 연결은 검증되지 않았다.
- FastAPI/Starlette의 기존 의존성에서 발생하는 deprecation warning 62개가 출력되었다.
