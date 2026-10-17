"""파일 업로드 저장과 제공.

- 업로드: UPLOAD_DIR/<종류>/<UUID>.<확장자>로 저장하고 files 테이블에 기록합니다.
- 제공: /files/<경로>로 내려주며, 영상 재생 위치 이동(탐색)을 위해 HTTP Range 요청을 직접 처리합니다.
"""
import mimetypes
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from .auth import require_admin
from .config import UPLOAD_DIR
from .database import get_db
from .errors import ApiError
from .models import StoredFile
from .schemas import FileOut

ALLOWED: dict[str, set[str]] = {
    "VIDEO": {"mp4"},
    "THUMBNAIL": {"jpg", "jpeg", "png", "webp"},
    "PRACTICE": {"xlsx", "xls", "csv", "pdf", "docx", "txt"},
    "RESOURCE": {"xlsx", "xls", "csv", "docx", "pptx", "pdf", "txt", "hwp"},
    "SUBTITLE": {"vtt", "srt"},
}
MAX_VIDEO_BYTES = 200 * 1024 * 1024
MAX_OTHER_BYTES = 20 * 1024 * 1024
CHUNK = 1024 * 1024

admin_router = APIRouter(prefix="/api/admin/files", tags=["파일"])
public_router = APIRouter(tags=["파일 제공"])


def require_file(db: Session, file_id: int | None, expected: str) -> StoredFile | None:
    """다른 테이블에서 파일 번호로 참조할 때 종류가 맞는지 확인합니다."""
    if file_id is None:
        return None
    f = db.get(StoredFile, file_id)
    if f is None:
        raise ApiError.not_found("파일")
    if f.file_type != expected:
        raise ApiError.bad_request(f"파일 종류가 맞지 않습니다. ({expected} 필요)")
    return f


@admin_router.post("", response_model=FileOut, status_code=201)
def upload(
    file: UploadFile = File(...),
    type: str = Form(...),
    admin_id: int = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if type not in ALLOWED:
        raise ApiError.bad_request(f"알 수 없는 파일 종류입니다: {type}")
    original = Path(file.filename or "file").name
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED[type]:
        raise ApiError.bad_request(f"{type} 파일은 {sorted(ALLOWED[type])} 형식만 올릴 수 있습니다.")
    limit = MAX_VIDEO_BYTES if type == "VIDEO" else MAX_OTHER_BYTES

    # 저장 파일명은 UUID로 만들어 이름 충돌과 경로 조작을 막습니다.
    relative = f"{type.lower()}/{uuid.uuid4()}.{ext}"
    target = (UPLOAD_DIR / relative).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with open(target, "wb") as out:
            while chunk := file.file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise ApiError.bad_request(f"파일 크기가 제한({limit // 1024 // 1024}MB)을 넘습니다.")
                out.write(chunk)
    except ApiError:
        target.unlink(missing_ok=True)
        raise
    if size == 0:
        target.unlink(missing_ok=True)
        raise ApiError.bad_request("빈 파일은 올릴 수 없습니다.")

    mime = file.content_type or mimetypes.guess_type(original)[0] or "application/octet-stream"
    stored = StoredFile(file_type=type, original_name=original, stored_path=relative, mime_type=mime,
                        size_bytes=size, uploaded_by=admin_id)
    db.add(stored)
    db.commit()
    return FileOut.of(stored)


_RANGE = re.compile(r"bytes=(\d*)-(\d*)")


@public_router.get("/files/{path:path}")
def serve(path: str, request: Request):
    target = (UPLOAD_DIR / path).resolve()
    if not target.is_relative_to(UPLOAD_DIR) or not target.is_file():
        raise ApiError.not_found("파일")
    size = target.stat().st_size
    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"

    range_header = request.headers.get("range")
    match = _RANGE.fullmatch(range_header.strip()) if range_header else None
    if not match:
        return FileResponse(target, media_type=media_type, headers={"Accept-Ranges": "bytes"})

    start_s, end_s = match.groups()
    if start_s == "":  # bytes=-500 : 마지막 500바이트
        length = int(end_s or 0)
        start, end = max(size - length, 0), size - 1
    else:
        start = int(start_s)
        end = min(int(end_s), size - 1) if end_s else size - 1
    if start >= size or start > end:
        return StreamingResponse(iter(()), status_code=416, headers={"Content-Range": f"bytes */{size}"})

    def body():
        with open(target, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = f.read(min(CHUNK, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(body(), status_code=206, media_type=media_type, headers=headers)


def ensure_upload_dir() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
