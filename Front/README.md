# 실무 숏폼 관리자 프론트엔드

1조 2주차 최종 기획의 **엑셀 기초 과정**을 기준으로 만든 3주차 관리자 화면입니다. 과정·콘텐츠 등록, 영상·썸네일 업로드, 퀴즈·자료 입력, 미리보기, 공개·비공개 전환을 포함합니다. 외부 배포는 하지 않습니다.

관리자 화면 개선판의 변경 사항·실제 사용 도구·검증·페이지별 캡처는 [IMPROVEMENTS.md](docs/IMPROVEMENTS.md)에, 색상·글자·간격·접근성 규칙은 [DESIGN.md](docs/DESIGN.md)에 정리했습니다. 기존 API 경로·데이터 모델·저장소를 유지하며 새 UI 라이브러리는 추가하지 않았습니다.

## 실행

Node.js 22.12 이상 또는 24 이상이 필요합니다. 이 폴더에서 실행합니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

브라우저에서 http://127.0.0.1:5173/admin/contents 를 엽니다. Windows에서는 `start-local.cmd`를 더블클릭해도 됩니다. 실행 창을 닫으면 서버가 종료됩니다. 포트 5173을 이미 사용 중이면 자동으로 다른 포트로 바꾸지 않고 오류를 표시합니다.

### 관리자·사용자 화면

- `/`: 관리자·사용자 선택 화면
- `/admin/contents`, `/admin/courses`: 관리자 등록·수정·공개 화면
- `/learn`: 사용자 공개 과정 탐색
- `/learn/courses/:id`: 공개 과정의 영상 목록
- `/learn/contents/:id`: 공개 영상 재생과 실습·업무자료 확인

예시 모드에서 사용자로 입장하면 일반 회원 역할이 적용되어 관리자 직접 진입이 차단됩니다. 관리자는 메뉴의 `사용자 화면 보기`로 실제 공개 상태를 확인할 수 있습니다. 공개 콘텐츠가 없을 때는 사용자 화면에만 `화면 예시` 과정과 영상이 표시됩니다. 이 예시는 실제 관리자 콘텐츠나 API 응답에 저장되지 않습니다.

초안·비공개 콘텐츠와 공개 영상이 없는 과정은 사용자 목록에서 제외하며 직접 조회·첨부 파일 조회도 차단합니다. 예시 모드에서 공개 콘텐츠가 하나도 없으면 사용자 화면에서만 샘플 과정과 영상을 대신 표시합니다. 사용자 응답에는 관리자 공개 상태나 퀴즈 정답·해설을 포함하지 않습니다. 사용자 화면은 현재 탐색·영상 재생·자료 확인까지 제공하며 퀴즈 제출·학습 진도·AI 피드백은 아직 연결하지 않았습니다. 실제 회원 인증·권한은 백엔드 구현이 필요합니다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`preview` 기본 주소는 http://127.0.0.1:4173 입니다. IndexedDB는 접속 주소별로 분리되므로 dev와 preview의 예시 데이터는 서로 다릅니다.

## 두 가지 데이터 모드

### 기본 mock 모드

- 시연용 관리자 세션과 예시 과정 1개, 영상 미등록 상태의 초안 3개로 시작합니다.
- 입력 내용과 실제 파일 Blob은 **현재 브라우저의 IndexedDB**에 저장합니다. 저장 성공 후 새로고침해도 복원됩니다. 브라우저 저장소 삭제 시 사라지며 다른 브라우저·컴퓨터와 공유되지 않습니다.
- 저장 전 변경사항은 메모리에만 있습니다. 화면 이동·새로고침 시 확인창이 표시되지만 브라우저 종료 후 미저장 내용을 복구하는 기능은 없습니다.
- 시연 관리자 권한은 UI 확인용입니다. 실제 인증·DB·서버 권한 검사를 구현했다는 의미가 아닙니다.
- 좌측 `연결 및 시연 설정`에서 다음 저장/업로드 실패, 로그인 만료, 권한 없음을 재현합니다.
- 로그인 만료 시 로그인 대화상자가 표시되며 현재 편집 내용은 뒤 화면에 유지됩니다.

