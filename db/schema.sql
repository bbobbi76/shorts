-- =====================================================================
-- WorkFit DB 스키마 (MySQL 8.0 이상)
-- 실행 순서: 이 파일 → seed.sql
-- 문자셋: utf8mb4 / 엔진: InnoDB / 시간대: Asia/Seoul 기준 DATETIME
-- =====================================================================

CREATE DATABASE IF NOT EXISTS workfit
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE workfit;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS admin_logs, user_skills, ai_feedbacks, practice_completions,
  practice_submissions, quiz_attempts, bookmarks, learning_progress, course_enrollments,
  content_requests, search_logs, content_tags, tag_synonyms, tags,
  content_resources, resources, practices, quiz_options, quizzes, subtitles,
  content_skills, contents, courses, files, user_interests, skills, categories,
  users, tiers;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- ② 회원 · 분류
-- ---------------------------------------------------------------------

CREATE TABLE tiers (
  tier_code   VARCHAR(20)  NOT NULL                COMMENT '등급 코드 (BRONZE, SILVER, GOLD, DIAMOND)',
  name        VARCHAR(30)  NOT NULL                COMMENT '화면 표시 이름 (예: 브론즈)',
  min_score   INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '이 등급이 되는 최소 학습 점수',
  badge_url   VARCHAR(500) NULL                    COMMENT '배지 이미지 경로',
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '낮을수록 하위 등급',
  PRIMARY KEY (tier_code),
  UNIQUE KEY uk_tiers_min_score (min_score)
) ENGINE=InnoDB COMMENT='학습 등급 기준';

CREATE TABLE users (
  user_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NOT NULL                       COMMENT '로그인 ID',
  password_hash  VARCHAR(255) NOT NULL                       COMMENT 'BCrypt 등 해시값 (원문 저장 금지)',
  name           VARCHAR(50)  NOT NULL                       COMMENT '이름 또는 닉네임',
  role           ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER' COMMENT '권한',
  status         ENUM('ACTIVE','SUSPENDED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE' COMMENT '계정 상태',
  tier_code      VARCHAR(20)  NOT NULL DEFAULT 'BRONZE'      COMMENT '현재 등급',
  learning_score INT UNSIGNED NOT NULL DEFAULT 0             COMMENT '등급 산정용 누적 점수',
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_role_status (role, status),
  CONSTRAINT fk_users_tier FOREIGN KEY (tier_code) REFERENCES tiers (tier_code)
) ENGINE=InnoDB COMMENT='회원 (일반 회원 + 관리자)';

CREATE TABLE categories (
  category_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(50)  NOT NULL                 COMMENT '분야 이름 (예: 엑셀, 마케팅)',
  category_type ENUM('JOB','COMMON') NOT NULL       COMMENT 'JOB=직무별, COMMON=공통 실무',
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id),
  UNIQUE KEY uk_categories_type_name (category_type, name)
) ENGINE=InnoDB COMMENT='교육 분야';

CREATE TABLE skills (
  skill_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL                 COMMENT '소속 분야',
  name        VARCHAR(50)  NOT NULL                 COMMENT '스킬 이름 (레이더 차트 축)',
  description VARCHAR(255) NULL,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (skill_id),
  UNIQUE KEY uk_skills_category_name (category_id, name),
  CONSTRAINT fk_skills_category FOREIGN KEY (category_id) REFERENCES categories (category_id)
) ENGINE=InnoDB COMMENT='스킬 (마이스펙 스킬 성취도의 기준)';

