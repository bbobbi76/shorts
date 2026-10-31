# 프론트엔드 API 연결 계약

기준: 2026-11-01, `backend/app/ui_api.py`, 기존 `/api/admin` 라우터 및 `Front/src/data/api/` 코드 확인.
현재 서버 실행·계정·DB 준비는 [백엔드 연동 안내](../../backend/docs/INTEGRATION_GUIDE.md), 전체 서버 명세는 [ENDPOINTS.md](../../backend/docs/ENDPOINTS.md)를 참고합니다. 아래는 프론트가 사용하는 요청의 요약입니다. 프론트 기능별 검증 범위는 [프론트 작업 요약](WEEK5_FRONTEND_WORK.md)에 정리했습니다.

## 모드와 공통 규칙

- 설정이 없으면 목업 모드이며 IndexedDB에 저장합니다. `.env.local`의 `VITE_DATA_MODE=api`로 실제 HTTP 어댑터를 선택합니다. 설정 변경 후 개발 서버를 재시작합니다.
- 기본 주소는 `/api/ui`이며 `VITE_API_BASE_URL`로 변경합니다. 로컬 Vite의 `/api` 프록시는 `http://127.0.0.1:8000`을 향합니다.
- 성공 응답은 `{data: ...}` 봉투 없이 객체 또는 배열입니다. ID는 문자열, 시간은 ISO 8601 형식입니다.
- 모든 요청은 `credentials: include`를 사용합니다. 로그인·세션 응답의 `csrfToken`을 이후 변경 요청의 `X-CSRF-Token`에 전달합니다. 파일 업로드도 같은 세션·토큰을 사용합니다.
- 관리자 로그인 시 같은 입력으로 UI 쿠키 인증과 기존 Bearer 인증을 함께 수행합니다. 기존 API 주소는 UI 기본 주소 끝의 `/ui`를 제거한 값입니다. Bearer 토큰은 API 주소별 sessionStorage에만 보관하며 비밀번호는 저장하지 않습니다. 저장소를 사용할 수 없으면 현재 탭 메모리에서만 사용합니다.
- 통계·삭제·일괄 순서 API를 호출하기 전에 `/auth/session`으로 활성 관리자 권한을 다시 확인하고, 기존 API에는 `Authorization: Bearer ...`를 보냅니다. 두 번째 인증이 실패하면 UI 로그인도 취소하며, 로그아웃은 두 인증 모두 해제합니다.
- JSON 요청은 20초, 업로드·파일 조회는 120초에 중단합니다. 요청 중단이 서버 저장 취소를 뜻하지는 않습니다. 자동 재전송이나 목업 자동 전환은 하지 않습니다.
- 생성 요청은 화면의 UUID를 `Idempotency-Key`로 보냅니다. 응답 ID는 서버가 발급한 값으로 교체합니다. 과정 없이 저장한 초안을 과정에 연결할 때도 ID가 UUID에서 숫자 문자열로 바뀔 수 있으며, 저장 응답에 맞춰 편집 경로를 갱신합니다. 태그·자료 저장은 body.id를 신규 등록·수정 식별값으로 사용합니다.

## 관리자 엔드포인트

모든 경로 앞에 기본 주소 `/api/ui`를 붙입니다.

| 방식 | 경로 | 요청 | 성공 응답 |
| --- | --- | --- | --- |
| GET | `/auth/session` | 세션 쿠키 | Session + csrfToken |
| POST | `/auth/login` | `{email, password}` | Session + csrfToken |
| POST | `/auth/logout` | 세션·CSRF | 204 |
| GET | `/admin/courses` | 없음 | Course[] |
| GET | `/admin/courses/{id}` | 없음 | Course |
| POST | `/admin/courses` | Course 편집 필드, 중복방지 키 | Course |
| PATCH | `/admin/courses/{id}` | Course 전체 편집 필드 | Course |
| GET | `/admin/contents` | 없음 | Content[] |
| GET | `/admin/contents/{id}` | 없음 | Content |
| POST | `/admin/contents` | Content 편집 필드, 중복방지 키 | Content |
| PATCH | `/admin/contents/{id}` | Content 전체 편집 필드 | Content |
| POST | `/admin/contents/{id}/publish` | 없음 | PUBLISHED 상태 Content |
| POST | `/admin/contents/{id}/unpublish` | 없음 | HIDDEN 상태 Content |
| POST | `/admin/media` | FormData: file, kind | Media |
| GET | `/admin/media/{id}/file` | 세션 쿠키 | 파일 바이너리 |
| GET | `/admin/catalog` | 없음 | `{tags: SearchTag[], resources: WorkResource[]}` |
| POST | `/admin/tags` | SearchTag 전체 편집 필드 | SearchTag |
| POST | `/admin/resources` | WorkResource 전체 편집 필드 | WorkResource |

