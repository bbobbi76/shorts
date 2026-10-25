> 최신 Front 추가 항목 반영 후의 작업 결과는 [활동 정리](WEEK4_BACKEND_ACTIVITY.md), 실행·계정 안내는 [연동 안내](INTEGRATION_GUIDE.md)를 참고합니다. 아래는 최초 4주차 점검 기록이며, 과정 공개 방식과 필드 계약은 최신 [API 명세](ENDPOINTS.md)가 기준입니다.

# 4주차 백엔드 작업 및 팀 연동 안내

## 우선순위와 담당 범위

1. 백엔드: 관리자 API 제공, HttpOnly 쿠키·CSRF·CORS 연동, 요청/응답/오류 명세 제공.
2. 프론트 담당자와 함께: 목업 모드를 API 모드로 전환하고 로그인, 과정/콘텐츠 저장, 파일 업로드, 공개/비공개를 확인.
3. DB 담당자와 함께: 테이블별 등록일·수정일 누락 검토와 기존 DB 마이그레이션 합의.
4. AI 담당자: 실제 AI API를 사용한 목업 검색·피드백 결과 구현. 백엔드는 추후 연결 계약 협의.

초안 보조테이블 구조는 유지한다. 4주차 관리자 연동에 필수인 변경에 집중한다.

## 이번 수정

- 쿠키 포함 CORS 응답을 허용했다. 허용 Origin은 backend/.env의 FRONTEND_ORIGIN 한 개다.
- /api/ui JSON 응답에 Pydantic 응답 모델과 오류 모델을 연결했다. /docs에서 요청과 응답 필드·타입을 확인할 수 있다.
- Front/.env.example에 실제 백엔드 경로를 제공했다. 기본 목업 동작은 설정으로 전환한다.
- CORS와 OpenAPI 계약 회귀 테스트를 추가했다.

## 실행과 연동 확인

backend/README.md에 따라 MySQL 초기화와 API 서버를 실행한다. 기존 운영 DB 대신 별도 개발 DB를 사용한다.

```powershell
Copy-Item Front/.env.example Front/.env.local
cd Front
npm ci
npm run dev
```

Vite는 127.0.0.1:5173에서 /api를 127.0.0.1:8000으로 프록시한다.
브라우저는 http://127.0.0.1:5173으로 접속한다. .env 수정 후 Vite를 재시작한다.
직접 교차 Origin으로 호출하면 FRONTEND_ORIGIN을 브라우저 주소와 정확히 맞춘다.
localhost와 127.0.0.1을 섞지 않는다. 로컬 HTTP 개발 쿠키는 SameSite=Lax다.

확인 순서:

1. admin@workfit.dev와 INITIAL_ADMIN_PASSWORD로 로그인. /auth/session 응답과 HttpOnly 쿠키 확인.
2. 과정 생성: 주제는 DB categories에 등록된 값(예: 엑셀). 새로고침 후 유지 확인.
3. 빈 콘텐츠 초안 저장, 과정 지정 후 수정. 새로고침 후 유지 확인.
4. MP4 업로드 후 제목·목표·퀴즈 질문·보기·정답·해설을 채워 공개. 오류의 fields를 화면에서 확인.
5. 공개 조회에 quiz·정답이 없는지 확인. 비공개 전환 후 공개 파일도 404인지 확인.
6. 로그아웃 후 관리자 조회가 401인지 확인.

브라우저 Network의 /api/ui 요청이 보이는 것으로 목업 모드가 아닌지 확인한다.
자동 테스트는 SQLite를 사용한다. 실제 MySQL·브라우저 통합 시연은 별도로 수행해야 한다.

## 날짜 필드 피드백 확인 결과

현재 schema.sql에는 users, courses, contents, quizzes, practices, resources 등 핵심 테이블의
created_at/updated_at이 이미 있다. 따라서 전체에 날짜가 없다는 상태는 아니다.
categories, skills, subtitles, quiz_options, tag_synonyms, ui_records 및 일부 연결 테이블은 날짜 필드가 없다.
등록/수정 이력이 필요한 테이블과 이벤트 시각만 필요한 로그 테이블을 DB 담당자가 구분해야 한다.
기존 DB에는 CREATE TABLE 수정만으로 필드가 추가되지 않으므로 별도 ALTER 마이그레이션이 필요하다.
기존 행의 과거 등록일을 복구할 수 없는 경우 마이그레이션 시각을 실제 등록일로 오해하지 않도록 합의한다.

## 후속 범위

- SRT 업로드 확장자는 기존 서버에서 허용하지만 자막 파싱·콘텐츠 연결·검색 색인까지 완료된 상태는 아니다.
- SMI 파싱은 미구현이다. 관리자 연동 완료 후 고도화 후보로 다룬다.
- 세션은 메모리에 있어 서버 재시작 시 만료된다. 다중 프로세스 운영 전 공유 세션 저장소가 필요하다.
- AI 검색·피드백 실제 호출 연결은 이번 변경에 포함하지 않는다.
