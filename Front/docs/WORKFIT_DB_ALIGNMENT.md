# WorkFit DB 구조 반영 범위

확인일: 2026-10-25. 원래 프론트의 화면과 로컬 저장 구조를 수정했습니다. WorkFit의 Next.js 프론트를 가져오거나 백엔드를 구현하지 않았습니다. DB가 기존 팀 GitHub 저장소에 올라온 후 사용할 수 있도록 필드 의미와 코드를 맞춘 단계입니다. 업로드 대상은 기존 팀 저장소의 Front 폴더로 한정합니다.

## 근거

- [db/schema.sql](https://github.com/jihoyoon01/workfit/blob/main/db/schema.sql), 확인한 blob SHA: `097846da98030fbc8b06422cba0d0dbf635992ef`.
- [db/seed.sql](https://github.com/jihoyoon01/workfit/blob/main/db/seed.sql): 분야 6개, 엑셀 스킬 3개, 태그·동의어 예시.
- [backend/app/schemas.py](https://github.com/jihoyoon01/workfit/blob/main/backend/app/schemas.py): 필드 의미 확인용으로만 읽었습니다.
- [과정 공개 검사](https://github.com/jihoyoon01/workfit/blob/main/backend/app/routers/courses.py), [콘텐츠 공개 검사](https://github.com/jihoyoon01/workfit/blob/main/backend/app/routers/contents.py).

DB 콘텐츠 상태에는 REVIEW가 있지만 일부 요청 스키마의 PublishStatus에는 없습니다. 이번 프론트는 DB 정의를 따라 검수 상태를 지원합니다. 실제 요청 방식은 API 연결을 구현할 때 맞춰야 합니다.

## 필드 대응

| 프론트 항목 | DB |
| --- | --- |
| 과정 categoryId, summary, learningGoal, level, status, thumbnail | courses.category_id, summary, learning_goal, level, status, thumbnail_file_id |
| 콘텐츠 learningGoal, workUse, sortOrder, version | contents.learning_goal, work_use, sort_order, version |
| 영상·썸네일과 메타데이터 | files + contents.video_file_id, thumbnail_file_id, duration_sec, aspect_ratio |
| quiz.question, explanation | quizzes.question, explanation (콘텐츠당 1문항) |
| quiz.options, correctIndex + optionFeedbacks | quiz_options.option_no(1부터), option_text, is_correct, feedback, feedback_source, rewatch_sec |
| practiceSettings + practiceText + practice | practices.title, instruction, example_file_id, expected_result, result_type, tolerance, required_function, answer_formula |
| tagIds, skillIds, resourceIds | content_tags, content_skills, content_resources |
| subtitles | subtitles.start_sec, end_sec, caption_text |
| 태그 종류·동의어 | tags, tag_synonyms |
| 자료 종류·파일·프롬프트·분야·상태 | resources |

`src/workfit-model.ts`의 `contentRows`는 화면 값을 테이블별 필드에 대응하는 순수 함수입니다. 네트워크 요청이나 SQL 실행은 하지 않습니다. 화면에서 다루기 편하도록 퀴즈 보기는 문자열 배열과 정답 위치로, 실습은 파일·안내·설정으로 나눴으며 DB의 보기 행·실습 행으로 대응할 수 있습니다.

로컬 항목은 UUID를 사용합니다. 실제 DB의 AUTO_INCREMENT 정수 ID, 등록자·등록일시, 로그인·서버 권한은 미래 백엔드가 관리할 값입니다. 분야·스킬의 로컬 ID는 seed 순서에 따른 참조값입니다. 실제 연결 시 DB에서 조회한 ID로 교체해야 합니다.

회원·학습 기록·검색 로그·등급·AI 피드백 등 나머지 테이블은 이번 관리자 프론트 정합 작업에 포함하지 않았습니다. 기존 사용자 검색·학습 목업은 별도 화면 예시로 유지합니다.

## 기존 데이터

저장소를 초기화하지 않습니다. 이전 description/objective를 summary/learningGoal로, PRIVATE를 HIDDEN으로, 한국어 난이도를 DB 코드로 옮깁니다. 단일 업무자료 파일은 자료 목록과 콘텐츠 연결로 옮기며 파일 Blob을 유지합니다. 직무·주제는 legacyClassification에 보존합니다. 스키마 버전 표시를 저장해 중복 마이그레이션을 방지합니다.

기존 `API_CONTRACT.md`와 과거 제출·개선 문서의 API 모드 설명은 이번 버전에 적용되지 않습니다.
