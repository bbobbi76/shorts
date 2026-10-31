# 5주차 관리자 프론트 점검 및 구조 정리

이후 2026-11-01 관리자 분야·스킬 DB 조회, 통계, 미공개 초안 삭제 및 일괄 순서 변경 연결은 [ADMIN_API_CONNECTIONS.md](ADMIN_API_CONNECTIONS.md)를 참고하세요. 아래는 10월 27~28일 당시의 점검 기록입니다.

작업일: 2026-10-27~28. 작업 브랜치: `front`.
[작업 요약](WEEK5_FRONTEND_WORK.md)에서 프론트 담당 범위와 남은 작업을 확인할 수 있습니다.
`origin/main`의 `9dd30d2`까지 fast-forward로 반영한 뒤 프론트만 수정했습니다. 아래는 이번 작업에서 실제 반영·확인한 내용입니다.

## 관리자 화면에서 보완한 부분

| 발견한 문제 | 반영한 동작 |
| --- | --- |
| 저장하지 않은 상태에서도 로그아웃하면 입력이 사라짐 | 로그아웃 전에 계속 작성/저장하지 않고 로그아웃 선택 제공 |
| 권한 안내에서 다른 계정으로 로그인하면 편집 화면을 벗어나 입력이 사라짐 | 같은 경로와 편집 상태를 유지한 채 로그인. 로그아웃 요청 자체가 401·403이어도 로그인으로 복귀 |
| 과정 상세·태그·자료 조회 실패 후 화면에서 다시 불러올 수 없음 | 조회 오류 요약에 다시 시도 제공. 목록을 불러오지 못한 상태와 로딩 중 상태 구분 |
| 태그·자료 저장 후 목록 조회가 실패하면 저장 자체가 실패한 것처럼 보임 | 저장 응답으로 현재 항목과 목록을 갱신. 서버가 정리한 동의어도 입력란에 반영 |
| 실무자료 파일 업로드가 시작될 때 이동 방지가 적용되지 않음 | 업로드 시작부터 저장하지 않은 변경사항으로 표시 |
| 새 콘텐츠 저장 성공 후 공개만 실패하면 신규 등록 주소에 남음 | 저장된 ID의 수정 화면에서 공개 오류 표시. 다시 공개할 때 새 항목 대신 기존 항목 수정 |
| API 모드도 브라우저에 저장 중이라고 표시 | 현재 모드에 맞는 저장 진행 안내 |
| 업로드 응답의 영상 길이를 브라우저 측정값으로 덮어씀 | 서버 응답 메타데이터를 우선 적용 |
| 콘텐츠만 공개하고 과정은 비공개여도 사용자에게 안 보이는 이유가 불명확함 | 과정과 콘텐츠가 모두 공개되어야 한다는 체크리스트·성공 안내 추가 |
| 과정 저장의 빠른 중복 요청 가능성, 빈 과정명 제출 | 요청 잠금과 과정명 필수 입력 적용 |
| README에 API가 비활성화됐다는 이전 설명이 남음 | 실제 모드 선택·프록시·파일 위치에 맞게 README와 API 요약 갱신 |

## 실제 연동에서 추가로 수정한 부분

- 과정 미지정 초안의 UUID가 과정 연결 후 서버 정수 ID로 바뀌면 편집 주소도 갱신합니다. 이 전환 후 새로고침·재수정이 가능한 것을 실제 API 연동으로 확인했습니다.
- 서버가 영상 해상도를 반환하지 않으면 `undefined×undefined`를 표시하지 않습니다.
- API 모드에서도 저장 전에 공통 콘텐츠 검증을 적용해 잘못된 자막 범위·숫자 입력 등을 화면에서 안내합니다.
- 테스트에서 모드 선택 저장소와 순수 목업 저장소를 구분해 `.env.local`이 API 모드여도 자동 테스트가 실제 서버로 잘못 요청하지 않도록 했습니다.

## 기능별 폴더

| 위치 | 역할 |
| --- | --- |
| `src/main.tsx` | 앱 진입점과 관리자·사용자 경로 |
| `src/features/admin/AdminApp.tsx`, `context.ts` | 관리자 레이아웃, 세션, 알림, 이동 방지 |
| `src/features/admin/auth/` | 로그인 |
| `src/features/admin/courses/` | 과정 목록·편집 |
| `src/features/admin/contents/` | 콘텐츠 목록·편집·세부 폼·미리보기 |
| `src/features/admin/catalog/` | 검색 태그·실무자료 관리 |
| `src/features/admin/media/` | 파일 선택·검사·업로드·미리보기 URL |
| `src/features/admin/quiz/` | 기존 AI 퀴즈 스튜디오 화면 예시 |
| `src/features/learner/` | 기존 사용자 화면·학습 목업 |
| `src/shared/` | 공통 폼·모달·오류 요약·표시 함수 |
| `src/domain/` | 타입·검증·공개 조건·기존 데이터 변환 |
| `src/data/api/` | 관리자·사용자 HTTP 어댑터 |
| `src/data/mock/` | IndexedDB 저장소와 관리자·사용자 목업 |
| `src/data/repository.ts`, `config.ts` | 모드 선택과 앱이 사용하는 저장소 |

