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