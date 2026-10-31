# API 필드 상세

관리자·공개 조회 API의 요청·응답 필드입니다. 경로별 사용법과 JSON 예시는 [ENDPOINTS.md](ENDPOINTS.md)를 참고합니다.

요청의 필수 여부는 아래 표와 같습니다. 응답은 응답 모델 기준이며, 클라이언트가 보내는 version·updatedAt·파일 길이는 저장 기준으로 신뢰하지 않습니다.

모델의 형식·타입 검증 실패는 400, 공개 조건·연결·시간 범위 등 업무 검증은 API 명세의 오류 코드를 사용합니다.

## LoginBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `email` | string | 필수 | 관리자 이메일 주소 |
| `password` | string | 필수 | 관리자 비밀번호 |

## SessionOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `name` | string | 필수 |  |
| `role` | string | 필수 |  |
| `csrfToken` | string | 필수 | 변경 요청의 X-CSRF-Token에 사용 |

## CourseBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 최소 글자: 1; 최대 글자: 64; 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `title` | string | 필수 | 최대 글자: 100 |
| `summary` | string | 생략 가능 | 최대 글자: 500 |
| `learningGoal` | string | 생략 가능 | 최대 글자: 500 |
| `categoryId` | string | 필수 | 분야 조회 API에서 받은 ID 문자열 |
| `level` | string | 생략 가능 | 허용 값: INTRO, BASIC, ADVANCED |
| `status` | string | 생략 가능 | 허용 값: DRAFT, PUBLISHED, HIDDEN |
| `thumbnail` | MediaRef / null | 생략 가능 |  |

## CourseOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `title` | string | 필수 |  |
| `summary` | string | 필수 |  |
| `learningGoal` | string | 필수 |  |
| `categoryId` | string | 필수 | 분야 조회 API에서 받은 ID 문자열 |
| `level` | string | 필수 |  |
| `status` | string | 필수 |  |
| `thumbnail` | MediaOut / null | 생략 가능 |  |
| `updatedAt` | string | 필수 | 서버 저장 시각, ISO 8601 |

## ContentBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 최소 글자: 1; 최대 글자: 64; 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `courseId` | string | 생략 가능 | 과정 ID. 빈 문자열은 과정 없는 초안 |
| `title` | string | 생략 가능 | 최대 글자: 100 |
| `learningGoal` | string | 생략 가능 | 최대 글자: 500 |
| `workUse` | string | 생략 가능 | 최대 글자: 255 |
| `sortOrder` | integer | 생략 가능 | 최솟값: 0; 최댓값: 2147483647 |
| `status` | string | 생략 가능 | 허용 값: DRAFT, REVIEW, PUBLISHED, HIDDEN |
| `video` | MediaRef / null | 생략 가능 |  |
| `thumbnail` | MediaRef / null | 생략 가능 |  |
| `quiz` | QuizBody | 생략 가능 |  |
| `practiceText` | string | 생략 가능 |  |
| `practice` | MediaRef / null | 생략 가능 |  |
| `resource` | MediaRef / null | 생략 가능 |  |
| `optionFeedbacks` | OptionFeedbackBody[] | 생략 가능 | 최대 항목: 4 |
| `practiceSettings` | PracticeSettingsBody | 생략 가능 | 실습 정답 설정. 공개 응답에는 포함하지 않음 |
| `tagIds` | string[] | 생략 가능 | 태그 ID 배열. 빈 배열은 연결 해제 |
| `skillIds` | string[] | 생략 가능 | 스킬 ID 배열. 빈 배열은 연결 해제 |
| `resourceIds` | string[] | 생략 가능 | 실무자료 ID 배열. 빈 배열은 연결 해제 |
| `subtitles` | SubtitleBody[] | 생략 가능 | 최대 항목: 5000; 자막 구간 배열. 빈 배열은 삭제 |

## ContentOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `courseId` | string | 필수 | 과정 ID. 빈 문자열은 과정 없는 초안 |
| `title` | string | 필수 |  |
| `learningGoal` | string | 필수 |  |
| `video` | MediaOut / null | 생략 가능 |  |
| `thumbnail` | MediaOut / null | 생략 가능 |  |
| `practiceText` | string | 생략 가능 |  |
| `practice` | MediaOut / null | 생략 가능 |  |
| `resource` | MediaOut / null | 생략 가능 |  |
| `workUse` | string | 생략 가능 |  |
| `subtitles` | SubtitleOut[] | 생략 가능 | 자막 구간 배열. 빈 배열은 삭제 |
| `resources` | PublicResourceOut[] | 생략 가능 | 관리자 카탈로그에는 전체 자료, 공개 콘텐츠에는 PUBLISHED 자료만 |
| `updatedAt` | string | 필수 | 서버 저장 시각, ISO 8601 |
| `status` | string | 필수 |  |
| `quiz` | QuizOut | 필수 |  |
| `sortOrder` | integer | 필수 |  |
| `version` | integer | 필수 | 공개 이력 있는 영상 교체 시 서버가 증가 |
| `optionFeedbacks` | OptionFeedbackOut[] | 필수 |  |
| `practiceSettings` | PracticeSettingsOut | 필수 | 실습 정답 설정. 공개 응답에는 포함하지 않음 |
| `tagIds` | string[] | 필수 | 태그 ID 배열. 빈 배열은 연결 해제 |
| `skillIds` | string[] | 필수 | 스킬 ID 배열. 빈 배열은 연결 해제 |
| `resourceIds` | string[] | 필수 | 실무자료 ID 배열. 빈 배열은 연결 해제 |

## QuizBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `question` | string | 생략 가능 | 최대 글자: 500 |
| `options` | string[] | 생략 가능 | 최대 항목: 4 |
| `correctIndex` | integer | 생략 가능 | 최솟값: -1; 최댓값: 3; 0부터 시작하는 정답 인덱스, 미지정 -1 |
| `explanation` | string | 생략 가능 |  |

## OptionFeedbackBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `feedback` | string | 생략 가능 |  |
| `feedbackSource` | string | 생략 가능 | 허용 값: NONE, AI_DRAFT, ADMIN; 본문 변경은 ADMIN, 삭제는 NONE. 기존 미변경 AI_DRAFT 유지 |
| `rewatchSec` | integer / null | 생략 가능 | 다시 볼 시점(초). 영상 길이 이내 |

## PracticeSettingsBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `title` | string | 생략 가능 | 최대 글자: 100 |
| `expectedResult` | string | 생략 가능 | 최대 글자: 255 |
| `resultType` | string | 생략 가능 | 허용 값: NUMBER, TEXT |
| `tolerance` | number | 생략 가능 | 최솟값: 0; 최댓값: 99999999.9999; 숫자 정답의 허용 오차, 소수점 4자리 이내 |
| `requiredFunction` | string | 생략 가능 | 최대 글자: 50 |
| `answerFormula` | string | 생략 가능 | 최대 글자: 1000 |

## SubtitleBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 최대 글자: 64; 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `startSec` | number | 필수 | 최솟값: 0; 최댓값: 99999.99; 자막 시작(초), 소수점 2자리 이내 |
| `endSec` | number | 필수 | 최댓값: 99999.99; 초과: 0; 시작 이후·영상 길이 이내, 소수점 2자리 이내 |
| `text` | string | 필수 | 최소 글자: 1; 최대 글자: 500 |

## MediaOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `name` | string | 필수 |  |
| `size` | integer | 필수 |  |
| `type` | string | 필수 |  |
| `kind` | string | 필수 |  |
| `duration` | number / null | 생략 가능 | 서버 MP4 분석 값(초) |

## TagBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 최소 글자: 1; 최대 글자: 64; 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `name` | string | 필수 | 최소 글자: 1; 최대 글자: 50 |
| `tagType` | string | 필수 | 허용 값: SITUATION, ERROR, FUNCTION, TOOL |
| `synonyms` | string[] | 생략 가능 |  |

## ResourceBody

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 최소 글자: 1; 최대 글자: 64; 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `title` | string | 필수 | 최소 글자: 1; 최대 글자: 100 |
| `resourceType` | string | 필수 | 허용 값: TEMPLATE, EXAMPLE_DOC, PROMPT |
| `description` | string | 생략 가능 | 최대 글자: 500 |
| `file` | MediaRef / null | 생략 가능 |  |
| `promptText` | string | 생략 가능 |  |
| `categoryId` | string | 생략 가능 | 분야 조회 API에서 받은 ID 문자열 |
| `status` | string | 생략 가능 | 허용 값: DRAFT, PUBLISHED, HIDDEN |

## CatalogOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `tags` | TagOut[] | 필수 |  |
| `resources` | ResourceOut[] | 필수 | 관리자 카탈로그에는 전체 자료, 공개 콘텐츠에는 PUBLISHED 자료만 |

## CategoryOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `name` | string | 필수 |  |
| `categoryType` | string | 필수 |  |

## SkillOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `categoryId` | string | 필수 | 분야 조회 API에서 받은 ID 문자열 |
| `name` | string | 필수 |  |
| `description` | string | 필수 |  |

## PublicContentOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `id` | string | 필수 | 신규 생성 시 UUID, 조회 응답은 서버 ID 문자열 |
| `courseId` | string | 필수 | 과정 ID. 빈 문자열은 과정 없는 초안 |
| `title` | string | 필수 |  |
| `learningGoal` | string | 필수 |  |
| `video` | MediaOut / null | 생략 가능 |  |
| `thumbnail` | MediaOut / null | 생략 가능 |  |
| `practiceText` | string | 생략 가능 |  |
| `practice` | MediaOut / null | 생략 가능 |  |
| `resource` | MediaOut / null | 생략 가능 |  |
| `workUse` | string | 생략 가능 |  |
| `subtitles` | SubtitleOut[] | 생략 가능 | 자막 구간 배열. 빈 배열은 삭제 |
| `resources` | PublicResourceOut[] | 생략 가능 | 관리자 카탈로그에는 전체 자료, 공개 콘텐츠에는 PUBLISHED 자료만 |
| `updatedAt` | string | 필수 | 서버 저장 시각, ISO 8601 |

## ErrorOut

| 필드 | 타입 | 필수 | 제한·설명 |
|---|---|---|---|
| `message` | string | 필수 |  |
| `fields` | string[] | 필수 | 화면에 표시할 오류 문자열 배열 |
| `details` | string[] | 필수 | fields와 같은 값, 이전 클라이언트 호환용 |


## 파일 참조와 중첩 응답

MediaRef는 `{ "id": "업로드 응답의 파일 ID" }` 형태입니다. 서버는 클라이언트의 파일명·크기·길이를 참조 기준으로 신뢰하지 않습니다.

태그·자료의 응답은 요청 필드 구조와 같고, 서버 id와 파일 메타데이터를 반환합니다. 공개 자료 응답은 관리자 자료의 categoryId·status를 제외합니다. 응답의 자막, 피드백, 실습 설정 필드는 위 SubtitleBody, OptionFeedbackBody, PracticeSettingsBody 표와 같은 구조입니다.
