# 실무 한 컷 · 관리자·사용자 프론트

기존 React·TypeScript·Vite 프론트를 유지하면서 WorkFit DB의 필드와 상태에 맞췄습니다. 설정이 없으면 목업 모드로 동작합니다. 실제 API 연결은 `.env.example`을 `.env.local`로 복사한 뒤 실행합니다. 서버 실행과 개발 계정은 [연동 안내](../backend/docs/INTEGRATION_GUIDE.md)를 참고합니다.

## 실행

Node.js 22.12 이상 또는 24 이상에서 이 폴더를 엽니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

http://127.0.0.1:5173/admin/contents 에 접속합니다. `start-local.cmd`를 더블클릭해도 됩니다. 목업 모드는 비밀번호 없이 입장하고, API 모드는 서버의 관리자 계정으로 로그인합니다.

## 반영 내용

- 과정: 분야 선택(JOB/COMMON), 난이도 INTRO/BASIC/ADVANCED, 소개·학습 목표·썸네일·공개 상태.
- 콘텐츠: 활용 업무, 과정 내 순서, 영상 교체 버전, DRAFT/REVIEW/PUBLISHED/HIDDEN.
- 퀴즈: 보기 2~4개·정답 1개·해설, 보기별 피드백·작성 주체·다시 볼 시점. 보기 삭제 시 정답과 피드백도 함께 이동합니다.
- 선택 실습: 제목·안내·예제 파일·정답 결과·숫자/텍스트 비교·허용 오차·핵심 함수·정답 수식.
- 검색 태그: 업무 상황·오류·함수·툴과 동의어 등록·수정 및 중복 검사.
- 실무자료: 템플릿·예시 문서·프롬프트 등록·수정 및 콘텐츠에 여러 자료 연결.
- 스킬 연결, 자막 구간 입력과 범위 검사.
- 콘텐츠 공개 조건 검사. 과정 공개에는 학습 목표와 공개된 콘텐츠 1개 이상이 필요합니다.
- 사용자에게는 공개 과정·콘텐츠·자료만 노출합니다. 실습 정답 기준은 사용자 데이터에서 제외합니다.

## 화면

| 주소 | 용도 |
| --- | --- |
| `/admin/dashboard` | 회원·과정·콘텐츠·자료 통계와 최근 운영 내역 |
| `/admin/courses` | 과정 목록·등록·수정 |
| `/admin/courses/:id/order` | 과정 전체 콘텐츠 순서 변경·저장 |
| `/admin/contents` | 콘텐츠 목록·등록·수정·미리보기·공개 |
| `/admin/resources` | 실무자료 관리 |
| `/admin/tags` | 검색 태그·동의어 관리 |
| `/learn/courses` | 등록한 공개 과정 탐색 |
| `/learn/courses/:id` | 공개 콘텐츠를 입력한 순서대로 표시 |
| `/learn` | 공개 영상의 제목·학습 목표·자막 검색, 과정·난이도 필터, 이어보기 |
| `/learn/contents/:id` | 영상 재생·자막 구간 이동·실습 자료 다운로드·학습 메모 |
| `/learn/history` | 이 브라우저의 시청 위치·메모 확인 및 삭제 |
| `/learn/preview` | 기존 과제·AI 피드백 화면 예시 |

기존 AI 퀴즈 초안과 `/learn/preview`는 화면 예시로 유지했습니다. `/learn`의 검색은 실제 공개 자료를 대상으로 하는 단어 검색입니다. AI 검색 서버·퀴즈 제출·AI 피드백·서버 학습 기록은 아직 연결하지 않았습니다. 시청 위치와 메모는 이 브라우저에 저장하며 로그인 계정 간 동기화되지 않습니다.

## 저장 방식

목업 모드에서는 내용과 파일 Blob을 기존 IndexedDB `douzone-admin-demo-v1`에 저장합니다. 이전 데이터의 필드를 자동으로 옮기며 기존 파일·퀴즈·실습 안내를 보존합니다. 이전 직무·주제는 참고 정보로 남깁니다. 이전 과정에 공개 상태가 없으면 초안으로 옮기므로 과정에서 공개 상태를 선택해 저장하세요.

목업 데이터는 접속 주소·브라우저별로 분리됩니다. `VITE_DATA_MODE=api`이면 관리자·카탈로그·사용자 조회 모두 `/api/ui` API를 사용합니다. Vite는 `/api` 요청을 `http://127.0.0.1:8000`으로 전달합니다. 서버 연결에 실패해도 목업으로 자동 전환하지 않습니다. 환경 설정을 변경하면 개발 서버를 다시 시작하세요.

## 검증

```powershell
npm.cmd test
npm.cmd run build
```

사용자 페이지의 구현 범위와 검증은 [LEARNER_FRONTEND_WORK.md](docs/LEARNER_FRONTEND_WORK.md)를 확인하세요. 관리자 작업 요약은 [WEEK5_FRONTEND_WORK.md](docs/WEEK5_FRONTEND_WORK.md), 관리자 보완·검증은 [ADMIN_REVIEW_WEEK5.md](docs/ADMIN_REVIEW_WEEK5.md), API 요청 형식은 [API_CONTRACT.md](docs/API_CONTRACT.md)를 확인하세요. [WORKFIT_DB_ALIGNMENT.md](docs/WORKFIT_DB_ALIGNMENT.md)와 [VERIFICATION_WORKFIT.md](docs/VERIFICATION_WORKFIT.md)는 10월 25일 프론트 전용 작업 당시의 기록입니다.

## 소스 구조

```text
src/
  main.tsx               # 진입점과 화면 경로
  app/styles.css         # 앱 공통 스타일
  features/
    admin/               # 관리자 화면과 관리자 전용 상태
      auth/              # 로그인
      courses/           # 과정 목록·편집
      contents/          # 콘텐츠 목록·편집·미리보기·세부 입력
      catalog/           # 검색 태그·실무자료 관리
      media/             # 업로드·파일 미리보기
      quiz/              # 기존 AI 퀴즈 화면 예시
    learner/             # 공개 자료 검색·과정·영상·자막·로컬 학습 기록 및 기존 화면 예시
  shared/                # 공통 폼·모달·오류 표시·날짜/파일 크기 표시
  domain/                # 데이터 타입·공개 조건·검증·기존 데이터 변환
  data/
    repository.ts        # 목업/API 선택과 앱이 사용하는 저장소
    config.ts            # 환경 설정
    api/                 # 관리자·사용자 HTTP 어댑터
    mock/                # IndexedDB 및 관리자·사용자 목업 저장소
```

관리자 기능은 해당 `features/admin/` 하위 폴더에서 수정하고, 서버 경로·요청 형식은 `data/api/`, 공통 데이터 타입은 `domain/model.ts`에서 관리합니다. IndexedDB 이름과 기존 데이터 변환 규칙은 유지했습니다.

관리자 분야·스킬 DB 조회, 통계, 미공개 초안 삭제와 일괄 순서 변경의 연결·인증·검증 범위는 [ADMIN_API_CONNECTIONS.md](docs/ADMIN_API_CONNECTIONS.md)를 확인하세요. 삭제는 과정에 연결해 저장한 미공개 콘텐츠에 제공하며, 공개 이력은 서버가 검사합니다.
