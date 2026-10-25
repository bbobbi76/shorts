# 관리자 프론트 연동 API 명세

기본 경로는 `/api/ui`입니다. 최신 Front 모델을 기준으로 요청·응답을 맞췄습니다.
실행 방법과 개발 계정은 [연동 안내](INTEGRATION_GUIDE.md)를 참고합니다.
서버 실행 후 `/docs`에서 필수 필드, 타입, 길이 제한과 응답 모델을 확인할 수 있습니다.

## 인증과 공통 규칙

- 성공 응답은 객체 또는 배열을 바로 반환합니다. ID는 문자열입니다.
- 모든 관리자 API는 `workfit_session` HttpOnly 쿠키로 권한을 확인합니다.
- 로그인 이외의 변경 요청에는 `X-CSRF-Token`이 필요합니다. 로그인 또는 세션 조회 응답에서 받습니다.
- 프론트는 `credentials: 'include'`로 요청하며 태그·자료도 같은 API 인스턴스의 세션·CSRF를 공유합니다.
- PATCH는 화면의 전체 저장 데이터를 전송합니다. 생략한 신규 필드는 기본값으로 반영되므로 최신 Front를 함께 사용합니다.
- 과정·콘텐츠 생성은 201, 조회·수정·전환·카탈로그 저장은 200, 로그아웃은 204입니다.
- 과정·콘텐츠 생성의 `Idempotency-Key`는 최대 64자이며 생략 시 body.id를 사용합니다. 같은 관리자·종류·키로 재요청하면 기존 결과를 반환합니다.

## 엔드포인트

| 메서드 | 경로 | 요청 / 응답 |
|---|---|---|
| POST | `/auth/login` | email, password / SessionOut |
| GET | `/auth/session` | 쿠키 / SessionOut |
| POST | `/auth/logout` | 쿠키·CSRF / 본문 없음 |
| GET | `/admin/courses` | CourseOut 배열 |
| GET | `/admin/courses/{id}` | CourseOut |
| POST | `/admin/courses` | CourseBody / CourseOut |
| PATCH | `/admin/courses/{id}` | CourseBody / CourseOut |
| GET | `/admin/contents` | ContentOut 배열 |
| GET | `/admin/contents/{id}` | ContentOut |
| POST | `/admin/contents` | ContentBody / ContentOut |
| PATCH | `/admin/contents/{id}` | ContentBody / ContentOut |
| POST | `/admin/contents/{id}/publish` | 본문 없음 / ContentOut |
| POST | `/admin/contents/{id}/unpublish` | 본문 없음 / ContentOut |
| POST | `/admin/media` | multipart의 file, kind / MediaOut |
| GET | `/admin/media/{id}/file` | 인증 후 파일 바이너리 |
| GET | `/admin/catalog` | tags, resources 배열 |
| POST | `/admin/tags` | TagBody / TagOut |
| POST | `/admin/resources` | ResourceBody / ResourceOut |
| GET | `/courses`, `/courses/{id}` | 공개 과정 배열 또는 상세 |
| GET | `/contents`, `/contents/{id}` | 공개 콘텐츠 배열 또는 상세 |
| GET | `/media/{id}/file` | 공개 콘텐츠에 연결된 공개 파일 바이너리 |

태그·자료 저장은 upsert입니다. 신규에는 UUID, 수정에는 조회 응답의 숫자 ID 문자열을 보냅니다.
같은 관리자가 신규 UUID를 재사용하면 기존 항목을 수정합니다. 태그·자료 삭제 API는 제공하지 않습니다.

## 요청 예시

### 로그인

```json
{"email":"admin@workfit.dev","password":"admin1234"}
```

응답은 `{"name":"운영자","role":"admin","csrfToken":"발급값"}`입니다.

### 과정

```json
{"id":"course-uuid","title":"엑셀 입문","summary":"소개","learningGoal":"조건 합계","categoryId":"4","level":"INTRO","status":"DRAFT","thumbnail":null}
```

이전 description/objective 및 한글 난이도 대신 summary/learningGoal과 INTRO/BASIC/ADVANCED를 사용합니다.
응답은 위 필드와 서버 id, updatedAt을 포함합니다. thumbnail은 파일 정보로 확장됩니다.
과정 공개에는 학습 목표와 공개된 콘텐츠 1개 이상이 필요합니다.

### 콘텐츠

