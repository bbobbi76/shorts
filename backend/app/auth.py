"""관리자 로그인과 토큰 확인.

토큰은 서버 메모리에 보관하므로 서버를 재시작하면 다시 로그인해야 합니다.
(실서비스에서는 JWT나 Redis로 바꿉니다)
"""
import secrets
from datetime import datetime

import bcrypt
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import INITIAL_ADMIN_PASSWORD
from .database import get_db
from .errors import ApiError
from .models import User
from .schemas import LoginIn, LoginOut

PLACEHOLDER = "REPLACE_WITH_REAL_BCRYPT_HASH"

_tokens: dict[str, int] = {}

router = APIRouter(prefix="/api/auth", tags=["인증"])


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:  # 해시 형식이 아닌 값(예: seed의 임시 문자열)
        return False


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


def require_admin(authorization: str | None = Header(default=None)) -> int:
    """/api/admin/** 요청마다 실행되는 의존성. 관리자 user_id를 돌려줍니다."""
    token = _bearer(authorization)
    if token is None or token not in _tokens:
        raise ApiError(401, "로그인이 필요합니다.")
    return _tokens[token]


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip()))
    if user is None or not check_password(body.password, user.password_hash):
        raise ApiError(401, "이메일 또는 비밀번호가 맞지 않습니다.")
    if user.role != "ADMIN":
        raise ApiError(403, "관리자 계정만 로그인할 수 있습니다.")
    if user.status != "ACTIVE":
        raise ApiError(403, "이용이 제한된 계정입니다.")
    user.last_login_at = datetime.now()
    db.commit()
    token = secrets.token_urlsafe(32)
    _tokens[token] = user.id
    return LoginOut(token=token, user_id=user.id, name=user.name, role=user.role)


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _bearer(authorization)
    if token:
        _tokens.pop(token, None)
    return {"message": "로그아웃했습니다."}


def init_admin_passwords(db: Session) -> None:
    """seed.sql의 관리자 계정은 비밀번호 자리에 임시 문자열이 있습니다. 서버 시작 시 초기 비밀번호로 바꿉니다."""
    for user in db.scalars(select(User).where(User.password_hash.contains(PLACEHOLDER))):
        user.password_hash = hash_password(INITIAL_ADMIN_PASSWORD)
    db.commit()
