# 실무 한 컷

직장인과 예비 직장인이 엑셀 같은 실무 기능을 1분 안팎의 숏폼 영상으로 배우는 웹 플랫폼입니다.
업무 중 막히는 순간에 바로 찾아보고, 짧게 배운 뒤 실습으로 확인해 업무에 적용하는 흐름을 목표로 합니다.

## 주요 기능

| 구분 | 기능 |
|---|---|
| 사용자 | 영상 찾기, 과정 탐색, 숏폼 시청과 자막 구간 이동, 실습 자료 다운로드, 학습 기록과 메모 |
| 관리자 | 과정·콘텐츠 등록과 수정, 공개·비공개 처리, 영상 순서 변경, 퀴즈·실습·자막·실무자료·검색 태그 관리, 운영 통계 |
| AI 검색 | 문장으로 질문하면 영상 자막에서 관련 구간을 찾아 그 시점부터 재생 |
| AI 피드백 | 실습 답안을 서버에 등록된 정답 기준으로 평가해 점수·잘한 점·개선점·수정 답안 안내 |

```
사용자 웹 · 관리자 웹 (React)
        │  REST API /api
        ▼
백엔드 API 서버 (FastAPI)
  ├─ /api/ui           관리자·공개 API (세션 인증, CSRF, 공개 규칙 검사)
  ├─ /api/ai/search    AI 검색 (공개 콘텐츠만, DB 자막 자동 인덱싱)
  └─ /api/ai/feedback  AI 피드백 (서버 정답 기준 평가, 응답 형식 검증)
        │
        ├─ MySQL 8        과정 · 콘텐츠 · 퀴즈 · 실습 · 자막 · 태그 · 운영 기록
        ├─ 파일 저장소     영상 · 썸네일 · 실습 예제 · 실무자료 (backend/uploads)
        └─ AI             Gemini 임베딩 · 질문 정제 · 실습 평가, ChromaDB 벡터 검색
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React 19, TypeScript, Vite |
| 백엔드 | Python 3.12, FastAPI, SQLAlchemy |
| DB | MySQL 8 |
| AI | Gemini API, ChromaDB |

## 폴더 구조

```
shorts/
├─ Front/        React 프론트엔드 (src/features/admin 관리자, src/features/learner 사용자)
├─ backend/      FastAPI 백엔드 (app/ API, ai/ AI 피드백, tests/)
├─ ai-search/    AI 검색 모듈 (ai_search/ 검색·인덱싱·백엔드 연동, tests/)
├─ db/           DB 설계 (schema.sql 테이블 29개, seed.sql 초기 데이터)
└─ demo_data/    시연 데이터 (과정 3개, 샘플 영상 12개, 퀴즈 12개, 실습 11개)
```

## 실행

준비: Python 3.12, Node.js 22.12 이상, MySQL 8

### 1. 백엔드

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -r ..\requirements-ai.txt
copy .env.example .env
```

`backend/.env`에서 아래 값을 설정합니다.

| 항목 | 설명 |
|---|---|
| `DB_PASSWORD`, `DB_NAME` | MySQL 비밀번호와 새로 만들 DB 이름 |
| `SEARCH_PROVIDER` | `gemini`면 실제 AI 검색, `mock`이면 키 없이 동작 (검색 품질 낮음) |
| `GEMINI_API_KEY` | AI 검색과 AI 피드백에 사용 |

DB를 만들고 서버를 실행합니다. `--demo`를 붙이면 시연 데이터와 영상·썸네일·실습 파일이 함께 들어갑니다.

```powershell
.venv\Scripts\python init_db.py --demo
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

API 문서: http://127.0.0.1:8000/docs

### 2. 프론트엔드

```powershell
cd Front
copy .env.example .env
npm.cmd ci
npm.cmd run dev
```

| 주소 | 화면 |
|---|---|
| http://127.0.0.1:5173/learn | 사용자 |
| http://127.0.0.1:5173/admin | 관리자 (`admin@workfit.dev` / `.env`의 `INITIAL_ADMIN_PASSWORD`) |

- 백엔드가 `FRONTEND_ORIGIN`으로 요청 출처를 확인하므로 `localhost` 대신 `127.0.0.1`로 접속합니다.
- `Front/.env`가 없으면 백엔드 없이 브라우저에 저장하는 예시 데이터 모드로 동작합니다.

## 테스트

테스트 도구는 `backend` 폴더에서 `.venv\Scripts\python -m pip install -r requirements-dev.txt`로 설치합니다.

```powershell
cd backend;   .venv\Scripts\python -m pytest -q
cd ai-search; ..\backend\.venv\Scripts\python -m pytest -q
cd Front;     npm.cmd test; npm.cmd run build
```

## 세부 문서

| 문서 | 내용 |
|---|---|
| [Front/README.md](Front/README.md) | 화면 주소, 데이터 모드, 프론트 소스 구조 |
| [backend/README.md](backend/README.md) | 백엔드 API, 실행 · 연동 안내, 주차별 작업 기록 |
| [backend/ai/README.md](backend/ai/README.md) | AI 피드백 모듈과 검증 결과 |
| [ai-search/README.md](ai-search/README.md) | AI 검색 모듈, 검색 품질 개선 기록 |
| [demo_data/README.md](demo_data/README.md) | 시연 데이터 구성 |
| [db/schema.sql](db/schema.sql) | DB 테이블 설계 |

## 참고

- 학습 기록과 메모는 사용자의 브라우저에 저장합니다.
- 관리자 세션은 서버 메모리에 보관하므로 서버를 다시 시작하면 다시 로그인해야 합니다.
- 시연 데이터의 영상은 시연용 샘플 영상이며, 시연 데이터는 새 DB에만 넣을 수 있습니다.
