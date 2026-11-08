# WorkFit 5주차 AI 피드백 통합 결과

> 최신 결과: `gemini-3.1-flash-lite`로 실제 DB 과제 평가 및 JSON·Pydantic 검증에 성공했다. 기본 모델도 변경했다. 아래 실패 기록은 이전 진단 이력이며, 최종 성공 범위와 서버 적용 방법은 [최종 실제 평가 보고서](backend/ai/FINAL_LIVE_FEEDBACK_RESULT.md)를 확인한다.

## 후속 실제 Gemini 진단 및 수정 (2026-11-07)

이 절이 아래 초기 검증 기록보다 최신이다. 실제 MySQL의 공개 콘텐츠 API와 실습 조회는 정상 작동한다.
현재 SUMIFS 실습 ID 3에 `=SUMIF(A:A,"영업팀",B:B)`를 제출하는 경로를 실제 DB와 외부 Gemini로 재검증했다.

### 실제 실패 원인

- 기존 실행 서버의 `/api/ai/feedback`은 HTTP 502를 반환했다.
- DB 실습과 서버 평가 기준은 조회·검증에 성공했다. 필수 SUMIFS 과제에 SUMIF를 제출한 답안의 서버 루브릭 결과는 `incorrect`, 0점이다.
- 기존 기본 모델 `gemini-2.5-flash`의 외부 응답은 HTTP 404, 예외 유형은 `google.genai.errors.ClientError`였다.
- 제공자 메시지는 해당 모델이 **신규 사용자에게 더 이상 제공되지 않으며**, `gemini-3.8-flash`를 사용하라는 내용이었다. 모든 사용자에게 모델이 종료되었다는 뜻으로 확대 해석하지 않는다.
- 이는 Gemini 응답 JSON 파싱 또는 Pydantic 검증 이전의 실패다. 실제 응답 필드 누락은 확인되지 않았다.
- 대체 모델의 모델 정보 조회는 성공했다. 그러나 실제 WorkFit 평가 생성은 외부 HTTP 504(`ServerError`, deadline expired)로 실패했다.
- WorkFit 프롬프트와 JSON Schema를 제외한 아주 짧은 독립 생성 요청도 외부 HTTP 503(`ServerError`)으로 실패했다.
- 따라서 신규 모델의 현재 외부 생성 장애까지 코드·프롬프트 문제라고 단정할 수 없다. 키·DB 연결·모델 정보 조회 성공과 실제 평가 생성 성공을 구분한다.

### AI 담당 코드의 최소 수정

- `backend/ai/ai_feedback.py`: 기본 모델을 실제 제공자가 안내한 `gemini-3.8-flash`로 변경했다. `GEMINI_FEEDBACK_MODEL`의 명시적 설정이 우선한다.
- Gemini 3 계열에는 기존 temperature 옵션을 보내지 않고 low thinking level을 지정했다. 다른 명시적 모델의 기존 temperature 동작은 유지한다.
- 공개 필드와 내부 `criterion_checks`를 JSON Schema로 명시해 전달한다. 기존 JSON MIME 지시만으로 필수 필드가 보장되지 않는 부분을 보강했다.
- 기존 Pydantic 스키마와 서버 근거 대조를 완화하지 않았다. 누락 필드를 임의로 채우거나 Mock 결과로 대체하지 않는다.
- 출력은 최대 4096 토큰, 요청 제한은 60초, 자동 요청 시도는 1회로 설정했다. 프론트의 90초 대기 시간 안에 들어오도록 설정한 것이며 외부 서비스 성공을 보장하지 않는다.
- AI 연동 안내 문서를 갱신했다. 관리자·검색·DB 모델·실습 정답은 이번 후속 수정에서 변경하지 않았다.

### 재검증 결과

