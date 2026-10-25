# 실무 한 컷 · WorkFit DB 구조 반영 프론트

기존 React·TypeScript·Vite 프론트를 유지하면서 WorkFit DB의 필드와 상태에 맞췄습니다. **백엔드·API·MySQL 연결 없이** 화면과 로컬 저장만 동작합니다. DB 파일은 복사하거나 실행하지 않았습니다.

## 실행

Node.js 22.12 이상 또는 24 이상에서 이 폴더를 엽니다.

```powershell
npm.cmd ci
npm.cmd run dev
```

http://127.0.0.1:5173/admin/contents 에 접속합니다. `start-local.cmd`를 더블클릭해도 됩니다. 관리자 로그인은 화면 확인용이며 비밀번호 없이 입장합니다.

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
| `/admin/courses` | 과정 목록·등록·수정 |
| `/admin/contents` | 콘텐츠 목록·등록·수정·미리보기·공개 |
| `/admin/resources` | 실무자료 관리 |
| `/admin/tags` | 검색 태그·동의어 관리 |
| `/learn/courses` | 등록한 공개 과정 탐색 |
| `/learn/courses/:id` | 공개 콘텐츠를 입력한 순서대로 표시 |
| `/learn/contents/:id` | 영상·자막·실습 안내·자료 확인 |
| `/learn`, `/learn/preview` | 기존 검색·학습·AI 피드백 화면 목업 |

기존 AI 퀴즈 초안 화면은 화면 예시로 유지했습니다. 실제 AI 생성·검색 서버·학습 기록 저장·채점은 연결하지 않았습니다.

## 저장 방식

내용과 파일 Blob을 기존 IndexedDB `douzone-admin-demo-v1`에 저장합니다. 이전 데이터의 필드를 자동으로 옮기며 기존 파일·퀴즈·실습 안내를 보존합니다. 이전 직무·주제는 참고 정보로 남깁니다. 이전 과정에 공개 상태가 없으면 초안으로 옮기므로 과정에서 공개 상태를 선택해 저장하세요.

데이터는 접속 주소·브라우저별로 분리됩니다. `VITE_DATA_MODE=api`가 있어도 실행 저장소는 로컬로 고정됩니다. Vite API 프록시도 제거했습니다. 이전 API 어댑터는 과거 테스트를 위해 코드에 남아 있지만 앱 실행 저장소에서 사용하지 않습니다.

## 검증

```powershell
npm.cmd test
npm.cmd run build
```

변경 범위와 DB 필드 대응은 [WORKFIT_DB_ALIGNMENT.md](docs/WORKFIT_DB_ALIGNMENT.md), 검증 결과는 [VERIFICATION_WORKFIT.md](docs/VERIFICATION_WORKFIT.md)를 확인하세요. 이전 문서의 API 계약·연결 방법은 과거 제안이며 이 버전에는 적용하지 않습니다.
