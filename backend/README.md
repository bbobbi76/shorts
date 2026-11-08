# FastAPI 관리자 백엔드

관리자 로그인, 과정·콘텐츠 저장, 파일 업로드, 태그·실무자료 관리를 제공합니다.
최신 Front의 실습 설정, 보기별 피드백, 태그·스킬·자료 연결, 자막 구간과 INTRO·REVIEW 상태를 지원합니다.

- [실행 방법·환경 설정·개발 계정](docs/INTEGRATION_GUIDE.md)
- [요청·응답·오류 명세](docs/ENDPOINTS.md)
- [4주차 작업 정리](docs/WEEK4_BACKEND_ACTIVITY.md)
- [5주차 피드백 반영](docs/WEEK5_BACKEND_ACTIVITY.md)
- [6주차 AI·시연 데이터 연동 및 실행 안내](docs/WEEK6_BACKEND_INTEGRATION.md)
- [API 필드 상세](docs/API_FIELDS.md)

관리자 프론트는 `/api/ui`를 사용합니다. 기존 `/api/admin` 및 `/api/auth` 경로는 별도의 과거 Bearer API이며, 새 프론트의 쿠키 로그인과 섞어 사용하지 않습니다.

## 확인 결과

6주차 백엔드·AI 테스트 197개와 프론트 테스트 48개가 통과했고 프론트 빌드와 의존성 검사를 확인했습니다.
실제 MySQL 8.0.45와 Gemini로 시연 데이터·파일 38개·자연어 검색·실습 피드백·비공개 차단을 검증했습니다.
브라우저에서도 과정 썸네일, 영상 로딩, CSV 다운로드, AI 검색과 정답 100점 피드백을 확인했습니다.
실제 Gemini 전체 평가 세트 테스트 1개는 일반 회귀 테스트에서 제외하며, 실제 연동 검증 결과는 6주차 문서에 별도 기록했습니다.

## 테스트

backend 폴더에서 실행합니다.

```powershell
..\.venv\Scripts\python.exe -m pytest tests -q
```

## 개발 환경 제한

세션은 메모리에 보관해 서버 재시작 시 만료됩니다. 파일은 로컬 uploads 폴더에 저장합니다.
공유 세션 저장소와 동시 편집 충돌 처리는 별도 작업입니다. AI 검색·피드백 API는 6주차에 연결했으며, 실제 Gemini 호출에는 키 설정이 필요합니다. AI 피드백 실행 및 검증 범위는 [통합 결과](ai/WEEK5_FEEDBACK_INTEGRATION_RESULT.md)를 확인하세요.
자막은 구간 배열을 저장하며, 관리자 화면의 SRT·SMI 파일 파싱은 이번 API 변경에 포함하지 않습니다.