| 항목 | 결과 |
| --- | --- |
| 실제 MySQL 실습 조회 | 성공 |
| 기존 모델 Gemini 생성 | 실패: 외부 404 → 서비스 502 |
| 대체 모델 정보 조회 | 성공 |
| 대체 모델 실제 평가 생성 | 실패: 외부 504, JSON 응답 없음 |
| 짧은 독립 생성 요청 | 실패: 외부 503 |
| 실제 응답 JSON 파싱·필수 필드·Pydantic 호환성 | 생성 실패로 미검증 |
| 자동 테스트 | **153 passed, 1 skipped** |
| 누락 필드 회귀 테스트 | status, score, good_points, improvement_points, corrected_answer, explanation, next_practice 누락 시 거부 확인 |
| 모델·생성 옵션·요청 JSON Schema 회귀 테스트 | 통과 |
| git diff --check | 통과 |

프론트는 HTTP 502를 받으면 `AI 응답을 처리하지 못했습니다. 잠시 후 다시 제출해 주세요.`를 표시한다.
이 문구는 실제 원인이 JSON 검증 오류라는 뜻이 아니라, 제공자 오류도 포함하는 공통 표시다.
실패 시 성공 피드백을 만들지 않고 답안 재제출을 허용한다.

### 로컬 재실행 및 미비 사항

현재 실행 중인 8000번 서버는 자동 reload 없이 시작되었으므로 파일 변경을 반영하려면 재시작이 필요하다.
기존 DB 환경 변수와 키를 설정한 **같은 PowerShell**에서 Ctrl+C로 종료한 후 아래 명령을 실행한다.
아래 명령은 현재 디렉터리가 `backend`일 때의 명령이다.

```powershell
$env:FEEDBACK_PROVIDER = 'gemini'
$env:GEMINI_FEEDBACK_MODEL = 'gemini-3.8-flash'
..\.verification\venv312\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

재접속: `http://127.0.0.1:5174/learn/courses` → SUMIFS 영상 → 실습·업무자료 → 답안 입력 → 답안 제출하고 AI 피드백 받기.
DB 초기화나 데모 재삽입은 필요하지 않다. 공급자 생성이 계속 503·504로 실패하면 Google AI Studio에서 같은 모델의 생성 가능 여부와 서비스 상태를 확인한다.
실제 점수·피드백 JSON 수신 및 그 결과의 브라우저 표시는 아직 완료하지 못했다.