IndexedDB 이름·저장 형식과 기존 데이터 변환은 유지했습니다. 관리자·사용자 저장소는 같은 목업 상태를 공유하며, API 모드의 관리자·카탈로그 기능도 같은 세션과 CSRF 토큰을 사용합니다. 기존 사용자 화면과 AI 예시를 이동했지만 신규 사용자 기능이나 실제 AI 연결을 추가한 것은 아닙니다.

## 검증

- `npm.cmd test`: 현재 4개 파일, 테스트 27개 통과. API 모드에서도 목업 저장소 검증이 설정에 영향을 받지 않도록 분리하고, 목업/API 전환 검증을 추가했습니다. 저장·실패 재시도·공개 범위·파일·마이그레이션·API 세션/CSRF 계약 확인.
- `npm.cmd run build`: TypeScript 검사 및 Vite 빌드 통과.
- `scripts/browser-workfit.cjs`: 실제 Chrome의 목업 모드에서 과정·콘텐츠·태그·자료 저장, 새로고침 복원, 영상 업로드·퀴즈·피드백·실습·자막·연결, 미리보기, 공개 후 사용자 조회, 모바일 화면 확인. 화면 오류 0건, 목업에서 fetch/XHR 요청 0건. 캡처 7장.
- `scripts/browser-admin-recovery.cjs`: Chrome의 API 모드에서 HTTP 응답을 가로채는 계약 검증. 과정·카탈로그 조회 재시도, 로그아웃 취소, 403 후 계정 전환과 입력 유지, 서버 저장 응답 반영, 서버 영상 길이 우선 적용, 공개 실패 복구·중복 생성 방지, 성공 후 새로고침 시 이전 오류 제거, 과정 공개 안내 확인. 생성 1회·수정 1회, 화면 오류 0건.

브라우저 검증 주소는 목업 `http://127.0.0.1:5176`, API 계약 검증 `http://127.0.0.1:5177`입니다. 기존 사용 주소 5173의 저장 데이터를 초기화하지 않았습니다. 캡처는 Git에서 제외한 `output/playwright/`에 있습니다.

위 API 계약 검증은 응답을 재현한 테스트입니다. 별도로 실제 API를 사용하는 브라우저에서도 로그인·저장·새로고침 복원·업로드·공개·사용자 조회·다운로드를 확인했습니다. 이 문서는 프론트 동작에 대한 기록이며 서버 구성과 개인 환경 설정은 포함하지 않습니다.

재현할 때는 각각 별도 터미널에서 다음 서버를 실행합니다.

```powershell
# 목업 서버는 현재 .env.local의 API 모드보다 환경 변수를 우선합니다.
$env:VITE_DATA_MODE = 'mock'
npm.cmd run dev -- --port 5176
```

```powershell
$env:VITE_DATA_MODE = 'api'
npm.cmd run dev -- --port 5177
```

서버가 준비되면 별도 QA 브라우저 세션에서 실행합니다. `run-code` 시나리오는 개발 서버용입니다.

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=week5-mock open http://127.0.0.1:5176/favicon.svg --browser chrome
npx.cmd --yes --package @playwright/cli playwright-cli -s=week5-mock run-code --filename=scripts/browser-workfit.cjs
npx.cmd --yes --package @playwright/cli playwright-cli -s=week5-api open http://127.0.0.1:5177/favicon.svg --browser chrome
npx.cmd --yes --package @playwright/cli playwright-cli -s=week5-api run-code --filename=scripts/browser-admin-recovery.cjs
```

## 남아 있는 작업

- 분야·스킬 목록은 현재 고정 목록을 사용합니다. 운영 데이터와 연결할 때 사용할 조회 API와 ID 계약은 백엔드 담당자와 확인해야 합니다.
- AI 퀴즈 스튜디오는 기존 예시임. 실제 AI 생성과 콘텐츠 퀴즈 저장 연결은 API 담당자와 계약을 맞춰 진행.
- 자막 구간은 직접 입력 방식임. SRT·SMI 파일을 관리자 화면에서 읽어 구간으로 채우는 기능은 추가하지 않음.
- 사용자 페이지의 검색·학습·AI 피드백·학습 기록 흐름을 팀에서 정한 범위에 따라 이어서 개발.
