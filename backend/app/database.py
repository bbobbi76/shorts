"""DB 연결. 테이블은 db/schema.sql로 만들기 때문에 여기서 테이블을 생성하지 않습니다."""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
SessionLocal = sessionmaker(bind=engine, autoflush=True, expire_on_commit=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """요청마다 세션을 하나 열고, 끝나면 닫습니다. (FastAPI 의존성)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