목록 검색·필터는 받은 전체 배열에 적용하며 페이지네이션은 사용하지 않습니다. 데이터 타입의 원본은 [model.ts](../src/domain/model.ts), 공개 응답은 [public-model.ts](../src/domain/public-model.ts)입니다.

## 주요 필드와 저장 흐름

| 항목 | 주요 필드·제약 |
| --- | --- |
| Session | name, role: admin/member, csrfToken |
| Course | id, title(100자), summary·learningGoal(500자), categoryId, level: INTRO/BASIC/ADVANCED, status: DRAFT/PUBLISHED/HIDDEN, thumbnail |
| Content 기본 | id, courseId, title(100자), learningGoal(500자), workUse(255자), sortOrder(0 이상 정수), status: DRAFT/REVIEW/PUBLISHED/HIDDEN |
| 영상·이미지 | video, thumbnail: Media 또는 null. Media는 id, name, size, type, kind 및 선택 duration·width·height |
| 퀴즈 | quiz.question(500자), options(2~4개·보기당 255자), correctIndex(0부터, 미선택 -1), explanation |
| 보기별 피드백 | optionFeedbacks: feedback, feedbackSource(NONE/AI_DRAFT/ADMIN), rewatchSec(선택·0 이상 정수·영상 길이 이내) |
| 실습 | practiceText, practice(파일), practiceSettings: title, expectedResult, resultType(NUMBER/TEXT), tolerance, requiredFunction, answerFormula |
| 연결 | tagIds, skillIds, resourceIds: 문자열 ID 배열 |
| 자막 | subtitles: id, startSec, endSec, text. 시작보다 종료가 커야 하며 영상 길이 이내, 시점은 소수점 2자리 |
| 태그 | id, name(50자), tagType(SITUATION/ERROR/FUNCTION/TOOL), synonyms |
| 자료 | id, title(100자), resourceType(TEMPLATE/EXAMPLE_DOC/PROMPT), description(500자), file, promptText, categoryId, status(DRAFT/PUBLISHED/HIDDEN) |

콘텐츠는 빈 제목·과정·퀴즈 상태에서도 초안으로 저장할 수 있습니다. 공개에는 소속 과정, 제목, 재생 가능한 영상, 퀴즈 문제·보기·정답·해설이 필요합니다. 일반 저장 후 전용 publish 요청을 보냅니다. 저장만 성공하고 공개 요청이 실패하면 반환받은 ID의 편집 화면으로 이동해 오류를 표시하며, 재시도는 수정 요청을 사용합니다.

콘텐츠 공개와 과정 공개는 별개입니다. 사용자에게 표시하려면 둘 다 공개되어야 합니다. 과정 공개에는 학습 목표와 공개된 콘텐츠 1개 이상이 필요합니다.

파일은 먼저 업로드한 뒤 반환받은 Media를 연결해 콘텐츠·자료를 저장합니다. 프론트의 재생 가능 여부 검사와 별개로 서버가 파일·소유권·종류를 검사합니다. 서버가 반환한 메타데이터가 브라우저 측정값보다 우선합니다. 보호된 파일은 인증 요청으로 Blob을 받은 뒤 임시 URL로 미리 보고, 화면을 떠나면 URL을 해제합니다.

관리자 분야·스킬 목록은 `/api/ui/admin/categories`, `/api/ui/admin/skills`에서 읽어 과정·스킬·자료 선택과 목록 표시에 사용합니다. 실패하면 고정 목록으로 대체하지 않고 오류·재시도를 표시하며 필요한 저장을 막습니다. 서버에서 추가한 스킬 ID도 입력 검증을 통과하도록 실제 조회 목록을 사용합니다. 이 경로는 관리자 전용이므로 사용자 화면에서 호출하지 않습니다. 공개 과정 응답에는 분야 이름이 없어 사용자 화면은 과정 이름·난이도로 탐색합니다. AI 퀴즈 스튜디오는 기존 화면 예시이며 이 어댑터로 실제 AI 생성·검색·채점 요청을 보내지 않습니다.

## 추가로 연결한 관리자 API

아래 경로는 UI 접두사 없이 기존 API 주소를 사용합니다. UI 쿠키만으로 호출할 수 없어 로그인에서 받은 Bearer 토큰을 사용합니다. 백엔드 코드는 이번 프론트 연결 작업에서 수정하지 않았습니다.

| 방식 | 경로 | 요청과 처리 |
| --- | --- | --- |
| POST | `/api/auth/login` | `{email, password}`, 응답의 token·ADMIN 역할 확인 |
| POST | `/api/auth/logout` | Bearer 토큰 해제 |
| GET | `/api/admin/dashboard` | 서버 통계·최근 콘텐츠·운영 로그 표시 |
| DELETE | `/api/admin/contents/{id}` | 숫자 ID의 미공개 초안 삭제, 성공 204. 공개 이력은 서버가 거절 |
| GET | `/api/admin/courses/{id}/contents` | 비공개·초안을 포함한 과정 전체 순서 조회 |
| PUT | `/api/admin/courses/{id}/contents/order` | `{contentIds: [숫자 ID, ...]}`, 과정 전체 ID를 전달하고 응답 순서를 반영 |

