"""빈 전용 MySQL DB만 초기화합니다. 기존 DB의 테이블을 삭제하지 않습니다.

--demo를 붙이면 새로 만든 DB에 시연 데이터(demo_data/)도 넣습니다: python init_db.py --demo
"""
import re
import shutil
import sys
from pathlib import Path

import pymysql
from pymysql.constants import CLIENT

from app.config import DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, UPLOAD_DIR
from app.database import engine
from app.ui_api import UiRecord


DEMO_DIR = Path(__file__).resolve().parent.parent / "demo_data"


def load_demo():
    """시연 데이터 SQL을 넣고 SQL이 가리키는 영상·썸네일·실습 파일을 업로드 폴더로 복사합니다."""
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD, database=DB_NAME,
                           charset="utf8mb4", client_flag=CLIENT.MULTI_STATEMENTS, autocommit=True)
    with conn, conn.cursor() as cur:
        cur.execute((DEMO_DIR / "demo_data.sql").read_text(encoding="utf-8-sig"))
        while cur.nextset():
            pass
    shutil.copytree(DEMO_DIR / "uploads", UPLOAD_DIR, dirs_exist_ok=True)
    print("시연 데이터(공개 과정 3개, 콘텐츠 12개)를 넣었습니다.")


def main():
    if not re.fullmatch(r"[a-zA-Z0-9_]+", DB_NAME):
        raise SystemExit("DB_NAME에는 영문, 숫자, 밑줄만 사용할 수 있습니다.")
    dbdir = Path(__file__).resolve().parent.parent / "db"
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
                           charset="utf8mb4", client_flag=CLIENT.MULTI_STATEMENTS, autocommit=True)
    with conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci")
            cur.execute(f"USE `{DB_NAME}`")
            cur.execute("SHOW TABLES")
            tables = {row[0] for row in cur.fetchall()}
            created = not tables
            if tables:
                if not {"users", "courses", "contents", "files", "categories"}.issubset(tables):
                    raise SystemExit("기존 테이블이 있는 다른 DB입니다. 새 DB_NAME을 선택해 주세요.")
                print("기존 테이블을 보존합니다. 화면 연동용 테이블만 확인합니다.")
            else:
                for name in ("schema.sql", "seed.sql"):
                    sql = (dbdir / name).read_text(encoding="utf-8-sig")
                    sql = re.sub(r"CREATE DATABASE IF NOT EXISTS workfit", f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`", sql)
                    sql = sql.replace("USE workfit;", f"USE `{DB_NAME}`;")
                    # 원본 schema.sql의 DROP 문은 실행하지 않습니다.
                    sql = re.sub(r"DROP TABLE IF EXISTS.*?;", "", sql, flags=re.S)
                    cur.execute(sql)
                    while cur.nextset():
                        pass
                # 원본 seed는 실제 영상이 없는 예시 콘텐츠를 공개 상태로 넣습니다.
                cur.execute("UPDATE contents SET status='DRAFT', published_at=NULL")
                cur.execute("UPDATE courses SET status='DRAFT', published_at=NULL")
                print("원본 29개 테이블과 초기 데이터를 생성했습니다. 예시 콘텐츠는 임시저장 상태입니다.")
    UiRecord.__table__.create(engine, checkfirst=True)
    if "--demo" in sys.argv:
        if created:
            load_demo()
        else:
            # 시연 데이터는 새 DB 기준 번호로 들어가므로 기존 DB에는 넣지 않습니다.
            print("기존 DB라서 시연 데이터를 넣지 않았습니다. 새 DB_NAME으로 다시 실행해 주세요.")
    print("MySQL 초기화 완료. 서버를 실행해 주세요.")


if __name__ == "__main__":
    main()
