# 6주차 백엔드 연동 작업 및 시연 안내

## 요청의 의미와 담당 범위

팀원이 main에 올린 AI 검색, AI 피드백, 시연 데이터는 각각 구현된 모듈이다.
현지민 담당 작업은 이 모듈을 기존 FastAPI 앱과 DB·파일 API에 연결하고, 실제 프론트에서 호출할 수 있도록 검증하는 것이다.
첨부 요청 문서의 패치는 작업 참고 자료이며, 이 브랜치에는 이미 적용되어 있으므로 다시 실행하지 않는다.

기준 커밋: main `4a964d7`. 작업 브랜치: `codex/week6-backend-integration`.

## 이 PC에서 바로 시연하기

2026-11-08 실제 MySQL·Gemini·브라우저 검증까지 완료했다.
현재 시연 주소는 `http://127.0.0.1:5186/learn`, API 문서는 `http://127.0.0.1:8000/docs`다.
서버가 꺼진 뒤에는 레포 루트에서 다음 명령으로 다시 실행한다.

```powershell
.\backend\scripts\start_week6_demo.ps1
```

이 PC의 기존 MySQL80 서비스(3306)는 변경하지 않았다. 작업 폴더의 `../tmp/week6-mysql/data`에
별도 MySQL 8.0.45 인스턴스(127.0.0.1:3307)를 만들고 전용 계정·임의 비밀번호로 보호했다.
DB명은 `workfit_jimin_week6_demo`이고, 접속 정보와 Gemini 키는 Git 제외 파일 `backend/.env`에만 저장했다.
로컬 MySQL 관리자 비밀번호는 레포 밖 `../tmp/week6-mysql/admin.env`에 보관했다.
재실행 스크립트는 이 PC에 이미 구성한 환경용이다. 팀원 PC의 최초 구성은 아래 실행 순서를 따른다.

## 반영한 내용

| 항목 | 반영 내용 |
| --- | --- |
| 시연 데이터 | `init_db.py --demo`가 새 DB에만 시연 SQL과 파일을 추가. 기존 DB는 보존 |
| AI 검색 | `POST /api/ai/search` 등록, DB 공개 콘텐츠·자막 자동 인덱싱 및 공개 여부 재검사 |
| 서버 수명 주기 | 모듈 import 시 동기화 스레드를 시작하지 않음. 서버 시작 때 시작하고 종료 때 정지 요청 |
| AI 피드백 | 기존 `app.routers.ai_feedback`의 LIVE·mock API를 메인 앱에 등록 |
| 실습 식별자 | 공개 콘텐츠 응답에 `practiceId`만 추가. 정답·평가 기준은 기존처럼 비공개 |
| 과정 썸네일 | 공개된 콘텐츠가 있는 공개 과정의 썸네일을 공개 파일 API에서 제공. 비공개 전환 시 차단 |
| 검색 화면 | 팀원이 제공한 프론트 패치 적용. AI 검색 성공 시 자막 위치로 이동, 실패·빈 결과는 기존 검색 사용 |
| 피드백 화면 | 학습 화면에 수식/결과 제출, 실제 피드백, 오류·검토 필요 표시 추가 |
| 의존성 | 백엔드 requirements에서 AI 검색 패키지와 OpenAI 의존성 설치. greenlet 누락도 보완 |

피드백 LIVE 요청은 다음 형식이다. `practice_id`는 콘텐츠 ID가 아니라 공개 콘텐츠 응답의 `practiceId`를 사용한다.

```json
{"practice_id": 1, "learner_answer": "=SUM(A1:A3)", "answer_type": "FORMULA"}
```

서버가 DB에서 정답과 평가 기준을 읽으며 클라이언트가 추가한 정답은 신뢰하지 않는다.
일반 콘텐츠 조회에는 정답이 없지만, 제출 후 피드백에는 기존 모듈 정책대로 참고 답안이 포함될 수 있다.
제출 횟수에 따른 정답 공개 제한·제출 이력 저장은 기존 모듈에 없으며 이번 연결에서도 구현하지 않았다.

## 실행 순서

레포 루트에서 실행한다. Python 3.12 이상과 MySQL 8.0이 필요하다.

```powershell
python -m venv .venv
cd backend
..\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

`backend/.env`에 실제 DB 접속 정보를 입력한다. `DB_NAME`은 기존 DB와 다른 새 이름(예: `workfit_jimin_week6_demo`)을 사용한다.
실제 AI 검색과 피드백은 아래 설정이 필요하다. 키는 Git에 올리지 않는다.

```dotenv
SEARCH_PROVIDER=gemini
FEEDBACK_PROVIDER=gemini
GEMINI_API_KEY=발급받은_실제_키
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

키가 없으면 검색은 `SEARCH_PROVIDER=mock`으로 실행할 수 있지만 의미 기반 검색 품질 검증은 되지 않는다.
LIVE 피드백은 키가 없으면 503이며 가짜 성공으로 대체하지 않는다. `/api/ai/feedback/mock`은 별도의 예시 평가 API다.

```powershell
..\.venv\Scripts\python.exe init_db.py --demo
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

다른 터미널에서 `Front/.env.local`에 아래 내용을 설정한 뒤 프론트를 실행한다.
기존 파일이 있다면 필요한 설정만 수정한다.

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api/ui
```

