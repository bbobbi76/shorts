# React 연동 엔드포인트 명세

기본 경로는 /api/ui 입니다. 관리자 요청은 HttpOnly 세션 쿠키를 사용하고, 변경 요청에는 X-CSRF-Token이 필요합니다.

| 메서드 | 경로 | 기능 |
|---|---|---|
| POST | `/api/ui/auth/login` | Login |
| GET | `/api/ui/auth/session` | Session |
| POST | `/api/ui/auth/logout` | Logout |
| GET | `/api/ui/admin/courses` | Courses |
| POST | `/api/ui/admin/courses` | Create Course |
| GET | `/api/ui/admin/courses/{cid}` | Course |
| PATCH | `/api/ui/admin/courses/{cid}` | Edit Course |
| GET | `/api/ui/admin/contents` | Contents |
| POST | `/api/ui/admin/contents` | Create Content |
| GET | `/api/ui/admin/contents/{cid}` | Content |
| PATCH | `/api/ui/admin/contents/{cid}` | Edit Content |
| POST | `/api/ui/admin/contents/{cid}/publish` | Publish |
| POST | `/api/ui/admin/contents/{cid}/unpublish` | Unpublish |
| POST | `/api/ui/admin/media` | Upload |
| GET | `/api/ui/admin/media/{mid}/file` | Admin File |
| GET | `/api/ui/courses` | Public Courses |
| GET | `/api/ui/courses/{cid}` | Public Course |
| GET | `/api/ui/contents` | Public List |
| GET | `/api/ui/contents/{cid}` | Public Detail |
| GET | `/api/ui/media/{mid}/file` | Public File |

오류 응답은 message와 fields 배열입니다. 기존 클라이언트를 위해 details 배열도 제공합니다.

관리자: 401 미로그인·만료, 403 권한·CSRF 오류, 404 자료 없음, 409 중복·DB 제약 충돌, 422 공개 조건·파일 검증 오류. Pydantic 입력 오류는 원본 처리기에 따라 400입니다.

공개 사용자 API는 과정과 콘텐츠가 모두 공개된 경우에만 조회되며, 응답에 quiz나 정답·해설은 포함하지 않습니다.

생성 요청의 Idempotency-Key는 같은 관리자와 종류에서 재사용하면 기존 생성 ID를 반환합니다. 동시 중복 요청은 한 요청만 커밋되며 다른 요청은 409가 될 수 있습니다.

원본 프론트의 docs/API_CONTRACT.md에 Course, Content, Media JSON 구조가 있습니다. 이 통합본에서는 /api 대신 /api/ui를 사용합니다.
## 4주차 요청·응답 상세

실행 중인 `/docs`와 `/openapi.json`에서 필드 타입·필수 여부·길이 제한을 확인합니다.
`/api/ui`의 JSON 성공 응답은 SessionOut, CourseOut, ContentOut, MediaOut,
PublicContentOut 모델로 명시합니다. 배열 조회는 해당 모델의 배열입니다.
생성은 201, 조회·수정·공개 전환은 200, 로그아웃은 본문 없는 204입니다.
PATCH는 부분 필드 변경이 아니라 화면의 전체 저장 데이터를 전송합니다.

### 인증

POST `/auth/login` 요청:

```json
{"email":"admin@workfit.dev","password":"설정한 초기 비밀번호"}
```

로그인 및 GET `/auth/session` 응답:

```json
{"name":"관리자","role":"admin","csrfToken":"서버가 발급한 값"}
```

로그인 응답의 Set-Cookie를 브라우저에 저장합니다. 모든 관리자 요청은
`credentials: 'include'`, POST/PATCH는 `X-CSRF-Token`이 필요합니다(로그인 제외).
POST `/auth/logout`은 본문이 필요 없습니다. 세션은 8시간이며 서버 재시작 시 만료됩니다.

### 과정 생성·수정

POST `/admin/courses`, PATCH `/admin/courses/{cid}` 요청 예시:

```json
{"id":"프론트에서 생성한 UUID","title":"엑셀 기초","description":"과정 소개","objective":"조건 합계를 계산한다","job":"공통 실무","topic":"엑셀","level":"기초"}
```

응답은 위 필드와 `updatedAt`(ISO 날짜 문자열)을 반환합니다. id는 서버 숫자 ID의 문자열로 바뀝니다.
level은 기초/응용, topic은 등록된 교육 분야입니다. 제목은 공백을 제거한 뒤 비어 있으면 422입니다.
GET `/admin/courses`는 배열, GET `/admin/courses/{cid}`는 단일 과정입니다.

### 콘텐츠 생성·수정

