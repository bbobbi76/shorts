# FastAPI 관리자 백엔드

관리자 로그인, 과정·콘텐츠 저장, 파일 업로드, 태그·실무자료 관리를 제공합니다.
최신 Front의 실습 설정, 보기별 피드백, 태그·스킬·자료 연결, 자막 구간과 INTRO·REVIEW 상태를 지원합니다.

- [실행 방법·환경 설정·개발 계정](docs/INTEGRATION_GUIDE.md)
- [요청·응답·오류 명세](docs/ENDPOINTS.md)
- [4주차 작업 정리](docs/WEEK4_BACKEND_ACTIVITY.md)

관리자 프론트는 `/api/ui`를 사용합니다. 기존 `/api/admin` 및 `/api/auth` 경로는 별도의 과거 Bearer API이며, 새 프론트의 쿠키 로그인과 섞어 사용하지 않습니다.

## 확인 결과

백엔드 SQLite 테스트 15개, 프론트 테스트 26개와 빌드를 통과했습니다.
실제 MySQL은 로컬 계정 인증 실패로 검증하지 못했으며, 브라우저·MySQL 통합 확인은 남아 있습니다.

## 테스트

backend 폴더에서 실행합니다.

```powershell
..\.venv\Scripts\python.exe -m pytest tests -q
```

## 개발 환경 제한

세션은 메모리에 보관해 서버 재시작 시 만료됩니다. 파일은 로컬 uploads 폴더에 저장합니다.
공유 세션 저장소, 동시 편집 충돌 처리, AI 검색·피드백 생성 API의 실제 연결은 별도 작업입니다.
자막은 구간 배열을 저장하며, 관리자 화면의 SRT·SMI 파일 파싱은 이번 API 변경에 포함하지 않습니다.
