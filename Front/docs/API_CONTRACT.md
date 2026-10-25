> 최신 연동 계약과 실행 안내는 [백엔드 API 명세](../../backend/docs/ENDPOINTS.md), [연동 안내](../../backend/docs/INTEGRATION_GUIDE.md)를 참고하세요. 아래는 과거 제안 문서입니다.

> 과거 API 제안 문서입니다. 2026-10-25 버전은 프론트 전용이며 API를 연결하지 않습니다. 현재 기준은 WORKFIT_DB_ALIGNMENT.md를 참고하세요.

# 관리자 화면용 API 연결 계약 제안

이 문서는 프론트가 현재 요청하는 형식입니다. 실제 서버 구현·DB 명세서가 아닙니다. 팀 백엔드 담당자와 합의 후 경로·필드·권한·제약을 확정합니다. 기본 주소는 `/api`입니다.

## 공통

- 쿠키 기반 세션, 모든 관리자 API에서 서버 권한 검사. 미로그인 401, 권한 없음 403, 자료 없음 404, 상태 충돌 409, 입력 오류 422.
- 성공 응답은 `{data: ...}` 봉투 없이 **직접 객체 또는 배열**입니다. 날짜는 ISO 8601, ID는 문자열입니다.
- 오류는 `{ "message": "공개에 필요한 항목을 확인해 주세요.", "fields": ["영상이 필요합니다."] }`. fields는 선택적인 문자열 배열입니다.
- `POST /admin/courses`, `POST /admin/contents`는 요청의 UUID를 `Idempotency-Key` 헤더로 보냅니다. 서버는 같은 계정·같은 키의 재전송을 중복 생성하지 않고 최초 ID를 반환해야 합니다. 응답의 ID는 서버가 발급해도 됩니다.
- 프론트의 updatedAt은 신뢰하지 않고 서버 저장 시각을 응답합니다. 수정 시 원자적 저장을 보장해야 합니다. 다중 관리자 동시 편집 충돌 해결은 이번 프론트에 포함하지 않았습니다.
- 일반 JSON 요청은 20초, 파일 업로드·파일 조회는 120초에 중단합니다. 중단이 서버 저장 취소를 뜻하지는 않습니다. 자동 재전송하지 않습니다.

## 엔드포인트

| 방식 | 경로 | 요청 | 성공 응답 |
|---|---|---|---|
| GET | `/auth/session` | 쿠키 | Session + csrfToken |
| POST | `/auth/login` | `{email,password}` | Session + csrfToken |
| POST | `/auth/logout` | 쿠키 + CSRF | 204 |
| GET | `/admin/courses` | 없음 | Course[] |
| GET | `/admin/courses/{id}` | 없음 | Course |
| POST | `/admin/courses` | Course | 저장된 Course |
| PATCH | `/admin/courses/{id}` | Course 전체 편집 필드 | 저장된 Course |
| GET | `/admin/contents` | 없음 | Content[] |
| GET | `/admin/contents/{id}` | 없음 | Content |
| POST | `/admin/contents` | Content | 저장된 Content |
| PATCH | `/admin/contents/{id}` | Content 전체 편집 필드 | 저장된 Content |
| POST | `/admin/contents/{id}/publish` | 없음 | PUBLISHED 상태의 Content |
| POST | `/admin/contents/{id}/unpublish` | 없음 | PRIVATE 상태의 Content |
| POST | `/admin/media` | FormData: file, kind | Media |
| GET | `/admin/media/{id}/file` | 쿠키 | 바이너리 파일 |

목록 검색·필터는 초기 규모에서 프론트가 전체 배열에 적용합니다. 목록 API의 페이지네이션은 아직 사용하지 않습니다.

## 타입

정확한 프론트 타입은 `src/model.ts`를 참고합니다.

```ts
type Session = { name: string; role: 'admin' | 'member'; csrfToken?: string };
type Course = {
  id: string; title: string; description: string; objective: string;
  job: string; topic: string; level: '기초' | '응용'; updatedAt: string;
};
type Media = {
  id: string; name: string; size: number; type: string;
  kind: 'video' | 'thumbnail' | 'practice' | 'resource';
  duration?: number; width?: number; height?: number;
};
type Content = {
  id: string; courseId: string; title: string; objective: string;
  status: 'DRAFT' | 'PUBLISHED' | 'PRIVATE';
  video: Media | null; thumbnail: Media | null;
  quiz: { question: string; options: string[]; correctIndex: number; explanation: string };
  practiceText: string; practice: Media | null; resource: Media | null;
  updatedAt: string;
};
```

