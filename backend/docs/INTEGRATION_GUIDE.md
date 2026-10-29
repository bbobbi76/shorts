# 관리자 화면 연동 안내

## 실행 준비

4주차 수정본은 main에 반영되어 있습니다. 파일 업로드 실패 처리와 분야·스킬 조회 API가 포함된 5주차 수정본은 `week5-backend-followup` 브랜치를 사용합니다. 프론트 담당자의 `front` PR 반영 여부는 별도로 확인합니다.

- Python 3.12
- MySQL 8.0
- Node.js 22.12 이상 또는 24 이상

저장소 루트에서 실행합니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
Copy-Item Front/.env.example Front/.env.local
```

이미 환경 파일이 있으면 덮어쓰지 않고 필요한 설정만 확인합니다.

`backend/.env`에서 DB_USER와 DB_PASSWORD를 본인의 MySQL 계정으로 설정합니다.
새 개발 DB를 사용할 때는 DB_NAME을 `workfit_jimin_week4`처럼 기존 데이터베이스와 다른 이름으로 지정합니다.
FRONTEND_ORIGIN은 `http://127.0.0.1:5173`으로 설정합니다.

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=본인의_MySQL_비밀번호
DB_NAME=workfit_jimin_week4
FRONTEND_ORIGIN=http://127.0.0.1:5173
UPLOAD_DIR=./uploads
INITIAL_ADMIN_PASSWORD=admin1234
```

`Front/.env.local`은 아래와 같이 설정합니다.

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api/ui
```

환경 설정이 없으면 프론트는 목업 모드로 동작합니다. API 연결 상태는 화면 상단의 `API 연결` 표시와 브라우저 Network의 `/api/ui` 요청으로 확인합니다.

## 백엔드 실행

저장소 루트에서 실행합니다.

```powershell
cd backend
..\.venv\Scripts\python.exe init_db.py
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

init_db.py는 빈 DB에 schema.sql과 seed.sql을 반영하고 ui_records 테이블을 생성합니다.
기존 DB에서는 테이블 삭제나 초기 데이터 재삽입을 하지 않습니다. 누락된 컬럼이나 ENUM을 자동으로 변경하는 마이그레이션 도구는 아닙니다.

- API 상태: http://127.0.0.1:8000/api/health
- Swagger: http://127.0.0.1:8000/docs

## 프론트 실행

새 터미널을 열고 저장소 루트에서 실행합니다.

```powershell
cd Front
npm.cmd ci
npm.cmd run dev
```

관리자 주소: http://127.0.0.1:5173/admin/contents

Vite가 `/api` 요청을 `http://127.0.0.1:8000`으로 전달합니다. localhost와 127.0.0.1을 섞지 않습니다.
.env.local 변경 후에는 프론트 개발 서버를 다시 실행합니다.

## 개발용 테스트 계정

새 개발 DB를 위 설정대로 초기화하고 백엔드를 실행하면 다음 계정을 사용합니다.

| 항목 | 값 |
|---|---|
| 이메일 | `admin@workfit.dev` |
| 비밀번호 | `admin1234` |
| 권한 | 관리자 |

이 계정은 새 DB의 seed 데이터 기준입니다. INITIAL_ADMIN_PASSWORD를 변경했다면 해당 값을 사용합니다.
기존 DB에 이미 해시가 저장된 계정은 INITIAL_ADMIN_PASSWORD를 바꿔도 비밀번호가 재설정되지 않습니다.
DB 접속 비밀번호와 관리자 로그인 비밀번호는 서로 다릅니다.

로그인은 `/api/ui/auth/login`을 사용합니다. 태그·자료 관리도 같은 HttpOnly 쿠키와 CSRF 토큰을 사용하므로 별도 로그인은 필요하지 않습니다.
세션은 서버 메모리에 저장되어 서버 재시작 시 만료됩니다.

## 연동 확인 순서

1. 로그인하고 과정 생성 화면에서 난이도를 입문(INTRO)으로 저장한 뒤 새로고침합니다.
2. 콘텐츠에 실습 설정, 보기별 피드백, 다시 볼 시점, 업무 활용, 순서를 입력합니다.
3. 검색 태그와 동의어, 실무자료를 등록하고 콘텐츠의 태그·스킬·자료를 연결합니다.
4. 자막 시작·종료 시점과 문장을 입력하고 검수(REVIEW) 상태로 저장합니다.
5. 상세 화면을 다시 열어 추가 항목이 유지되는지 확인합니다. 일부 연결 항목과 자막을 지운 뒤 저장·재조회도 확인합니다.
6. 실제 MP4와 퀴즈 필수 항목을 채워 콘텐츠를 공개합니다. 이후 과정 편집 화면에서 과정을 공개합니다.
7. 사용자 화면에는 공개된 과정·콘텐츠·자료만 나오는지 확인합니다.
8. 로그아웃 후 관리자 기능 접근이 차단되는지 확인합니다.

콘텐츠 공개와 과정 공개는 별개입니다. 콘텐츠 공개만으로 과정 상태가 자동 변경되지 않습니다.
보기별 피드백의 작성 주체는 변경된 피드백 본문을 기준으로 서버가 ADMIN 또는 NONE으로 처리하며, 변경하지 않은 기존 AI 초안 표시는 유지합니다.
자막은 구간 배열 저장을 지원합니다. 관리자 API의 SRT·SMI 파일 파싱은 이번 변경 범위에 포함하지 않습니다.

## 검증 범위

백엔드 SQLite 테스트와 프론트 테스트·빌드로 계약과 인증·저장 동작을 확인합니다.
현재 로컬 MySQL은 계정 인증 실패로 실제 DB 연동 검증을 마치지 못했습니다. 브라우저와 MySQL을 함께 사용하는 최종 확인은 위 설정 후 진행해야 합니다.

```powershell
# backend 폴더
..\.venv\Scripts\python.exe -m pytest tests -q

# Front 폴더
npm.cmd test
npm.cmd run build
```