```json
{
  "id":"content-uuid","courseId":"1","title":"SUMIF","learningGoal":"조건 합계를 구한다",
  "workUse":"매출 집계","sortOrder":1,"status":"REVIEW",
  "video":null,"thumbnail":null,
  "quiz":{"question":"조건 합계 함수는?","options":["SUMIF","COUNT"],"correctIndex":0,"explanation":"SUMIF는 조건 합계 함수입니다."},
  "optionFeedbacks":[{"feedback":"조건 합계입니다.","feedbackSource":"ADMIN","rewatchSec":5},{"feedback":"개수를 세는 함수입니다.","feedbackSource":"ADMIN","rewatchSec":null}],
  "practiceText":"예제에서 합계를 구하세요.","practice":null,"resource":null,
  "practiceSettings":{"title":"합계 실습","expectedResult":"120","resultType":"NUMBER","tolerance":0.01,"requiredFunction":"SUMIF","answerFormula":"=SUMIF(A:A,1,B:B)"},
  "tagIds":[],"skillIds":[],"resourceIds":[],
  "subtitles":[{"id":"subtitle-uuid","startSec":0,"endSec":3.25,"text":"조건 합계를 구합니다."}]
}
```

- 응답에는 서버 id, version, updatedAt과 저장한 항목이 포함됩니다. version과 파일 재생 시간은 서버에서 결정합니다.
- 상태는 DRAFT/REVIEW/PUBLISHED/HIDDEN입니다. 공개 전환은 publish API로만 가능하며 과정 상태는 자동 변경하지 않습니다.
- 보기별 피드백을 보내는 경우 보기 개수와 맞춥니다. 본문 변경 시 작성 주체는 ADMIN, 빈 본문은 NONE이며 기존 미변경 AI 초안은 유지합니다.
- tagIds/skillIds/resourceIds는 실제 등록된 ID를 보냅니다. 빈 배열은 연결 해제입니다.
- subtitles의 빈 배열은 자막 삭제입니다. 반환하는 자막 id는 DB ID이며 저장 시 다시 발급될 수 있습니다. 시간은 소수점 둘째 자리까지, 종료는 시작 이후·영상 길이 이내입니다.
- practiceSettings를 기본값으로 비우고 안내·파일도 제거하면 실습 데이터가 삭제됩니다.
- courseId가 빈 문자열이면 보조테이블의 초안으로 저장하며 검수 상태와 추가 항목을 유지합니다.

### 태그·자료

```json
{"id":"tag-uuid","name":"조건 합계","tagType":"FUNCTION","synonyms":["SUMIF"]}
```

```json
{"id":"resource-uuid","title":"질문 예시","resourceType":"PROMPT","description":"함수 질문","file":null,"promptText":"조건 합계를 설명해 주세요.","categoryId":"4","status":"DRAFT"}
```

태그 유형은 SITUATION/ERROR/FUNCTION/TOOL입니다. 태그명·동의어는 50자 이내이며 중복은 거절합니다.
자료 유형은 TEMPLATE/EXAMPLE_DOC/PROMPT입니다. PROMPT는 본문, 다른 유형은 업로드한 RESOURCE 파일이 필요합니다.
카탈로그 조회 응답은 `{"tags":[...],"resources":[...]}`입니다.

## 파일과 공개 조회

업로드 kind는 video/thumbnail/practice/resource입니다. multipart Content-Type은 브라우저에 맡깁니다.
video는 MP4 최대 200MiB, 나머지는 20MiB입니다. 프론트는 영상 100MiB·썸네일 5MiB로 더 엄격히 제한합니다.
응답은 id/name/size/type/kind와 영상 duration을 포함합니다. 허용 확장자는 app/files.py를 참고합니다.
파일 Range 요청은 206일 수 있습니다.

공개 조회는 과정과 콘텐츠가 모두 PUBLISHED인 경우에만 반환합니다. 목록은 `?courseId=1` 필터를 지원합니다.
공개 콘텐츠에는 learningGoal, workUse, subtitles와 공개 자료 resources가 포함됩니다.
quiz, optionFeedbacks, practiceSettings의 정답·수식은 공개 응답에서 제외합니다.
비공개 자료 파일은 공개 콘텐츠에 연결되어 있어도 공개 파일 경로로 제공하지 않습니다.

## 오류 응답

```json
{"message":"입력값을 확인해 주세요.","fields":["title: 입력 제한 오류"],"details":["title: 입력 제한 오류"]}
```

| HTTP 코드 | 의미 |
|---|---|
| 400 | 요청 타입·길이 등 Pydantic 검증, 파일 확장자·크기 오류 |
| 401 | 미로그인, 로그인 실패, 세션 만료 |
| 403 | 관리자 권한·활성 상태·Origin·CSRF 검사 실패 |
| 404 | 자료나 연결 ID가 없거나 공개 범위 밖 |
| 409 | 중복 태그·동의어 또는 DB 제약 충돌 |
| 422 | 공개 조건, 실습 정답, 자막 범위 등 업무 규칙 위반 |
| 500 | 서버 내부 오류 |

fields와 details는 같은 문자열 배열입니다. 없는 경로·메서드 및 CORS preflight 거절은 프레임워크 자체 응답 형식일 수 있습니다.