correctIndex는 0부터 시작하며 미선택 초안은 -1입니다. 초안에는 빈 courseId·title과 빈 퀴즈가 올 수 있습니다. 공개 시 모두 검증해야 합니다.

## 파일·권한·상태

- 업로드 형식과 크기를 서버가 검사하고 저장소의 실제 미디어 ID·메타데이터를 반환합니다. 브라우저는 재생 가능 여부를 확인하지만 이를 서버 검증으로 대신할 수 없습니다.
- 콘텐츠 JSON의 Media는 편집 화면용 스냅샷입니다. 서버는 Media.id로 소유권·종류·실제 존재 여부를 조회해야 하며 클라이언트가 전송한 파일명·크기·재생시간만 신뢰하면 안 됩니다.
- 초안·비공개 파일은 관리자 인증이 필요한 경로로만 제공합니다. 프론트는 보호된 파일을 fetch하여 Blob URL로 미리 봅니다. 비인증 정적 URL을 사용하지 않습니다.
- 공개 상태는 전용 publish/unpublish API가 결정합니다. 일반 PATCH의 status만으로 관리자 검증을 우회하면 안 됩니다.
- 공개 콘텐츠 수정 시 영상·퀴즈 변경이 기존 학습 기록에 주는 영향은 백엔드 정책 확정이 필요합니다. 이 프론트는 기록 삭제나 버전 자동 이관을 구현하지 않습니다.
- 로그인 세션 쿠키는 서버에서 HttpOnly·SameSite를 설정하고, HTTPS 환경에서는 Secure를 적용합니다. CSRF 토큰은 세션·로그인 응답에서 발급하고 변경 요청의 X-CSRF-Token을 검증합니다. 로그인 자체의 출처·CSRF 방어도 서버에서 결정합니다.
- 다른 출처의 API를 사용하면 허용 출처와 credentials를 서버 CORS에 명시합니다. 로컬 개발은 동일 출처 Vite proxy 사용을 권장합니다.

## 백엔드 연결 후 함께 확인할 항목

실제 계정 로그인/로그아웃, 비관리자 403, 만료 401, 파일 업로드·재조회, 초안 저장·수정, 새로고침 복원, 공개 누락 422, 공개·비공개, 중복 생성 방지, CSRF 거절, 초안 파일의 비인증 접근 차단.

## 사용자 조회 API 추가 제안

관리자 API는 유지하고 사용자용 조회 어댑터를 별도로 추가했습니다. 아래 API는 프론트 연결 계약 제안이며 실제 팀 서버 제공 여부는 미검증입니다.

| 방식 | 경로 | 응답 |
|---|---|---|
| GET | `/courses` | 공개 영상이 있는 Course[] |
| GET | `/courses/{id}` | 공개 영상이 있는 Course |
| GET | `/contents?courseId={id}` | 공개 PublicContent[] |
| GET | `/contents/{id}` | 공개 PublicContent |
| GET | `/media/{id}/file` | 공개 콘텐츠에 연결된 파일 바이너리 |

PublicContent는 Content에서 id·courseId·title·objective·video·thumbnail·practiceText·practice·resource·updatedAt만 포함합니다. 관리자 상태·퀴즈 정답·해설은 노출하지 않습니다. 서버는 클라이언트 필터에 의존하지 않고 공개 여부와 부모 과정·파일 연결을 검사해야 합니다. 비공개/초안의 직접 요청에는 404를 반환하며 사용자 역할로 관리자 API를 호출하면 403을 반환해야 합니다.

예시 모드도 동일한 공개 범위를 조회 단계에서 검사합니다. 이미 다운로드한 파일까지 회수하거나 열린 화면을 실시간으로 갱신하는 기능은 없습니다. 다시 조회할 때 변경된 공개 상태가 적용됩니다.
