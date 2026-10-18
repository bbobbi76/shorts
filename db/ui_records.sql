-- init_db.py가 자동 생성하는 프론트 연동 보조 테이블 명세입니다.
-- 원본 29개 테이블을 변경하지 않고 1개를 추가합니다.
CREATE TABLE IF NOT EXISTS ui_records (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  owner_id INT NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  native_id INT NULL,
  payload JSON NOT NULL,
  UNIQUE KEY uq_ui_request(kind, owner_id, request_key)
);