### 실제 API 모드

`.env.example`을 `.env`로 복사한 뒤 다음처럼 설정하고 개발 서버를 다시 실행합니다.

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api
```

- 개발 서버는 `/api` 요청을 `http://127.0.0.1:8000`으로 전달합니다. 서버 주소는 `vite.config.ts`의 proxy에서 바꿉니다.
- 예시 데이터로 자동 전환하지 않습니다. 백엔드 미실행·연결 실패는 오류로 표시합니다.
- API 경로와 JSON 형식은 [API_CONTRACT.md](docs/API_CONTRACT.md)의 **프론트 기준 제안 계약**입니다. 팀 백엔드가 정해지면 이 계약을 합의하거나 `src/repository.ts`의 API 어댑터를 수정합니다.
- 쿠키 세션을 사용합니다. 모든 요청은 `credentials: include`이며 세션·로그인 응답의 CSRF 토큰을 변경 요청에 전달합니다. 비밀번호·AI 키·DB 접속 정보를 프론트 환경변수에 넣지 않습니다.
- **현재 실제 팀 백엔드와의 연동은 미검증입니다.** 화면과 API 어댑터를 구현했고 계약·오류 처리를 자동 검사한 상태입니다.
- Vite proxy는 개발 서버 전용입니다. `preview`에서는 별도 동일 출처 API 라우팅 또는 CORS 설정과 절대 API 주소가 필요합니다.

## 화면

| 주소 | 기능 |
|---|---|
| `/admin/courses` | 과정 목록 |
| `/admin/courses/new` | 과정 등록 |
| `/admin/courses/:id` | 과정 수정 |
| `/admin/contents` | 콘텐츠 목록·제목 검색·과정/상태 필터 |
| `/admin/contents/new` | 콘텐츠 초안 등록 |
| `/admin/contents/:id` | 콘텐츠 수정·공개·비공개 |

미리보기는 편집 중인 내용을 대화상자로 보여줍니다. 미리보기의 퀴즈는 표시 확인용이며 학습 기록·답안을 저장하지 않습니다.

## 저장·공개 정책

- 과정은 과정명이 있어야 저장할 수 있습니다. 콘텐츠 초안은 일부 필수값이 없어도 저장됩니다.
- 공개에는 등록된 과정, 제목, 실제 브라우저에서 메타데이터를 읽을 수 있는 영상, 퀴즈 문제·보기 2~4개·정답 1개·해설이 필요합니다.
- 썸네일·학습 목표·선택 실습·업무자료는 공개 필수 조건이 아닙니다.
- 공개 중인 콘텐츠는 필수값을 누락한 상태로 수정 저장할 수 없습니다. 먼저 비공개로 변경하면 작성 내용을 유지한 채 수정할 수 있습니다.
- 비공개 전환은 이미 저장된 콘텐츠의 상태만 변경합니다. 작성 중인 필드 변경은 `수정 저장`을 별도로 누릅니다.
- 파일 업로드 후 콘텐츠를 저장하지 않으면 연결되지 않은 파일이 남을 수 있습니다. 실제 백엔드의 미사용 파일 정리는 후속 과제입니다.
- MP4 100MB, JPG/PNG 5MB, 예제·템플릿 20MB를 초기 검증 정책으로 설정했습니다. 백엔드에서도 형식·용량·실제 파일 내용을 다시 검사해야 합니다.

## 검증·제출

- [세부기능 설명](docs/FEATURES.md)
- [구현 현황과 제출 체크리스트](docs/SUBMISSION.md)
- [AI 사용 내역](docs/AI_USAGE.md)
- 캡처는 `output/playwright/`에 있습니다. QA용 영상은 `LOCAL QA VIDEO`로 표시된 짧은 검사 파일이며 실제 교육 콘텐츠가 아닙니다.