과정 미지정 UUID 초안의 삭제 API는 백엔드에 없어 삭제 버튼을 제공하지 않습니다. 과정에 연결해 저장한 미공개 항목에만 삭제 기능을 제공합니다. 과정 미지정 초안은 기존 대시보드 통계에서도 제외됩니다. 순서 변경 시 로컬 입력 유실을 막고, 서버 저장 실패 후 재시도하거나 확인 후 서버 목록을 다시 불러올 수 있습니다.

## 요청 예시

```http
POST /api/ui/admin/courses
Content-Type: application/json
X-CSRF-Token: <로그인 응답에서 받은 토큰>
Idempotency-Key: <새 과정 UUID>
```

```json
{
  "id": "<새 과정 UUID>",
  "title": "신입 직장인을 위한 엑셀 기초",
  "summary": "업무에 자주 쓰는 함수를 배웁니다.",
  "learningGoal": "조건별 합계를 계산할 수 있다.",
  "categoryId": "4",
  "level": "INTRO",
  "status": "DRAFT",
  "thumbnail": null
}
```

서버가 반환한 Course의 `id`, `updatedAt`을 편집 상태에 반영합니다. 이후 수정은 반환받은 ID로 PATCH합니다. 실제 계정·비밀번호는 이 문서에 기재하지 않습니다.

## 오류 처리

오류 응답은 `{ "message": "입력값을 확인해 주세요.", "fields": ["title: 필수 항목"] }` 형식이며 서버는 같은 내용의 `details`도 반환합니다. 프론트는 message와 fields를 오류 요약으로 표시합니다.

| 상태 | 프론트 처리 |
| --- | --- |
| 400·422 | 입력·저장·공개 조건 오류 표시, 입력 유지 |
| 401 | 로그인 창 표시, 작성 중인 입력 유지 |
| 403 | 관리자 권한 안내. 다른 계정 로그인으로 복귀해 입력 유지 |
| 404 | 없는 항목 안내 |
| 409 | 중복·DB 제약 오류 표시 |
| 5xx·연결 실패·시간 초과 | 오류 표시, 가능한 조회는 재시도 제공, 목업 자동 전환 없음 |

## 사용자 조회

| 방식 | 경로 | 응답 |
| --- | --- | --- |
| GET | `/courses` | 공개 콘텐츠가 있는 공개 Course[] |
| GET | `/courses/{id}` | 공개 Course |
| GET | `/contents?courseId={id}` | PublicContent[] |
| GET | `/contents/{id}` | PublicContent |
| GET | `/media/{id}/file` | 공개 콘텐츠에 연결된 파일 |

PublicContent에는 관리자 퀴즈 정답·해설, optionFeedbacks, practiceSettings가 포함되지 않습니다. 자료는 연결된 공개 자료만 반환합니다. 서버가 공개 여부·부모 과정·파일 연결을 검사하며 프론트 필터만으로 접근을 제한하지 않습니다.

사용자 영상과 썸네일은 API 모드에서 `/api/ui/media/{id}/file`을 직접 사용합니다. 영상은 브라우저의 Range 요청을 사용할 수 있고, 관리자 파일 경로나 응답에 포함된 외부 URL로 우회하지 않습니다. 다운로드는 공개 파일 API에서 Blob을 받아 원래 파일명으로 저장합니다.

`/learn`의 검색은 공개 Course·PublicContent 목록을 받은 뒤 제목·학습 목표·활용 업무·과정명·자막의 단어를 프론트에서 비교합니다. `q`, `course`, `level`, `page`를 주소에 보관하며 자막 결과의 `t`는 초 단위 재생 위치입니다. AI `/search`는 현재 백엔드 앱에 등록돼 있지 않아 호출하지 않습니다. 목록 API에는 아직 서버 검색·페이지 나누기가 없어 프론트에서 전체 공개 목록을 대상으로 페이지를 나눕니다.

시청 위치·영상 ID·메모는 `workfit-learning-v1:{mode}:{apiBase}` 키의 localStorage에 최근 100개까지 보관합니다. 메모는 5,000자 제한이며 서버로 전송하지 않습니다. 영상이 교체되면 이전 시청 위치와 완료 여부를 초기화하고 메모만 유지합니다. 기록 화면은 현재 공개 조회에서 확인되는 콘텐츠만 표시합니다. 서버 학습 진도·수료 판정으로 사용하지 않습니다.