CREATE TABLE user_interests (
  user_id     BIGINT UNSIGNED NOT NULL,
  category_id INT UNSIGNED    NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category_id),
  CONSTRAINT fk_user_interests_user     FOREIGN KEY (user_id)     REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_interests_category FOREIGN KEY (category_id) REFERENCES categories (category_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='회원 관심 분야 (N:M)';

-- ---------------------------------------------------------------------
-- ① 과정 · 콘텐츠 (관리자 콘텐츠 업로드 모듈)
-- ---------------------------------------------------------------------

CREATE TABLE files (
  file_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_type     ENUM('VIDEO','THUMBNAIL','PRACTICE','RESOURCE','SUBTITLE') NOT NULL COMMENT '파일 용도',
  original_name VARCHAR(255)    NOT NULL           COMMENT '업로드한 원래 파일명',
  stored_path   VARCHAR(500)    NOT NULL           COMMENT '저장소 경로 또는 URL',
  mime_type     VARCHAR(100)    NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL,
  uploaded_by   BIGINT UNSIGNED NOT NULL           COMMENT '업로드한 관리자',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (file_id),
  UNIQUE KEY uk_files_stored_path (stored_path),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='업로드 파일 (영상·썸네일·실습·자료·자막)';

CREATE TABLE courses (
  course_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id       INT UNSIGNED    NOT NULL       COMMENT '분야',
  title             VARCHAR(100)    NOT NULL       COMMENT '과정명',
  summary           VARCHAR(500)    NULL           COMMENT '과정 소개',
  learning_goal     VARCHAR(500)    NULL           COMMENT '학습 목표 (공개 시 필수)',
  level             ENUM('INTRO','BASIC','ADVANCED') NOT NULL DEFAULT 'BASIC' COMMENT '난이도',
  thumbnail_file_id BIGINT UNSIGNED NULL,
  status            ENUM('DRAFT','PUBLISHED','HIDDEN') NOT NULL DEFAULT 'DRAFT' COMMENT '공개 상태',
  created_by        BIGINT UNSIGNED NOT NULL       COMMENT '등록한 관리자',
  published_at      DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id),
  KEY idx_courses_status_category (status, category_id),
  FULLTEXT KEY ft_courses_title (title, summary) WITH PARSER ngram,
  CONSTRAINT fk_courses_category  FOREIGN KEY (category_id)       REFERENCES categories (category_id),
  CONSTRAINT fk_courses_thumbnail FOREIGN KEY (thumbnail_file_id) REFERENCES files (file_id),
  CONSTRAINT fk_courses_creator   FOREIGN KEY (created_by)        REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='과정';

CREATE TABLE contents (
  content_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id         BIGINT UNSIGNED NOT NULL       COMMENT '소속 과정',
  title             VARCHAR(100)    NOT NULL       COMMENT '콘텐츠 제목',
  learning_goal     VARCHAR(500)    NULL           COMMENT '학습 목표 (AI 피드백 기준으로도 사용)',
  work_use          VARCHAR(255)    NULL           COMMENT '이번 영상으로 할 수 있는 업무',
  video_file_id     BIGINT UNSIGNED NULL           COMMENT '숏폼 영상 (공개 시 필수)',
  thumbnail_file_id BIGINT UNSIGNED NULL,
  duration_sec      INT UNSIGNED    NULL           COMMENT '영상 길이(초), 업로드 후 서버가 기록',
  aspect_ratio      VARCHAR(10)     NULL           COMMENT '화면 비율 (예: 9:16)',
  sort_order        INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '과정 내 순서',
  version           INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT '영상 교체 시 +1',
  status            ENUM('DRAFT','REVIEW','PUBLISHED','HIDDEN') NOT NULL DEFAULT 'DRAFT' COMMENT '임시저장/검수/공개/비공개',
  created_by        BIGINT UNSIGNED NOT NULL,
  published_at      DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (content_id),
  KEY idx_contents_course_order (course_id, sort_order),
  KEY idx_contents_status (status),
  FULLTEXT KEY ft_contents_title (title, work_use) WITH PARSER ngram,
  CONSTRAINT fk_contents_course    FOREIGN KEY (course_id)         REFERENCES courses (course_id),
  CONSTRAINT fk_contents_video     FOREIGN KEY (video_file_id)     REFERENCES files (file_id),
  CONSTRAINT fk_contents_thumbnail FOREIGN KEY (thumbnail_file_id) REFERENCES files (file_id),
  CONSTRAINT fk_contents_creator   FOREIGN KEY (created_by)        REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='콘텐츠 (숏폼 영상 1개 단위)';

CREATE TABLE content_skills (
  content_id BIGINT UNSIGNED NOT NULL,
  skill_id   INT UNSIGNED    NOT NULL,
  PRIMARY KEY (content_id, skill_id),
  KEY idx_content_skills_skill (skill_id),
  CONSTRAINT fk_content_skills_content FOREIGN KEY (content_id) REFERENCES contents (content_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_skills_skill   FOREIGN KEY (skill_id)   REFERENCES skills (skill_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='콘텐츠가 다루는 스킬 (N:M)';

CREATE TABLE subtitles (
  subtitle_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_id  BIGINT UNSIGNED NOT NULL,
  start_sec   DECIMAL(7,2)    NOT NULL             COMMENT '자막 시작 시점(초)',
  end_sec     DECIMAL(7,2)    NOT NULL             COMMENT '자막 끝 시점(초)',
  caption_text VARCHAR(500)   NOT NULL             COMMENT '자막 문장',
  PRIMARY KEY (subtitle_id),
  KEY idx_subtitles_content_start (content_id, start_sec),
  FULLTEXT KEY ft_subtitles_text (caption_text) WITH PARSER ngram,
  CONSTRAINT fk_subtitles_content FOREIGN KEY (content_id) REFERENCES contents (content_id) ON DELETE CASCADE,
  CONSTRAINT ck_subtitles_range CHECK (end_sec > start_sec)
) ENGINE=InnoDB COMMENT='자막 구간 (영상 속 구간 검색용)';

CREATE TABLE quizzes (
  quiz_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_id  BIGINT UNSIGNED NOT NULL             COMMENT '연결된 콘텐츠',
  question    VARCHAR(500)    NOT NULL             COMMENT '문제',
  explanation TEXT            NULL                 COMMENT '해설 (공개 시 필수)',
  sort_order  INT UNSIGNED    NOT NULL DEFAULT 1   COMMENT '초기에는 콘텐츠당 1문항',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (quiz_id),
  KEY idx_quizzes_content (content_id, sort_order),
  CONSTRAINT fk_quizzes_content FOREIGN KEY (content_id) REFERENCES contents (content_id)
) ENGINE=InnoDB COMMENT='퀴즈 (객관식)';

CREATE TABLE quiz_options (
  option_id       BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  quiz_id         BIGINT UNSIGNED  NOT NULL,
  option_no       TINYINT UNSIGNED NOT NULL        COMMENT '보기 번호 (1~4)',
  option_text     VARCHAR(255)     NOT NULL        COMMENT '보기 내용',
  is_correct      BOOLEAN          NOT NULL DEFAULT FALSE COMMENT '정답 여부 (퀴즈당 1개)',
  feedback        TEXT             NULL            COMMENT '이 보기를 골랐을 때 보여줄 AI 피드백',
  feedback_source ENUM('NONE','AI_DRAFT','ADMIN') NOT NULL DEFAULT 'NONE' COMMENT '피드백 작성 주체',
  rewatch_sec     INT UNSIGNED     NULL            COMMENT '다시 볼 영상 시점(초)',
  PRIMARY KEY (option_id),
  UNIQUE KEY uk_quiz_options_no (quiz_id, option_no),
  CONSTRAINT fk_quiz_options_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (quiz_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='퀴즈 보기 + 보기별 피드백';

CREATE TABLE practices (
  practice_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_id        BIGINT UNSIGNED NOT NULL       COMMENT '연결된 콘텐츠',
  title             VARCHAR(100)    NOT NULL       COMMENT '실습 제목',
  instruction       TEXT            NOT NULL       COMMENT '수행 방법 안내',
  example_file_id   BIGINT UNSIGNED NULL           COMMENT '예제 파일 (xlsx)',
  expected_result   VARCHAR(255)    NOT NULL       COMMENT '예시 결과 (정답 결과값)',
  result_type       ENUM('NUMBER','TEXT') NOT NULL DEFAULT 'NUMBER' COMMENT '결과 비교 방식',
  tolerance         DECIMAL(12,4)   NOT NULL DEFAULT 0 COMMENT '숫자 비교 허용 오차',
  required_function VARCHAR(50)     NULL           COMMENT '핵심 함수 (예: SUMIF)',
  answer_formula    VARCHAR(1000)   NULL           COMMENT '정답 수식 (2회차부터 공개)',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (practice_id),
  KEY idx_practices_content (content_id),
  CONSTRAINT fk_practices_content FOREIGN KEY (content_id)      REFERENCES contents (content_id),
  CONSTRAINT fk_practices_file    FOREIGN KEY (example_file_id) REFERENCES files (file_id)
) ENGINE=InnoDB COMMENT='선택 실습 (수식·결과 입력형)';

CREATE TABLE resources (
  resource_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(100)    NOT NULL,
  resource_type  ENUM('TEMPLATE','EXAMPLE_DOC','PROMPT') NOT NULL COMMENT '템플릿/예시 문서/프롬프트',
  description    VARCHAR(500)    NULL               COMMENT '어떤 업무에 쓰는지',
  file_id        BIGINT UNSIGNED NULL               COMMENT '파일형 자료',
  prompt_text    TEXT            NULL               COMMENT '프롬프트형 자료 본문',
  category_id    INT UNSIGNED    NULL,
  status         ENUM('DRAFT','PUBLISHED','HIDDEN') NOT NULL DEFAULT 'DRAFT',
  download_count INT UNSIGNED    NOT NULL DEFAULT 0,
  created_by     BIGINT UNSIGNED NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_id),
  KEY idx_resources_type_status (resource_type, status),
  FULLTEXT KEY ft_resources_title (title, description) WITH PARSER ngram,
  CONSTRAINT fk_resources_file     FOREIGN KEY (file_id)     REFERENCES files (file_id),
  CONSTRAINT fk_resources_category FOREIGN KEY (category_id) REFERENCES categories (category_id),
  CONSTRAINT fk_resources_creator  FOREIGN KEY (created_by)  REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='실무자료 (템플릿·예시 문서·프롬프트)';

CREATE TABLE content_resources (
  content_id  BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (content_id, resource_id),
  KEY idx_content_resources_resource (resource_id),
  CONSTRAINT fk_content_resources_content  FOREIGN KEY (content_id)  REFERENCES contents (content_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_resources_resource FOREIGN KEY (resource_id) REFERENCES resources (resource_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='콘텐츠 ↔ 실무자료 연결 (N:M)';

-- ---------------------------------------------------------------------
-- ③ 검색
-- ---------------------------------------------------------------------

CREATE TABLE tags (
  tag_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)  NOT NULL                 COMMENT '대표 태그 (예: 조건별 합계)',
  tag_type   ENUM('SITUATION','ERROR','FUNCTION','TOOL') NOT NULL COMMENT '업무 상황/오류 메시지/함수/툴',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tag_id),
  UNIQUE KEY uk_tags_name (name)
) ENGINE=InnoDB COMMENT='검색 태그';

CREATE TABLE tag_synonyms (
  synonym_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tag_id     INT UNSIGNED NOT NULL,
  synonym    VARCHAR(50)  NOT NULL                 COMMENT '같은 뜻의 검색어 (예: 부서별 합계)',
  PRIMARY KEY (synonym_id),
  UNIQUE KEY uk_tag_synonyms_synonym (synonym),
  KEY idx_tag_synonyms_tag (tag_id),
  CONSTRAINT fk_tag_synonyms_tag FOREIGN KEY (tag_id) REFERENCES tags (tag_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='태그 동의어';

CREATE TABLE content_tags (
  content_id BIGINT UNSIGNED NOT NULL,
  tag_id     INT UNSIGNED    NOT NULL,
  PRIMARY KEY (content_id, tag_id),
  KEY idx_content_tags_tag (tag_id),
  CONSTRAINT fk_content_tags_content FOREIGN KEY (content_id) REFERENCES contents (content_id) ON DELETE CASCADE,
  CONSTRAINT fk_content_tags_tag     FOREIGN KEY (tag_id)     REFERENCES tags (tag_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='콘텐츠 ↔ 태그 연결 (N:M)';

CREATE TABLE search_logs (
  search_log_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NULL              COMMENT '비회원 검색은 NULL',
  keyword        VARCHAR(100)    NOT NULL          COMMENT '입력한 검색어',
  matched_tag_id INT UNSIGNED    NULL              COMMENT '동의어 변환으로 찾은 태그',
  result_count   INT UNSIGNED    NOT NULL          COMMENT '결과 개수 (0 = 결과 없음)',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (search_log_id),
  KEY idx_search_logs_keyword (keyword),
  KEY idx_search_logs_created (created_at),
  CONSTRAINT fk_search_logs_user FOREIGN KEY (user_id)        REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT fk_search_logs_tag  FOREIGN KEY (matched_tag_id) REFERENCES tags (tag_id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='검색 기록 (인기 검색어·결과 없음 분석)';

CREATE TABLE content_requests (
  request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  keyword    VARCHAR(100)    NOT NULL              COMMENT '결과가 없던 검색어',
  message    VARCHAR(500)    NULL                  COMMENT '요청 내용',
  status     ENUM('RECEIVED','PLANNED','DONE','REJECTED') NOT NULL DEFAULT 'RECEIVED',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id),
  KEY idx_content_requests_status (status),
  CONSTRAINT fk_content_requests_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='콘텐츠 제작 요청';

-- ---------------------------------------------------------------------
-- ④ 학습 기록 · AI 피드백 · 스킬
-- ---------------------------------------------------------------------

CREATE TABLE course_enrollments (
  enrollment_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  course_id       BIGINT UNSIGNED NOT NULL,
  status          ENUM('IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
  last_content_id BIGINT UNSIGNED NULL             COMMENT '이어보기 대상 콘텐츠',
  started_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME        NULL,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id),
  UNIQUE KEY uk_course_enrollments_user_course (user_id, course_id),
  KEY idx_course_enrollments_course (course_id),
  CONSTRAINT fk_course_enrollments_user    FOREIGN KEY (user_id)         REFERENCES users (user_id),
  CONSTRAINT fk_course_enrollments_course  FOREIGN KEY (course_id)       REFERENCES courses (course_id),
  CONSTRAINT fk_course_enrollments_content FOREIGN KEY (last_content_id) REFERENCES contents (content_id)
) ENGINE=InnoDB COMMENT='회원별 과정 수강 상태';

CREATE TABLE learning_progress (
  progress_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  content_id        BIGINT UNSIGNED NOT NULL,
  content_version   INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT '시청한 영상 버전',
  last_position_sec INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '마지막 시청 위치(초)',
  watched_ranges    JSON            NULL               COMMENT '시청 구간 [[시작,끝],...] 겹침 병합 후 저장',
  watched_sec       INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT '서로 다른 시청 구간 합계(초)',
  watch_ratio       DECIMAL(5,2)    NOT NULL DEFAULT 0 COMMENT '시청률(%) = watched_sec / 영상 길이',
  quiz_submitted    BOOLEAN         NOT NULL DEFAULT FALSE COMMENT '퀴즈 1회 이상 제출',
  is_completed      BOOLEAN         NOT NULL DEFAULT FALSE COMMENT '시청률 90% 이상 + 퀴즈 제출',
  completed_at      DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (progress_id),
  UNIQUE KEY uk_learning_progress_user_content (user_id, content_id),
  KEY idx_learning_progress_content (content_id),
  CONSTRAINT fk_learning_progress_user    FOREIGN KEY (user_id)    REFERENCES users (user_id),
  CONSTRAINT fk_learning_progress_content FOREIGN KEY (content_id) REFERENCES contents (content_id),
  CONSTRAINT ck_learning_progress_ratio CHECK (watch_ratio BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='회원별 콘텐츠 학습 기록';

CREATE TABLE bookmarks (
  user_id    BIGINT UNSIGNED NOT NULL,
  content_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, content_id),
  KEY idx_bookmarks_content (content_id),
  CONSTRAINT fk_bookmarks_user    FOREIGN KEY (user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_bookmarks_content FOREIGN KEY (content_id) REFERENCES contents (content_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='북마크';

CREATE TABLE quiz_attempts (
  attempt_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  quiz_id            BIGINT UNSIGNED NOT NULL,
  selected_option_id BIGINT UNSIGNED NOT NULL      COMMENT '고른 보기',
  is_correct         BOOLEAN         NOT NULL      COMMENT '제출 시점 정답 여부',
  attempt_no         INT UNSIGNED    NOT NULL      COMMENT '몇 번째 시도인지 (1부터)',
  submitted_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id),
  UNIQUE KEY uk_quiz_attempts_no (user_id, quiz_id, attempt_no),
  KEY idx_quiz_attempts_quiz (quiz_id),
  CONSTRAINT fk_quiz_attempts_user   FOREIGN KEY (user_id)            REFERENCES users (user_id),
  CONSTRAINT fk_quiz_attempts_quiz   FOREIGN KEY (quiz_id)            REFERENCES quizzes (quiz_id),
  CONSTRAINT fk_quiz_attempts_option FOREIGN KEY (selected_option_id) REFERENCES quiz_options (option_id)
) ENGINE=InnoDB COMMENT='퀴즈 제출 기록 (QuizResult)';

CREATE TABLE practice_submissions (
  submission_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                BIGINT UNSIGNED NOT NULL,
  practice_id            BIGINT UNSIGNED NOT NULL,
  attempt_no             INT UNSIGNED    NOT NULL  COMMENT '몇 번째 제출인지 (1부터)',
  formula                VARCHAR(1000)   NOT NULL  COMMENT '사용자가 입력한 수식',
  result_value           VARCHAR(255)    NOT NULL  COMMENT '사용자가 입력한 결과값',
  is_match               BOOLEAN         NOT NULL  COMMENT '서버 판정: 예시 결과와 일치',
  uses_required_function BOOLEAN         NULL      COMMENT '서버 판정: 핵심 함수 사용 (기준 없으면 NULL)',
  syntax_ok              BOOLEAN         NOT NULL  COMMENT '서버 판정: 수식 형식 정상',
  submitted_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (submission_id),
  UNIQUE KEY uk_practice_submissions_no (user_id, practice_id, attempt_no),
  KEY idx_practice_submissions_practice (practice_id),
  CONSTRAINT fk_practice_submissions_user     FOREIGN KEY (user_id)     REFERENCES users (user_id),
  CONSTRAINT fk_practice_submissions_practice FOREIGN KEY (practice_id) REFERENCES practices (practice_id)
) ENGINE=InnoDB COMMENT='실습 제출 기록 (PracticeResult)';

CREATE TABLE practice_completions (
  user_id      BIGINT UNSIGNED NOT NULL,
  practice_id  BIGINT UNSIGNED NOT NULL,
  completed_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, practice_id),
  KEY idx_practice_completions_practice (practice_id),
  CONSTRAINT fk_practice_completions_user     FOREIGN KEY (user_id)     REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_practice_completions_practice FOREIGN KEY (practice_id) REFERENCES practices (practice_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='사용자가 직접 표시한 실습 완료';

CREATE TABLE ai_feedbacks (
  feedback_id            BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id                BIGINT UNSIGNED  NOT NULL,
  target_type            ENUM('QUIZ','PRACTICE') NOT NULL COMMENT '피드백 대상 종류',
  quiz_attempt_id        BIGINT UNSIGNED  NULL     COMMENT 'target_type=QUIZ일 때만 값',
  practice_submission_id BIGINT UNSIGNED  NULL     COMMENT 'target_type=PRACTICE일 때만 값',
  source                 ENUM('PRECOMPUTED','GENERATED') NOT NULL COMMENT '미리 저장된 보기별 피드백 / 실시간 생성',
  status                 ENUM('PENDING','DONE','FAILED') NOT NULL DEFAULT 'PENDING' COMMENT '처리 상태',
  feedback_json          JSON             NULL     COMMENT '{cause, concept, hint, rewatch_sec}',
  model_name             VARCHAR(50)      NULL     COMMENT '사용한 AI 모델',
  prompt_version         VARCHAR(20)      NULL     COMMENT '사용한 프롬프트 버전',
  retry_count            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error_message          VARCHAR(500)     NULL     COMMENT '실패 사유',
  created_at             DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at           DATETIME         NULL,
  PRIMARY KEY (feedback_id),
  UNIQUE KEY uk_ai_feedbacks_quiz_attempt (quiz_attempt_id),
  UNIQUE KEY uk_ai_feedbacks_practice_submission (practice_submission_id),
  KEY idx_ai_feedbacks_user_created (user_id, created_at),
  KEY idx_ai_feedbacks_status (status),
  CONSTRAINT fk_ai_feedbacks_user     FOREIGN KEY (user_id)                REFERENCES users (user_id),
  CONSTRAINT fk_ai_feedbacks_quiz     FOREIGN KEY (quiz_attempt_id)        REFERENCES quiz_attempts (attempt_id),
  CONSTRAINT fk_ai_feedbacks_practice FOREIGN KEY (practice_submission_id) REFERENCES practice_submissions (submission_id)
) ENGINE=InnoDB COMMENT='AI 피드백 (회원별 기록)';

CREATE TABLE user_skills (
  user_id      BIGINT UNSIGNED NOT NULL,
  skill_id     INT UNSIGNED    NOT NULL,
  score        DECIMAL(5,2)    NOT NULL DEFAULT 0  COMMENT '스킬 성취도 0~100 (행이 없으면 미평가)',
  calc_version VARCHAR(20)     NOT NULL            COMMENT '산정 기준 버전 (예: v1)',
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, skill_id),
  KEY idx_user_skills_skill (skill_id),
  CONSTRAINT fk_user_skills_user  FOREIGN KEY (user_id)  REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_skills_skill FOREIGN KEY (skill_id) REFERENCES skills (skill_id) ON DELETE CASCADE,
  CONSTRAINT ck_user_skills_score CHECK (score BETWEEN 0 AND 100)
) ENGINE=InnoDB COMMENT='회원별 스킬 성취도 (UserSkill)';

CREATE TABLE admin_logs (
  log_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id    BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(50)     NOT NULL             COMMENT '예: CONTENT_PUBLISH, USER_SUSPEND, ROLE_CHANGE',
  target_type VARCHAR(30)     NOT NULL             COMMENT '예: CONTENT, COURSE, USER',
  target_id   BIGINT UNSIGNED NOT NULL,
  detail      JSON            NULL                 COMMENT '변경 전/후 값',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_admin_logs_target (target_type, target_id),
  KEY idx_admin_logs_admin (admin_id, created_at),
  CONSTRAINT fk_admin_logs_admin FOREIGN KEY (admin_id) REFERENCES users (user_id)
) ENGINE=InnoDB COMMENT='관리자 작업 기록 (공개·권한 변경 추적)';