자동 검사는 `src/repository.test.ts`에 있으며 공개 누락, 저장·파일 복원, 상태 전환, 저장/업로드 실패, 권한, API 쿠키·CSRF·업로드·타임아웃을 확인합니다.

브라우저 시나리오는 Playwright CLI로 실행합니다. Node.js 24 기준입니다.

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli --session=learning-admin open http://127.0.0.1:5173/admin/contents
npx.cmd --yes --package @playwright/cli playwright-cli --session=learning-admin run-code --filename=scripts/browser-flow.cjs
npx.cmd --yes --package @playwright/cli playwright-cli --session=learning-admin run-code --filename=scripts/browser-errors.cjs
npx.cmd --yes --package @playwright/cli playwright-cli --session=learning-admin run-code --filename=scripts/browser-responsive.cjs
npx.cmd --yes --package @playwright/cli playwright-cli --session=learning-admin run-code --filename=scripts/browser-usability.cjs
```

재실행 시 QA 예시 항목이 추가됩니다. 일반 사용 브라우저와 별도 세션에서 실행하세요. 캡처·테스트 파일은 `.gitignore`에서 제외되며, 제출용 캡처는 별도 첨부하거나 명시적으로 포함합니다.

검사용 MP4를 생성할 때는 브라우저를 전면에 둡니다. 녹화 결과가 빈 파일이면 검사를 중단하고 안내하므로 전면 상태에서 다시 실행합니다.

API 계약 화면 검사는 별도 터미널에서 `$env:VITE_DATA_MODE='api'`를 설정한 뒤 `npm.cmd run dev -- --port 5174`로 실행하고, 별도 Playwright 세션에서 `scripts/browser-api.cjs`를 실행합니다. 이 검사는 HTTP 응답을 대체하며 실제 백엔드 검증이 아닙니다.

## 사용자 학습 화면 목업

- `/learn`: 자연어 질문 입력과 고정된 예시 영상 결과
- `/learn/preview`: 학습 영상 영역, 실습 과제·확인 문제, AI 피드백 예시
- `/learn/courses`: 기존 공개 과정 목록

새 사용자 화면은 화면 구성 확인용입니다. 실제 자연어 검색, 강의 영상 연결, 과제 제출·채점, AI 분석, 학습 기록 저장을 수행하지 않습니다. 버튼은 탭·화면 이동과 예시 피드백 표시만 바꿉니다. 관리자 기능과 기존 공개 과정·콘텐츠 경로는 별도로 유지합니다.

## 관리자 AI 퀴즈 화면 (로컬 목업)

콘텐츠 편집 화면의 `03 AI 퀴즈`에서 참고 파일·텍스트, 문항 수·난이도와 추가 요청을 입력하고 퀴즈 예시를 확인할 수 있습니다. 생성된 초안은 수정·개별 삭제·전체 삭제·삭제 취소가 가능하며 화면 상태만 변경합니다. 실제 파일 전송·내용 분석·AI 생성·DB 저장은 없고, 기존 콘텐츠 퀴즈 저장과 연결하지 않았습니다.

로컬 브라우저에서 참고 파일 선택, 예시 3문항 추가, 문제 수정 반영, 개별 삭제 후 2문항·복원 후 3문항, 전체 삭제 후 0문항·복원을 확인했습니다. 빌드를 통과했습니다. 캡처: [참고 자료 첨부](docs/screenshots/38-admin-quiz-reference.png), [퀴즈 생성·관리](docs/screenshots/39-admin-quiz-drafts.png), [퀴즈 수정](docs/screenshots/40-admin-quiz-edit.png).

사용자 화면 캡처: [자연어 검색](docs/screenshots/35-natural-search.png), [실습·피드백](docs/screenshots/36-task-feedback.png), [문제·피드백](docs/screenshots/37-quiz-feedback.png).