```powershell
cd Front
npm install
npm run dev
```

프론트 Vite는 `/api`를 `http://127.0.0.1:8000`으로 프록시한다.
관리자 로그인은 시드 계정 `admin@workfit.dev`와 설정된 초기 관리자 비밀번호를 사용한다(기본 `admin1234`).
설치한 `.venv`는 레포 루트에 있으므로 기존 요청 문서의 `backend/.venv` 경로와 다르다.

## 재현 가능한 검증

이번 작업 환경의 결과: 백엔드·AI `197 passed, 1 skipped`, 프론트엔드 `48 passed`, 프론트 빌드 성공,
`pip check` 의존성 충돌 없음. 건너뛴 테스트는 실제 Gemini 호출을 명시적으로 활성화해야 실행되는 테스트다.
Starlette/AnyIO의 기존 deprecation warning 1개는 남아 있다.

레포 루트에서:

```powershell
$env:PYTHONPATH = 'backend'
.\.venv\Scripts\python.exe -m pytest backend/tests backend/ai ai-search/tests -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pip check
cd Front
npm test
npm run build
```

추가한 통합 테스트는 공개 콘텐츠 → 실습 ID → 피드백 API 흐름, DB 정답 사용, 비공개 전환 시 파일·피드백 차단,
과정 썸네일 응답, 검색 공통 입력 검증, 새 DB에만 시연 데이터 추가, SQL이 참조하는 파일 38개의 존재·크기를 확인한다.
기존 AI 검색 테스트는 인덱싱·갱신·공개 필터를, 피드백 테스트는 제공자 요청·루브릭·보류 처리를 검증한다.
외부 AI 요청은 테스트 대역으로 대체한다.

## 실제 MySQL·Gemini·브라우저 검증 결과

재현 명령(backend 폴더): `..\.venv\Scripts\python.exe scripts/verify_week6_demo.py`.
전용 시연 DB에서만 실행되며, 비공개 검증을 위해 바꾸는 상태는 finally에서 복구한다.
자동 실측 기록은 [WEEK6_LIVE_VERIFICATION.json](WEEK6_LIVE_VERIFICATION.json)에 저장했다.

| 검증 | 결과 |
| --- | --- |
| 실제 MySQL 초기화 | 공개 과정 3개·콘텐츠 12개·실습 11개 생성 |
| 기존 DB 재초기화 | `--demo` 재실행 시 기존 데이터 보존·추가 삽입 생략 확인 |
| 공개 파일 | 영상·콘텐츠/과정 썸네일·CSV 총 38개 다운로드 성공 |
| 영상 구간 응답 | HTTP 206, 요청한 16바이트 응답 확인 |
| 관리자 로그인 | 실제 시드 계정 로그인 및 관리자 콘텐츠 조회 성공 |
| 자연어 검색 1 | “사번으로 이름 찾고 싶어” → VLOOKUP, 브라우저 자막 위치 링크 확인 |
| 자연어 검색 2 | “이번 달 부서별 매출 합치려면?” → SUMIF·피벗·SUMIFS |
| 무관한 검색 | “오늘 점심 메뉴 추천해줘” → 결과 없음 |
| 실습 피드백 | DB에 저장된 SUMIF 정답 제출 → 실제 API 및 브라우저에서 정답·100점 |
| 비공개 정책 | 콘텐츠·과정 각각 비공개 시 콘텐츠/파일/피드백 404, 검색 결과 제외 |
| 검증 후 복구 | 공개 콘텐츠 12개로 복구 확인 |
| 브라우저 학습 | 영상 88초 메타데이터·readyState 4·오류 없음, CSV 다운로드 성공 |

실제 요청에서 발견된 SDK API 버전 호환 오류는 피드백과 검색어 정제에 `v1beta`를 명시하여 수정했다.
검색 임베딩은 v1로 정상 응답한다. 전체 Gemini 채점 사례를 망라한 품질 보장은 아니며,
근거 불충분 시 검토 필요로 보류하는 기존 정책은 유지한다.

## 완료 보고서에 반영할 협업 분석 초안

시너지가 난 부분: AI 검색·피드백 담당자가 모듈과 검증 자료를 제공하여 백엔드는 기존 DB·공개 정책에 연결하는 데 집중할 수 있었다.
패치와 시연 데이터를 공유해 같은 기준으로 테스트할 수 있었다. AI는 연결 누락 탐색, 코드 수정, 회귀 테스트 작성에 활용했다.

비효율이 생긴 부분: 모듈 구현 완료와 메인 앱 연결 완료가 분리되어 있었고, 프론트에 실습 ID가 없어 호출 계약이 완성되지 않았다.
DB 계정·API 키·실행 환경이 공유되지 않으면 코드 연결 이후 실제 시연 검증이 지연된다.

마무리 결과: 코드·자동 검증과 실제 환경 검증을 구분하고, 전용 DB와 실제 키로 시연 시나리오를 확인하여 연동 작업을 완료했다.
실제 팀원 간 협업 경험·역할 분담·소감은 본인 경험에 맞게 보완한 뒤 제출한다.
