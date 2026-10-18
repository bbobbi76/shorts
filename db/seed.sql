-- =====================================================================
-- WorkFit 초기 데이터 (schema.sql 실행 후 실행)
-- 등급 이름·점수, 관리자 비밀번호는 예시입니다. 팀에서 확정 후 바꾸세요.
-- =====================================================================
USE workfit;

-- 등급 (users.tier_code 기본값 BRONZE이 있어야 회원가입 가능)
INSERT INTO tiers (tier_code, name, min_score, sort_order) VALUES
  ('BRONZE',    '브론즈',     0,    1),
  ('SILVER',    '실버',       300,  2),
  ('GOLD',      '골드',       800,  3),
  ('DIAMOND',   '다이아몬드', 1500, 4);

-- 관리자 계정 (password_hash는 실제 BCrypt 해시로 교체)
INSERT INTO users (email, password_hash, name, role) VALUES
  ('admin@workfit.dev', '$2a$10$REPLACE_WITH_REAL_BCRYPT_HASH', '운영자', 'ADMIN');
SET @admin = LAST_INSERT_ID();

-- 분야
INSERT INTO categories (name, category_type, sort_order) VALUES
  ('기획', 'JOB', 1), ('마케팅', 'JOB', 2), ('인사', 'JOB', 3),
  ('엑셀', 'COMMON', 4), ('문서 작성', 'COMMON', 5), ('AI 업무 활용', 'COMMON', 6);
SET @excel = (SELECT category_id FROM categories WHERE name = '엑셀' AND category_type = 'COMMON');

-- 엑셀 스킬 (마이스펙 레이더 차트 축)
INSERT INTO skills (category_id, name, description, sort_order) VALUES
  (@excel, '기본 조작', '서식, 정렬, 필터, 단축키', 1),
  (@excel, '함수 활용', 'SUM, IF, SUMIF, VLOOKUP 등', 2),
  (@excel, '데이터 집계', '조건별 합계, 피벗 테이블', 3);
SET @skill_func = (SELECT skill_id FROM skills WHERE category_id = @excel AND name = '함수 활용');

-- 과정
INSERT INTO courses (category_id, title, summary, learning_goal, level, status, created_by, published_at) VALUES
  (@excel, '신입 직장인을 위한 엑셀 기초', '업무에 바로 쓰는 엑셀 함수를 1~3분 숏폼으로 배웁니다.',
   '부서별 매출 합계 같은 기본 집계를 직접 할 수 있다', 'BASIC', 'PUBLISHED', @admin, NOW());
SET @course = LAST_INSERT_ID();

-- 영상 파일 (실제 업로드 전에는 경로만 예시)
INSERT INTO files (file_type, original_name, stored_path, mime_type, size_bytes, uploaded_by) VALUES
  ('VIDEO', 'sumif_basic.mp4', 'videos/sample/sumif_basic.mp4', 'video/mp4', 10485760, @admin);
SET @video = LAST_INSERT_ID();

-- 콘텐츠: SUMIF
INSERT INTO contents (course_id, title, learning_goal, work_use, video_file_id, duration_sec, aspect_ratio,
                      sort_order, status, created_by, published_at) VALUES
  (@course, 'SUMIF 함수로 조건별 합계 구하기', '조건에 맞는 데이터의 합계를 구할 수 있다',
   '부서별 매출 합계 계산', @video, 150, '9:16', 2, 'PUBLISHED', @admin, NOW());
SET @content = LAST_INSERT_ID();
INSERT INTO content_skills (content_id, skill_id) VALUES (@content, @skill_func);

-- 자막 (영상 속 구간 검색)
INSERT INTO subtitles (content_id, start_sec, end_sec, caption_text) VALUES
  (@content, 0.00,  12.00, '부서별로 매출을 더하고 싶을 때 SUMIF를 씁니다'),
  (@content, 80.00, 105.00, '조건 값은 표에 적힌 값과 똑같이 입력해야 합니다');

-- 퀴즈 + 보기별 피드백
INSERT INTO quizzes (content_id, question, explanation) VALUES
  (@content, '특정 부서의 매출만 합산할 때 가장 알맞은 함수는?',
   'SUMIF는 조건에 맞는 셀의 값만 더합니다. 형식: =SUMIF(조건 범위, 조건, 합계 범위)');
SET @quiz = LAST_INSERT_ID();
INSERT INTO quiz_options (quiz_id, option_no, option_text, is_correct, feedback, feedback_source, rewatch_sec) VALUES
  (@quiz, 1, 'SUM',     FALSE, 'SUM은 범위 전체를 더해요. 특정 부서만 더하려면 조건을 줄 수 있는 함수가 필요해요.', 'ADMIN', 20),
  (@quiz, 2, 'SUMIF',   TRUE,  '정답이에요. 조건 범위, 조건, 합계 범위 순서를 기억해 두세요.', 'ADMIN', NULL),
  (@quiz, 3, 'COUNTIF', FALSE, 'COUNTIF는 조건에 맞는 셀의 개수를 셉니다. 합계가 필요하면 SUMIF를 써요.', 'ADMIN', 20),
  (@quiz, 4, 'AVERAGE', FALSE, 'AVERAGE는 평균을 구해요. 이번 업무는 합계라서 SUMIF가 알맞아요.', 'ADMIN', 20);

-- 선택 실습
INSERT INTO files (file_type, original_name, stored_path, mime_type, size_bytes, uploaded_by) VALUES
  ('PRACTICE', '부서별_매출_예제.xlsx', 'practice/sample/sales_by_dept.xlsx',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 20480, @admin);
SET @practice_file = LAST_INSERT_ID();
INSERT INTO practices (content_id, title, instruction, example_file_id, expected_result, result_type,
                       tolerance, required_function, answer_formula) VALUES
  (@content, '영업부 매출 합계 구하기', '예제 매출표에서 영업부의 매출 합계를 구하고, 사용한 수식과 결과를 입력하세요.',
   @practice_file, '4520000', 'NUMBER', 0, 'SUMIF', '=SUMIF(B2:B20,"영업부",C2:C20)');

-- 실무자료
INSERT INTO files (file_type, original_name, stored_path, mime_type, size_bytes, uploaded_by) VALUES
  ('RESOURCE', '매출_집계_템플릿.xlsx', 'resources/sample/sales_template.xlsx',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 15360, @admin);
SET @resource_file = LAST_INSERT_ID();
INSERT INTO resources (title, resource_type, description, file_id, category_id, status, created_by) VALUES
  ('매출 집계 템플릿', 'TEMPLATE', '부서별·월별 매출을 SUMIF로 집계하는 양식', @resource_file, @excel, 'PUBLISHED', @admin);
INSERT INTO content_resources (content_id, resource_id) VALUES (@content, LAST_INSERT_ID());

-- 검색 태그 + 동의어
INSERT INTO tags (name, tag_type) VALUES
  ('조건별 합계', 'SITUATION'), ('SUMIF', 'FUNCTION'), ('#VALUE!', 'ERROR');
INSERT INTO tag_synonyms (tag_id, synonym)
  SELECT tag_id, s.synonym FROM tags
  JOIN (SELECT '부서별 합계' AS synonym UNION ALL SELECT '조건에 맞는 값만 더하기'
        UNION ALL SELECT '항목별 합계') s
  WHERE tags.name = '조건별 합계';
INSERT INTO content_tags (content_id, tag_id)
  SELECT @content, tag_id FROM tags WHERE name IN ('조건별 합계', 'SUMIF');
