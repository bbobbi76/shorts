# FastAPI 관리자 백엔드

기존 FastAPI·DB 코드를 활용해 React 관리자 화면용 `/api/ui` API를 추가한 백엔드입니다.
관리자 로그인, 과정·콘텐츠 저장·조회·수정, 파일 업로드, 공개·비공개 검사를 제공합니다.
기존 `backend/ai` 모듈과 실제 AI 호출 연결은 별도 작업입니다.

## 로컬 실행

저장소 루트에서 Python 3.12와 MySQL 8.0을 준비한 뒤 실행합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
```

`backend/.env`에 MySQL 계정·비밀번호를 설정합니다. `.env`는 Git에 올리지 않습니다.
DB_NAME 기본값은 `workfit_jimin_week3`입니다. 비어 있는 별도 DB 이름을 권장합니다.

```powershell
cd backend
..\.venv\Scripts\python.exe init_db.py
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

초기화 스크립트는 기존 테이블을 삭제하지 않습니다. 원본 SQL의 DROP 구문은 제거해 실행합니다.
기존 WorkFit DB라면 데이터를 보존하고 ui_records 보조 테이블만 추가합니다.
새 DB의 영상 예시는 파일이 없으므로 임시저장 상태로 시작합니다.
초기 계정은 `admin@workfit.dev`, 초기 비밀번호는 `.env`의 INITIAL_ADMIN_PASSWORD 값입니다.
API 문서는 http://127.0.0.1:8000/docs 에서 확인합니다.

## React 화면 연결

`Front/.env.local`을 다음과 같이 만들고 Front의 기존 실행 안내에 따라 서버를 실행합니다.

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api/ui
```

기존 Vite 프록시는 `/api` 요청을 127.0.0.1:8000으로 전달합니다.
관리자 로그인 후 과정·콘텐츠를 저장하고 새로고침·공개·비공개를 확인합니다.
과정의 주제는 등록된 교육 분야(엑셀, 문서 작성, AI 업무 활용 등)를 입력합니다.
프론트 입력 길이가 DB 제한보다 길면 서버가 거절할 수 있습니다.
과정·콘텐츠 제목 100자, 과정 소개와 학습 목표 500자, 퀴즈 보기 255자 제한입니다.

## 테스트와 확인 범위

backend 폴더에서 실행합니다.

```powershell
..\.venv\Scripts\python.exe -m pytest tests -q
```

SQLite API 테스트에 인증·저장·파일·공개 보호 및 CORS·OpenAPI 계약 검증이 포함됩니다. 실제 MySQL 연결과 브라우저 통합 시연은 미완료입니다.
실제 MySQL의 ENUM·FULLTEXT·ngram 동작은 이 테스트로 검증되지 않습니다.
세션은 서버 메모리에 보관해 재시작 시 만료되고 영상은 로컬에 저장합니다.
MP4는 헤더에 재생 시간이 기록된 파일을 지원하며 영상 전체 디코딩 검증은 하지 않습니다.
사용자 검색·답안 제출·진도 저장·AI 생성 기능은 이번 추가 API 범위에 포함하지 않았습니다.

## AI 사용

Codex로 기존 코드 분석, 연동 코드 작성·수정, 테스트와 실행 안내 작성을 진행했습니다.
실제 MySQL 연동 및 통합 테스트는 후속 개발 과정에서 확인할 예정입니다.

## 4주차 작업

[백엔드 담당 작업 및 연동 확인](docs/WEEK4_BACKEND.md), [요청·응답·오류 명세](docs/ENDPOINTS.md)를 참고합니다.