POST `/admin/contents`, PATCH `/admin/contents/{cid}` 요청 예시:

```json
{"id":"프론트 UUID","courseId":"1","title":"SUMIF","objective":"조건 합계","status":"DRAFT","video":{"id":"10"},"thumbnail":null,"quiz":{"question":"조건 합계 함수는?","options":["SUMIF","COUNT"],"correctIndex":0,"explanation":"SUMIF는 조건별 합계 함수입니다."},"practiceText":"실습 안내","practice":null,"resource":null}
```

correctIndex는 0부터 시작합니다. 초기 미지정은 -1입니다. 파일 참조는 업로드 응답의 id를 사용합니다.
응답은 요청 구조와 updatedAt을 포함하며 파일 참조는 전체 MediaOut으로 확장됩니다.
courseId가 빈 문자열이면 과정 없는 초안으로 저장됩니다. 최초 생성은 status를 보내도 DRAFT입니다.
상태 변경은 POST `/admin/contents/{cid}/publish` 또는 `/unpublish`로 합니다(본문 없음).
공개 전환에는 실제 영상, 콘텐츠 제목, 과정 학습 목표, 유효한 퀴즈와 해설 등 공개 조건 검사가 적용됩니다.
정확한 누락 항목은 오류 fields를 확인합니다. 공개 중 저장에도 검사가 적용됩니다.
GET 목록은 배열, 상세·생성·수정·상태 전환은 단일 ContentOut을 반환합니다.

### 파일

POST `/admin/media`: multipart/form-data의 `file`(바이너리), `kind`(소문자).
관리자 화면에서 사용하는 kind는 video/thumbnail/practice/resource입니다.
video는 MP4 200MiB, 나머지는 20MiB까지입니다. 허용 확장자는 app/files.py의 ALLOWED 기준입니다.
브라우저에서 multipart Content-Type은 직접 지정하지 않습니다(boundary 자동 생성).

```json
{"id":"10","name":"sample.mp4","size":12345,"type":"video/mp4","kind":"video","duration":30.5}
```

영상 duration은 서버에서 분석합니다. 다른 종류의 duration은 null일 수 있습니다.
GET `/admin/media/{mid}/file`은 인증 후 바이너리를 반환합니다.
Range 요청은 206을 반환할 수 있으며 JSON 모델이 아닙니다.

### 공개 조회

GET `/courses` 및 `/courses/{cid}`는 공개 콘텐츠가 있는 공개 과정만 반환합니다.
GET `/contents`는 공개 콘텐츠 배열이며 `?courseId=1`로 필터링할 수 있습니다.
GET `/contents/{cid}`는 단일 공개 콘텐츠이며 관리자 응답에서 status와 quiz를 제외한 구조입니다.
GET `/media/{mid}/file`은 공개 과정의 공개 콘텐츠에 연결된 파일만 반환합니다.
공개 범위 밖의 상세·파일 요청은 404입니다. 공개 API에는 인증이 필요 없습니다.

### 오류 HTTP 코드와 본문

```json
{"message":"입력값을 확인해 주세요.","fields":["title: String should have at most 100 characters"],"details":["title: String should have at most 100 characters"]}
```

| HTTP 코드 | 의미와 처리 |
|---|---|
| 400 | Pydantic 입력 형식·길이 오류, 지원하지 않는 파일 종류/확장자·크기·빈 파일. 입력을 수정 |
| 401 | 로그인 실패·세션 만료·미로그인. 재로그인 |
| 403 | 관리자 권한/활성 상태, Origin 또는 CSRF 검사 실패 |
| 404 | 과정·콘텐츠·파일 없음 또는 공개 범위 밖 |
| 409 | 중복·외래키 등 DB 제약 충돌. 조회 후 재시도 여부 판단 |
| 422 | 제목·주제·파일 참조·MP4 분석·공개 조건 등 업무 규칙 위반. fields 표시 |
| 500 | 처리되지 않은 서버 오류. 입력을 유지하고 서버 로그 확인 |

fields와 details는 같은 문자열 배열이며 항상 존재합니다. 별도의 업무 오류 code 필드는 없습니다.
Swagger의 자동 422 입력 오류 설명과 달리 이 앱의 RequestValidationError는 **400**으로 처리합니다.
Starlette 자체의 없는 경로·허용하지 않은 메서드 오류 및 CORS preflight 거절은 위 업무 오류 본문과 다를 수 있습니다.
Idempotency-Key는 생성에만 사용하며 최대 64자, 생략하면 body.id를 사용합니다.
같은 관리자·종류·키 재요청은 기존 결과를 돌려줍니다. 서로 다른 작업에 같은 키를 재사용하지 않습니다.
