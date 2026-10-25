# WorkFit 프론트 검증

검증일: 2026-10-25. 로컬 소스 `admin-frontend` 기준입니다.

- `npm.cmd run build`: TypeScript 검사·Vite 빌드 성공.
- `npm.cmd test`: 테스트 파일 3개, 테스트 25개 통과.
- 기존 데이터의 필드 변환·파일 Blob 보존·중복 마이그레이션 방지 확인.
- 상태 코드·퀴즈 정답과 피드백 매핑·자막 시간·길이·실습 숫자·동의어 중복 검사.
- 입력 내용 저장·독립 조회, 영상 교체 버전 증가, 과정 공개 조건 검사.
- 비공개 자료의 사용자 데이터와 파일 접근 제외, 관리자 실습 정답의 사용자 데이터 제외.

## 실제 브라우저

개발 서버는 QA 전용 주소 `http://127.0.0.1:5176`에서 실행했습니다. 기존 사용 주소 5173의 브라우저 데이터를 초기화하지 않았습니다. 이 서버에 `VITE_DATA_MODE=api`를 설정했지만 앱이 로컬 저장소로 고정되는지도 함께 확인했습니다.

`scripts/browser-workfit.cjs` 실행 결과:

```json
{"success":true,"fetchOrXhrRequests":[],"pageErrors":[],"screenshots":7}
```

태그·동의어와 프롬프트 자료를 등록한 후 새로고침해 복원했습니다. 콘텐츠에 영상·보기별 피드백·재시청 시점·실습 정답 기준·태그·스킬·자료·자막을 입력하고 검수 상태로 저장했습니다. 보기 삭제 후 정답과 피드백이 함께 이동하는 것을 확인했습니다. 새로고침 복원, 퀴즈·자료 미리보기, 콘텐츠 공개, 과정 공개와 입문 난이도 저장, 사용자 자료 표시를 확인했습니다. 390px 모바일에서 편집·자료 화면의 가로 넘침이 없었습니다.

캡처는 로딩 대화상자가 사라진 뒤 다시 저장해 확인했습니다. 아래 파일은 로컬 output/playwright 폴더에 보관하며 GitHub 업로드에서 제외합니다.

- 과정 편집: `workfit-course-desktop.png`
- 콘텐츠 편집: `workfit-content-desktop.png`
- 태그 관리: `workfit-tags-desktop.png`
- 자료 관리: `workfit-resources-desktop.png`
- 공개 사용자 화면: `workfit-learner-desktop.png`
- 모바일 콘텐츠: `workfit-content-mobile.png`
- 모바일 자료: `workfit-resources-mobile.png`

이 결과는 프론트·브라우저 저장소 검증입니다. MySQL 실행·백엔드·실제 API 연결은 이번 작업 범위에 포함하지 않았습니다. QA 전용 빈 화면에서 발생한 favicon.ico 404는 본문 기능 오류와 별개이며 앱의 JavaScript 실행 오류는 없었습니다.
