# WorkFit 5주차 AI 피드백 구현·검증

## 변경 범위와 현재 결론

`backend/ai`만 수정했다. DB 스키마, 팀원 모델·관리자 API, 사용자 프론트엔드는 변경하지 않았다.
기존 Mock, 예시 JSON, 테스트 파일을 유지했다. Git commit/push/병합은 수행하지 않았다.

서버 루브릭, 제공자 응답의 근거 대조, SUMIF/SUMIFS/IF 평가 세트, 독립 데모를 구현했다.
**DB ORM 통합과 실제 Gemini 호출은 이 환경에서 미검증이다. 전체 연동 완료를 의미하지 않는다.**

## 환경 확인 / 설치 제한

- 현재 `.venv`: Python 3.15.1.
- 설치 확인: google-genai 2.33.0, FastAPI 0.115.0, pytest 9.1.1.
- 미설치: SQLAlchemy, PyMySQL, python-dotenv.
- `backend/requirements.txt`: SQLAlchemy 2.0.35, PyMySQL 1.1.1, python-dotenv 1.0.1 등.
- `requirements-ai.txt`: openai, pydantic, google-genai.
- AI 작업용으로 `backend/ai/requirements.txt`를 추가했다. 팀원의 버전 지정은 수정하지 않았다.
- 현재 가상환경에서 일반 설치와 명시적 PyPI 인덱스 설치를 시도했으나
  `No matching distribution found`로 실패했다. 이전 실행에는 소켓 접근 제한도 발생했다.
  따라서 설치 문제는 해결되지 않았으며 Python 3.15와 고정된 팀 의존성 조합도 검증하지 못했다.
- Gemini 키는 환경에 없고 프로젝트 루트·backend·ai-search의 `.env`도 없다. 값은 출력하지 않았다.
- 명시적 MySQL 연결 설정이 없다. 팀 설정의 기본 localhost 값은 연결 성공의 근거가 아니다.
  실제 MySQL 연결은 시도하거나 성공했다고 판단하지 않았다.

DB 테스트는 실제 팀 ORM 모델을 사용하고 SQLite 외래키 검사도 켠다. 의존성이 없으면 건너뛴다.
`verify_feedback --require-db`로 의존성 누락을 실패 종료 코드로 확인할 수 있다.

## 채점 기준

서버 조회에서 `title`, `instruction`, `answer_formula`, `expected_result`, `result_type`,
`tolerance`, `required_function`을 사용한다. 클라이언트의 정답·루브릭 추가 필드는 무시한다.
실제 API는 콘텐츠와 과정이 모두 공개된 실습만 조회한다.

### 필수 함수가 비어 있는 경우

스키마의 `required_function`은 nullable이므로 빈 값만으로 기준 누락을 단정할 수 없다.

1. 필드와 지시문 모두 함수 제한을 제시하지 않으면 저장된 함수 제한이 없는 것으로 취급한다.
2. 지시문이 `SUMIF 함수를 사용` 같은 요구를 하는데 필드가 비어 있거나 다르면 보류한다.
3. `함수 제한 없음` 지시와 필수 함수 필드가 충돌해도 보류한다.
4. 제한 없는 과제의 다른 함수 풀이가 동등한지는 수식 실행 없이 확정하지 않고 보류한다.

이 탐지는 지원 함수의 일부 명시적 문구만 다룬다. 임의 자연어 요구를 완전히 해석하지 않는다.
향후 팀 DB에 `function_policy`/검수된 루브릭을 추가하면 ‘미작성’과 ‘제한 없음’을 명시적으로
구분할 수 있다. 이번 작업에서는 DB 변경이나 새로운 클라이언트 채점 입력을 도입하지 않았다.

### FORMULA 구조 루브릭

| 항목 | 배점 |
| --- | ---: |
| 모범 수식과 비교 함수 일치 | 25 |
| 인수 개수 일치 | 15 |
| 인수별 구조 일치 | 합계 60, 인수 수에 따라 정수 배분 |

100점은 correct, 1~99점은 partially_correct, 0점은 incorrect다.
필수 함수가 있는데 다른 지원 함수만 사용한 답안은 해당 제약 위반으로 0점 처리한다.
중첩 사용·다른 풀이·미지원 함수·과도한 복잡도·잘못된 모범 수식 등은 needs_review다.

수식 파서는 SUMIF, SUMIFS, IF와 비교용 SUM/AVERAGE/COUNT의 제한된 구문을 지원한다.
수식 이름·참조의 대소문자와 문자열 밖 공백은 정규화하고 문자열 내용은 보존한다.
**Excel 실행·워크북 데이터 검증·모든 수식의 의미 동등성 판정은 하지 않는다.**
구조가 다른 유효한 풀이를 모두 알아내지 못하므로 일반적인 Excel 정답률로 해석하면 안 된다.
인수별 구조 차이에 대한 부분 점수는 교육용 루브릭 점수이며 실행 성공의 증거가 아니다.