참고: [Google의 Gemini 3.8 마이그레이션 안내](https://ai.google.dev/gemini-api/docs/latest-model), [구조화 출력 안내](https://ai.google.dev/gemini-api/docs/structured-output).

## 결론

학습자 영상 상세 → 실습 답안 제출 → 기존 AI 피드백 API → 결과 표시 연결을 구현했다.
Python 3.12에서 백엔드 자동 테스트와 프론트 테스트·빌드가 통과했다.
**실제 MySQL·Gemini를 사용하는 전체 서비스 검증은 완료하지 못했다.**
브라우저 검증은 실제 Chromium에서 수행했지만, 콘텐츠와 피드백 응답은 검증용 데이터로 대체했다.

## 브랜치와 보존 범위

- 시작 브랜치: main, 기준 커밋 `4a964d7`.
- 작업 브랜치: `feature/week5-feedback-integration`을 새로 생성했다.
- 시작 시 추적 파일 변경은 없었고, 이전 실행 검증의 `.verification/`만 존재했다.
- Git commit, push, merge를 수행하지 않았다.
- 기존 DB 초기화, 데이터 삭제, 스키마 변경, 기존 환경 파일 덮어쓰기를 수행하지 않았다.
- 관리자·AI 검색 코드는 보존했다. 기존 main에는 AI 검색 설치 호출이 없어, 이번 작업으로 AI 검색이 동작한다고 주장하지 않는다.
- 생성한 Python·브라우저·캡처는 `.verification/`에 격리하고 Git 제외 대상으로 추가했다.

## 구현 내용

### 백엔드

- `backend/app/main.py`에 기존 AI 피드백 라우터를 등록했다.
- 공개 콘텐츠 API에 `practiceId`와 `practiceTitle`만 추가했다. 실습 ID는 콘텐츠 ID가 아닌 `practices.practice_id`다.
- 과제 지시문은 기존 `practiceText`를 사용한다. 정답 수식, 기대 결과, 허용 오차, 필수 함수, 내부 루브릭은 공개 콘텐츠 응답에 추가하지 않았다.
- 기존 `POST /api/ai/feedback` 요청 계약을 유지했다.

```json
{"practice_id":192,"learner_answer":"학습자 답안","answer_type":"FORMULA"}
```

- 서버가 해당 실습을 조회하고 콘텐츠와 과정이 모두 공개인지 확인하는 기존 코드를 유지했다.
- 클라이언트가 추가한 정답·평가 기준은 무시된다.
- 기준 부족은 모델 호출 전에 `needs_review`, `score=null`로 반환한다.
- 기존 메인 앱은 검증 오류를 400으로 변경한다. 피드백 경로에만 422 예외를 적용해 기존 AI 계약을 유지했다. 관리자·기존 UI 경로의 오류 정책은 유지한다.
- 조회 불가 404, 제공자 설정 누락 503, 제공자 실패 502 처리를 유지했다.
- 수정 답안은 기존 피드백 응답의 `corrected_answer`로 평가 후 표시한다. 공개 콘텐츠 조회에서는 정답을 제공하지 않는다.

### 프론트엔드

- 기존 영상 상세의 `실습·업무자료` 탭에 답안 입력 및 제출 폼을 추가했다.
- 수식(FORMULA)·계산 결과(RESULT)를 선택할 수 있다.
- 서버의 실습 ID, 학습자 답안, 답안 유형만 전송한다.
- `/api/ui` 콘텐츠 경로와 `/api/ai/feedback` 제출 경로를 구분한다.
- 점수, 잘한 점, 개선점, 수정 답안, 평가 설명, 다음 실습 추천을 표시한다.
- 보류는 점수 없이 표시하며, 0점이나 null점으로 표시하지 않는다.
- 빈 답안 제출 방지, 평가 중 중복 제출 방지, 90초 대기 제한, 화면 이탈 시 요청 취소, 오류 후 재제출을 처리했다.
- Mock 모드는 실제 평가를 호출하지 않고 설명을 표시한다. API 오류를 Mock 결과로 자동 대체하지 않는다.
- 실습이 없는 영상에는 제출 가능한 실습이 없다는 안내를 표시한다.
- 기존 초록색 디자인과 폼 스타일을 유지했다. 기존 `/learn/preview`는 계속 정적 예시다.
- `requirements-ai.txt`에 실제 Gemini 제공자 SDK인 `google-genai`를 추가했다.

## 환경 및 실제 외부 연결

| 항목 | 확인 결과 |
| --- | --- |
| Node.js | 24.22.1 |
| npm | 11.19.1, PowerShell에서는 npm.cmd 사용 |
| 최초 Python | 3.15.1, SQLAlchemy 2.0.35 모델 로딩 실패 재현 |
| 별도 준비한 Python | 3.12.16, `.verification/venv312` |
| 주요 패키지 | FastAPI 0.115.0, SQLAlchemy 2.0.35, PyMySQL 1.1.1, python-dotenv 1.0.1, google-genai 3.0.0 |
| MySQL | 실행 파일·서비스를 확인하지 못했고 로컬 TCP 접속도 성공하지 못함. 명시적 DB 환경 설정이 없어 실제 SQL 조회 미검증 |
| Gemini 키 | 검사 당시 미설정. 값 출력·키 요청·실제 외부 호출을 수행하지 않음 |
| 환경 파일 | 기존 파일을 생성하거나 덮어쓰지 않음 |

Python 3.15의 전체 의존성 설치에서는 PyYAML 빌드용 C++ 도구 누락도 발생했다.
Python 3.12 별도 환경에서는 기존 버전 지정을 변경하지 않고 전체 패키지 설치에 성공했다.
기존 백엔드는 시작 시 임시 관리자 비밀번호 레코드를 갱신하는 동작이 있다. 이번 검증에서는 운영 DB와 연결하는 lifespan을 실행하지 않았다.

## 테스트 결과

| 검증 | 실제 결과 | 범위 |
| --- | --- | --- |
| 백엔드·AI pytest | **144 passed, 1 skipped** | 격리 SQLite, 기존 관리자 API 및 AI 모듈, 새 메인 앱 통합 테스트 |
| 프론트 Vitest | **50 passed** | 기존 45개 및 신규 요청 계약·오류 처리 5개 |
| 프론트 빌드 | **성공** | TypeScript 검사 및 Vite production build |
| 실제 Chromium | **5개 시나리오 성공, 페이지 오류 0개** | API 모드 화면에 검증용 콘텐츠·피드백 응답 주입 |
| git diff --check | 성공 | 공백 오류 없음 |
| 실제 Gemini 평가 | **미검증** | API 키 없음, pytest 외부 호출 테스트 1개 skip |
| 실제 MySQL·영상 재생·전체 서비스 | **미검증** | DB 설정·접속 미확보, 브라우저 테스트 콘텐츠에는 실제 영상 없음 |

새 백엔드 통합 테스트는 **실제 main 앱**에서 서로 다른 콘텐츠 ID(91)와 실습 ID(192)를 사용한다.
공개 응답의 정답 비노출, 서버 DB 정답 조회, 클라이언트 정답 조작 무시, 정답 100점·부분 정답 65점·오답 0점·보류 점수 없음, 비공개 실습 404, 요청 오류 422, 키 누락 503, 제공자 실패 502를 확인했다.
평가 제공자 함수는 테스트에서 대체했으므로 이 결과는 실제 Gemini 성공의 증거가 아니다.

브라우저에서도 답안 제출, 로딩 중 버튼 비활성화, 100점·65점·0점·보류·503 오류 표시와 오류 후 재시도를 확인했다.
브라우저가 보낸 요청에는 실습 ID와 답안·유형만 포함되었다.

재실행 명령(프로젝트 루트):

```powershell
$env:PYTHONPATH = (Join-Path (Get-Location) 'backend')
.\.verification\venv312\Scripts\python.exe -m pytest backend/tests backend/ai -q -p no:cacheprovider
cd Front
npm.cmd test
npm.cmd run build
```

브라우저 검증 스크립트는 `.verification/browser/feedback.cjs`이며, 실제 외부 연동을 대체하지 않는다.

## 실행 방법과 주소

현재 API 모드 프론트 개발 서버를 `http://127.0.0.1:5174`에서 실행했다.
실제 백엔드 8000은 실행하지 않았으므로 현재 이 주소에서 DB 콘텐츠·실제 AI 결과를 바로 볼 수는 없다.
브라우저 검증 스크립트가 주입한 콘텐츠는 일반 브라우저에 저장되거나 제공되지 않는다.

### 1. 기존 DB 설정 확인

MySQL 8.0 서버를 실행하고, 기존 WorkFit 스키마를 사용하는 DB 연결 설정을 `backend/.env` 또는 서버 환경 변수에 설정한다.
필요한 이름은 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`이다.
기존 DB를 초기화하는 `init_db.py`는 실행하지 않는다. 파일 내용과 비밀번호는 공유하지 않는다.
기존 서버의 관리자 임시 비밀번호 갱신 동작도 먼저 확인한다.

### 2. Gemini 서버 설정

서버에 `GEMINI_API_KEY`를 설정하고 `FEEDBACK_PROVIDER=gemini`를 사용한다.
브라우저용 VITE 환경 변수에 키를 넣지 않는다. API 키를 채팅이나 Git에 올리지 않는다.
실제 Gemini 호출의 성공·모델 접근 권한·할당량은 해당 환경에서 재검증해야 한다.

### 3. 백엔드 시작

프로젝트 루트의 별도 PowerShell:

```powershell
cd backend
..\.verification\venv312\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- 상태 확인: `http://127.0.0.1:8000/api/health`
- API 문서: `http://127.0.0.1:8000/docs`
- 위 주소는 서버가 DB와 함께 정상 시작된 후에 사용 가능하다.

### 4. API 모드 프론트 시작

프로젝트 루트의 다른 PowerShell에서 실행한다. 환경 파일을 덮어쓰지 않고 현재 프로세스에만 적용된다.
5174 서버가 이미 실행 중이면 기존 서버 주소를 그대로 사용한다.

```powershell
cd Front
$env:VITE_DATA_MODE = 'api'
$env:VITE_API_BASE_URL = '/api/ui'
npm.cmd run dev -- --port 5174
```

Vite 프록시는 `/api` 요청을 8000으로 전달한다. 프론트와 백엔드를 함께 실행해야 한다.
이번 경로는 같은 출처 프록시를 사용한다. 관리자를 브라우저에서 직접 교차 출처로 사용할 때는 기존 FRONTEND_ORIGIN 설정을 실제 프론트 출처와 일치시켜야 한다.

### 5. 브라우저 클릭 순서

1. `http://127.0.0.1:5174/learn/courses`를 연다.
2. 공개 과정을 선택하고, 실습이 등록된 공개 영상을 선택한다.
3. 영상 재생 버튼을 누르고 `실습·업무자료` 탭에서 과제 지시문을 확인한다.
4. `답안 유형`에서 수식 또는 계산 결과를 선택한다. 필수 함수 과제는 수식을 제출한다.
5. `내 실습 답안`을 입력한다.
6. `답안 제출하고 AI 피드백 받기`를 누른다.
7. 평가 중 안내 후 점수·피드백 또는 보류 사유를 확인한다. 오류 발생 시 설정을 확인하고 재제출한다.

## 과제 캡처 목록

실제 외부 연결을 준비한 후 다음 화면을 캡처한다.

1. 공개 과정 목록과 선택한 과정의 영상 목록.
2. 영상 상세의 재생 화면과 실습 안내.
3. 답안 입력 및 평가 중 상태.
4. 정답: 점수, 잘한 점, 수정 답안, 다음 실습 추천.
5. 부분 정답: 점수와 개선점.
6. 오답: 0점과 개선점.
7. 평가 근거 부족: 평가 보류와 사유, 점수 없음.
8. 서비스 오류 안내 및 재제출 가능한 상태.

브라우저 자동 검증 캡처는 `.verification/captures/feedback-{correct,partial,incorrect,review,error}-stub.png`에 있다.
**이 파일들은 대체 응답을 사용한 UI 검증 캡처이므로 실제 Gemini·MySQL 연동 캡처로 제출하면 안 된다.**
보류 검증을 위해 기존 DB의 정답을 지우지 않는다. 이미 기준이 부족한 공개 과제가 있는 경우에만 해당 과제를 사용하거나 격리 테스트 결과를 첨부한다.

## 미비 사항 및 보고서 기재 문구

- 실제 MySQL DB 조회 및 실제 영상 파일 재생은 미검증이다.
- Gemini API 키가 없어 실제 외부 평가 성공은 미검증이다.
- 자동 테스트의 평가 제공자와 브라우저 API 응답은 대체했다.
- 기존 루브릭은 제한된 수식 구조를 비교하며 Excel 실행이나 모든 동등 수식을 보장하지 않는다.
- 제출 이력·재시도 횟수 저장, 계정별 학습 기록, 제출 횟수별 정답 공개 정책은 이번 범위에 포함하지 않는다.
- 공개 AI 엔드포인트의 사용자별 호출 제한·비용 관리는 후속 운영 작업이다.
- AI 검색의 기존 메인 앱 연결 누락은 이번 피드백 작업에서 변경하지 않았다.

권장 기재 문구:

> 학습자 영상 상세와 서버 DB 기반 AI 피드백 API를 연결하고 자동 테스트 및 대체 응답 기반 브라우저 검증을 완료했다. 실제 MySQL·Gemini 환경이 제공되지 않아 외부 서비스 전체 연동과 실제 영상 재생은 추가 검증이 필요하다.
