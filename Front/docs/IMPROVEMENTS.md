# 관리자 화면 개선 결과

엑셀 숏폼 과정·영상·퀴즈·자료의 등록과 공개 흐름을 유지하며 운영용 목록과 폼을 개선했습니다. 외부 배포는 하지 않았습니다.

## 변경 내용

| 영역 | 개선 |
|---|---|
| 공통 | 기존 초록색 유지, 글자 14~16px·보조 12px 기준, 명확한 포커스·44px 이상 주요 조작부, 홍보·영어 문구 축소 |
| 목록 | 장식 통계 카드 제거, 상태별 개수는 필터 안에 표시, 과정 목록도 표로 통일, 제목·과정·상태·수정 동작 우선 |
| 등록·수정 | 한 폼 안에 기본 정보→영상→퀴즈→자료 유지, 카드 중첩 축소, 입력 라벨·도움말·필드 오류 연결 |
| 공개 검증 | 누락 항목 구체 표시, aria-invalid·aria-describedby와 오류 요약 포커스, 초안 저장 허용 유지 |
| 파일·미리보기 | 긴 파일명 줄바꿈, 문서 첨부의 큰 장식 영역 축소, 영상·퀴즈·자료 확인 유지 |
| 키보드 | 본문 바로가기, 이름 있는 dialog, Escape 닫기·포커스 복원, 모바일 메뉴 Tab 순환·닫힌 메뉴 inert |
| 모바일 | 390px 목록에서 제목·소속 과정·상태·수정 제공, 폼 한 열 배치, 긴 제목·파일명 넘침 확인 |
| 동작 | API 어댑터·쿠키·CSRF·저장소 보존, 저장·업로드 요청 잠금 보완, 만료 후 보호된 파일 조회 재시도, 로그아웃 실패를 성공 알림과 구분 |
| 개발 구조 | App.tsx와 진입 파일을 분리해 개발 중 중복 createRoot를 방지 |

과정 등록 버튼은 `과정 등록 저장`, 수정 버튼은 `수정 저장`으로 구별합니다. 콘텐츠의 임시저장·수정 저장·공개·비공개 의미는 유지했습니다.

## 실제 사용 도구와 대안

- **사용:** 파일·코드 검사, Plugin Management 검색, shadcn 공식 문서와 캐시 가이드 참고, 기존 React·TypeScript·HTML/CSS 수정, Vite·Vitest, Playwright CLI 브라우저 검사·캡처.
- **사용하지 않음:** shadcn/ui MCP, Impeccable, Hallmark. 현재 세션에서 호출 가능한 연결 도구와 등록된 해당 스킬을 찾지 못했습니다. 검색에서 설치·연결 가능한 항목도 반환되지 않았습니다. 전체 설치 가능 여부를 단정하지 않습니다.
- 대안으로 기존 table·input·select·dialog를 재사용하고 정보 우선순위·대비·키보드·오류·반응형을 직접 점검했습니다. Hallmark 실행 결과나 Impeccable 평가를 받은 것처럼 표현하지 않습니다.
- 새 UI 라이브러리·Refine·Tailwind를 추가하지 않았습니다. package.json·lock 파일과 기존 관리자 API 계약은 유지했습니다. 이후 관리자·사용자 분리에서는 사용자 조회 어댑터와 별도 경로를 추가했습니다. 최신 역할 분리 내용은 [ROLES.md](ROLES.md)를 참고합니다.
- [디자인 기준과 도구 확인 상세](DESIGN.md), [AI 사용 내역](AI_USAGE.md).

## 검증 결과