### RESULT 비교

NUMBER는 유한 숫자와 0 이상의 허용 오차로 Decimal 비교한다. 경계값을 포함한다.
TEXT는 입력 스키마의 앞뒤 공백 제거 후 문자열을 비교한다. 결과 비교는 100 또는 0점이다.
NaN·무한대·안전하게 처리할 수 없는 숫자는 보류한다.
필수 함수 사용을 요구하는데 결과값만 제출하면 함수 사용 여부를 알 수 없어 보류한다.

### Gemini/OpenAI 응답 검증

서버가 점수와 항목별 기대값·제출값을 먼저 계산한다. 제공자에게는 내부 `server_rubric`과 배점을 전달한다.
모델은 기존 JSON 필드에 내부 `criterion_checks`를 추가해 응답한다.
점수·상태·수정 답안·항목 ID·기대값·제출값·충족 여부가 서버 결과와 일치해야 채점 결과를 반환한다.
불일치하거나 근거가 없으면 needs_review로 보류한다. 잘못된 JSON/형식은 오류로 처리한다.

학습자에게 표시하는 설명과 칭찬·개선점·다음 연습은 검증된 서버 근거와 안전한 문구로 구성한다.
모델의 자유 문장은 실제 실행·계산·없는 과제에 관한 사실로 표시하지 않는다.
따라서 현재 Gemini의 역할은 제한된 서버 루브릭에 대한 교차 확인이며, 자유로운 의미 채점은 아니다.
Gemini 지시는 `system_instruction`으로 분리하고 타임아웃을 30초로 설정했다.
설치된 SDK에서 해당 설정 필드가 존재하는 것은 확인했지만 실제 네트워크 동작은 미검증이다.

## API / 데모 계약

기존 실제 API 및 Mock 요청·응답 키는 변경하지 않았다.

```json
{"practice_id": 1, "learner_answer": "=SUMIF(A:A,\"영업팀\",B:B)", "answer_type": "FORMULA"}
```

실제 경로는 `/api/ai/feedback`, 기존 Mock은 `/api/ai/feedback/mock`이다.
보류는 기존처럼 `status=needs_review`, `score=null`, 빈 수정 답안과 보류 사유를 반환한다.

독립 앱에만 `/api/ai/demo/feedback?mode=rubric|gemini`를 추가했다.
이 API는 실제 DB 대신 서버에 고정된 평가 세트의 과제 ID 1~4를 사용한다.
메인 백엔드에 이 데모 API를 등록하지 않았다. 클라이언트 정답 입력은 여기서도 무시한다.
데모의 네 모드는 다음과 같다.

- 서버 루브릭 데모: DB·키 없이 실제 서버 루브릭을 확인.
- Gemini + 데모 과제: 고정 과제로 외부 모델 교차 확인. 키 필요.
- 기존 Mock: 기존 고정 예시 점수.
- 실제 DB 과제 + AI: 공개된 practices ID로 실제 API 호출. DB와 키 필요.

점수, 잘한 점, 개선점, 수정 답안, 설명, 다음 연습, 보류를 표시한다.
이 데모를 실제 사용자 페이지와 연동했다고 주장하지 않는다.

## 평가 세트와 검증 범위

`evaluation_cases.json`에 SUMIF/SUMIFS/IF 각각 정답·부분 정답·오답·보류, 총 12개 사례를 작성했다.
이는 이번 구조 루브릭의 회귀 테스트 세트이며, 외부 전문가 평가나 실제 Gemini 정확도 통계가 아니다.

| 함수 | 정답 | 부분 정답 | 오답 | 보류 |
| --- | ---: | ---: | ---: | --- |
| SUMIF | 100 | 65 (합계 범위 누락) | 0 | 근거 없는 설명 |
| SUMIFS | 100 | 88 (조건 하나 변경) | 0 | 미지원 다른 풀이 |
| IF | 100 | 80 (거짓 분기 변경) | 0 | 미지원 다른 풀이 |

입력 조작, 지시문 충돌, 숫자 오차 경계, 미지원/악성 수식, 모델 점수·근거 조작,
잘못된 JSON, 타임아웃, API 오류 및 Mock 호환성을 추가로 테스트한다.
기존 테스트 파일은 유지하고, 필수 함수 정책 변경에 해당하는 기대값과 제공자 대체 응답만 갱신했다.

현재 결과 및 실행 명령은 아래 절차를 따른다. DB·외부 API의 건너뜀을 통과로 합산하지 않는다.

### 이번 실행 결과 (2026-10-31)

| 구분 | 결과 |
| --- | --- |
| Python 자동 테스트 | 114 통과, 0 실패, 2 건너뜀 |
| 건너뜀 1 | SQLAlchemy 미설치로 SQLite ORM 통합 테스트 모듈 전체 |
| 건너뜀 2 | 실제 Gemini 테스트 (기본 opt-in 비활성화, 별도 진단에서도 키 없음 확인) |
| 데모 JavaScript | 7 통과, 0 실패. Python 테스트 중 1개에서도 이 7개를 실행하므로 중복 합산하지 않음 |
| Python 구문 컴파일 | 통과 |
| 실제 Gemini API | 키 없음으로 호출하지 않음 / 미검증 |
| 실제 MySQL | 명시적 연결 설정 없음 / 미검증 |
| 브라우저 화면·실제 사용자 페이지 | 전체 브라우저 검증 및 사용자 페이지 연동 미수행 |

FastAPI/Starlette에서 deprecation warning 96개가 출력되었으며 테스트 실패는 아니다.
SQLite 의존성 설치 실패와 외부 API 미검증은 남은 작업이다.

## VS Code PowerShell 실행

프로젝트 루트에서 실행한다. 가상환경 활성화는 필요하지 않다.

```powershell
# 현재 환경에서 테스트 및 비밀값 없는 상태 확인
$env:PYTHONPATH = (Join-Path (Get-Location) 'backend')
.\.venv\Scripts\python.exe -m ai.verify_feedback --live
.\.venv\Scripts\python.exe -m pytest backend/ai -q -rs -p no:cacheprovider

# DB·키 없이 독립 데모 실행
.\.venv\Scripts\python.exe -m uvicorn ai.standalone:app --host 127.0.0.1 --port 8002
```

브라우저에서 `http://127.0.0.1:8002/demo`를 연다.
서버 루브릭 모드를 고르고 SUMIF/SUMIFS/IF에서 정답·부분 정답·오답·보류를 차례로 제출한다.
‘정답 미등록’ 과제는 어떤 답안을 제출해도 점수 없이 보류되어야 한다.
기존 Mock도 선택해 이전 요청 형식으로 결과가 표시되는지 확인할 수 있다.

### SQLAlchemy 설치 후 SQLite 재검증

패키지 저장소에 접근 가능한 환경에서:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/ai/requirements.txt
.\.venv\Scripts\python.exe -m ai.verify_feedback --require-db
.\.venv\Scripts\python.exe -m pytest backend/ai/test_practice_feedback_db.py -v -rs -p no:cacheprovider
```

의존성 설치가 실패하면 SQLite ORM 테스트가 실행된 것으로 간주하면 안 된다.
Python 3.15와 팀 고정 버전 조합에서 문제가 지속되면, 팀과 사용하는 버전을 맞춘 뒤
기존 `.venv`를 보존하고 별도 환경을 만들어 확인한다. 예를 들어 설치된 Python 3.12가 있다면:

```powershell
py -3.12 -m venv .venv-feedback
.\.venv-feedback\Scripts\python.exe -m pip install -r backend/ai/requirements.txt
.\.venv-feedback\Scripts\python.exe -m ai.verify_feedback --require-db
.\.venv-feedback\Scripts\python.exe -m pytest backend/ai -q -rs -p no:cacheprovider
```

이 명령의 환경 생성·설치 성공은 현재 환경에서 검증하지 않았다.
SQLite 테스트 통과도 MySQL 연동 성공과는 별개다.

### 실제 Gemini 검증

터미널 환경 또는 `.env`에 키를 설정하되 키를 출력하거나 Git에 기록하지 않는다.
진단 스크립트와 standalone은 python-dotenv가 있으면 루트와 backend의 `.env`를 읽는다.
환경 변수가 파일보다 우선한다. 키가 없다면 아래 스크립트는 미검증 사유만 보고한다.

```powershell
.\.venv\Scripts\python.exe -m ai.verify_feedback --live

# 실제 호출을 일반 테스트와 구분하여 실행할 때만
$env:RUN_GEMINI_LIVE = '1'
.\.venv\Scripts\python.exe -m pytest backend/ai/test_live_gemini.py -v -rs -p no:cacheprovider
Remove-Item Env:RUN_GEMINI_LIVE
```

실제 검증은 최대 9개 채점 가능 사례를 외부에 호출하고, 나머지 보류 사례는 서버에서 처리한다.
호출 시 비용이 발생할 수 있다. 보고서의 `external_call`, `passed`, 오류 유형을 구분해서 확인한다.
키 존재만으로 호출 성공을 판단하지 않는다. 오류 메시지나 URL 대신 예외 유형만 출력한다.

### 데모 JS 검사

```powershell
node --test backend/ai/test_demo_ui.cjs
```

이 검사는 실제 inline JavaScript를 DOM/fetch 대체 환경에서 실행한다.
FastAPI TestClient API 검사와 별개이며 전체 브라우저 렌더링·배포 검증은 아니다.