- 자동 검사 **16개 통과**, TypeScript 검사·프로덕션 빌드 통과, 실행 의존성 npm audit 0건.
- Chromium에서 과정 등록·저장·수정·새로고침 복원, 콘텐츠 등록·저장·파일 복원·미리보기·공개·비공개 확인.
- 빈 검색, 필수값 누락, 업로드·저장 실패와 재시도, 로그인 만료 후 입력 유지, 권한 없음과 복귀 확인.
- API 모드의 HTTP 응답 대체로 요청 잠금·쿠키·CSRF·생성 중복방지·401·403·503 처리 확인. 실제 서버가 없을 때 오류를 표시하며 예시 데이터로 숨기지 않음을 확인.
- 1440px PC, 768px, **390px 모바일**에서 배치 확인. 긴 제목·파일명, 모바일 메뉴, 키보드 본문 이동·Tab·Escape·대화상자 포커스 복원 확인.
- 지정 색상 조합의 계산 대비: 본문/흰색 12.93:1, 보조/흰색 5.95:1, 주 버튼/흰색 8.24:1, 입력 경계/흰색 3.20:1, 상태 문구/배경 6.02~6.50:1. 접근성 전체 인증을 의미하지 않습니다.
- 정상 모드 마지막 목록에서 브라우저 콘솔 오류 0건 확인. API 오류 재현의 401·403·503·미연결 500은 의도한 네트워크 오류입니다.

## 페이지별 캡처

아래는 실제 브라우저에서 캡처한 파일입니다. QA용 과정·파일과 짧은 검사 영상은 실제 교육 콘텐츠가 아닙니다.

| 화면 | PC | 모바일 390px |
|---|---|---|
| 콘텐츠 목록 | [목록](../output/playwright/17-content-list-final.png) | [목록](../output/playwright/12-content-list-mobile.png) |
| 과정 목록 | [목록](../output/playwright/02-courses-desktop.png) | [목록](../output/playwright/14-courses-mobile.png) |
| 과정 등록 | [등록](../output/playwright/03-course-form.png) | [등록](../output/playwright/15-course-form-mobile.png) |
| 과정 수정 | [수정](../output/playwright/21-course-edit-desktop.png) | [수정](../output/playwright/22-course-edit-mobile.png) |
| 콘텐츠 등록 | [등록](../output/playwright/24-content-create-desktop.png) | [등록](../output/playwright/23-content-create-mobile.png) |
| 콘텐츠 수정·퀴즈·자료 | [수정](../output/playwright/10-editor-1440.png) | [수정](../output/playwright/10-editor-390.png) |
| 학습 화면 미리보기 | [미리보기](../output/playwright/05-learning-preview.png) | [미리보기](../output/playwright/16-preview-mobile.png) |

| 예외·상태 | 캡처 |
|---|---|
| 공개 필수값 누락 | [오류](../output/playwright/04-publish-validation.png) |
| 공개 완료 | [공개 상태](../output/playwright/06-content-editor-published.png) |
| 저장 실패 | [오류](../output/playwright/07-save-error.png) |
| 로그인 필요·만료 | [로그인 안내](../output/playwright/08-session-expired.png) |
| 권한 없음 | [권한 안내](../output/playwright/09-forbidden.png) |
| 빈 검색 | [빈 결과](../output/playwright/11-empty-search.png) |
| 긴 제목·파일명 | [입력](../output/playwright/18-long-title-file-mobile.png) · [목록](../output/playwright/19-long-title-list-mobile.png) |
| API 계약 화면 | [응답 대체 검사](../output/playwright/13-api-contract-mode.png) |

## 미완료와 범위

실제 팀 백엔드·DB가 제공되지 않아 통합 검증은 미완료입니다. 서버의 관리자 권한·입력값·파일 실물·공개 조건·CSRF·미사용 파일 정리·기존 학습 기록 보존을 프론트에서 대신하지 않습니다. 현재 계약과 연결 경로는 유지했고, 서버 준비 후 [API 계약의 통합 확인 목록](API_CONTRACT.md)을 함께 확인해야 합니다.

사용자 학습·AI 피드백·마이스펙, 외부 배포, 전체 디자인 재설계는 이번 개선 범위 밖입니다. DB에 직접 접속하거나 비밀키를 프론트에 추가하지 않았습니다.
