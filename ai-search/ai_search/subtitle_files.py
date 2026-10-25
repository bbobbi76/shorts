"""자막 파일(SRT, VTT, SMI)을 Segment 목록으로 바꾼다.

관리자가 올린 자막 파일을 그대로 인덱싱할 수 있게 하려는 것. 시간은 모두 초 단위.
"""

import html
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .chunking import Segment

SUPPORTED = {".srt", ".vtt", ".smi"}
# SMI는 끝 시간이 없어서 마지막 줄만 이 길이로 둔다
LAST_CUE_SECONDS = 3.0

_TIME = r"(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})"
_CUE_TIME = re.compile(_TIME + r"\s*-->\s*" + _TIME)
_TAG = re.compile(r"<[^>]+>")
_SYNC = re.compile(r"<sync\s[^>]*?start\s*=\s*[\"']?(\d+)[^>]*>", re.I)
_P_CLASS = re.compile(r"<p\b[^>]*?class\s*=\s*[\"']?([\w-]+)[^>]*>", re.I)
_BR = re.compile(r"<br\s*/?>", re.I)


def _seconds(hours: str | None, minutes: str, seconds: str, millis: str) -> float:
    return int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds) + int(millis.ljust(3, "0")) / 1000


def _clean(text: str) -> str:
    # 줄바꿈(<br>)은 띄어쓰기로, <i> 같은 꾸밈 태그는 글자 사이에 끼어 있으므로 그냥 지운다
    return " ".join(html.unescape(_TAG.sub("", _BR.sub(" ", text))).split())


def parse_srt(text: str) -> list[Segment]:
    """SRT와 VTT 공용. 번호 줄, VTT 헤더·NOTE, 큐 설정(align 등)은 무시한다."""
    segments = []
    # 편집기를 거치며 \r\r\n처럼 깨진 줄바꿈도 한 줄로 본다
    text = re.sub(r"\r+\n", "\n", text).replace("\r", "\n")
    for block in re.split(r"\n\s*\n", text):
        lines = block.strip().split("\n")
        for i, line in enumerate(lines):
            match = _CUE_TIME.search(line)
            if match:
                caption = _clean(" ".join(lines[i + 1 :]))
                if caption:
                    segments.append(Segment(_seconds(*match.groups()[:4]), _seconds(*match.groups()[4:]), caption))
                break
    return segments


def parse_smi(text: str) -> list[Segment]:
    """SAMI. 각 SYNC의 시작 시간이 앞 줄의 끝 시간이 되고, &nbsp;만 있는 SYNC는 자막을 지우는 표시다.

    언어별 클래스가 여러 개면 KR이 들어간 클래스(KRCC 등)를 쓰고, 없으면 처음 나온 클래스를 쓴다.
    """
    syncs = list(_SYNC.finditer(text))
    # 언어마다 같은 시간의 SYNC를 따로 쓰는 파일이 많아서 시작 시간별로 합친다
    merged: dict[int, dict[str, str]] = {}
    for i, sync in enumerate(syncs):
        body = text[sync.end() : syncs[i + 1].start() if i + 1 < len(syncs) else len(text)]
        body = re.split(r"</body>", body, flags=re.I)[0]
        parts = _P_CLASS.split(body)
        # split 결과: [P 앞 내용, 클래스1, 내용1, 클래스2, 내용2, ...]
        by_class = {parts[j].lower(): _clean(parts[j + 1]) for j in range(1, len(parts) - 1, 2)}
        merged.setdefault(int(sync.group(1)), {}).update(by_class or {"": _clean(body)})
    cues = [(start / 1000, by_class) for start, by_class in sorted(merged.items())]

    classes = [c for _, by_class in cues for c in by_class]
    lang = next((c for c in classes if "kr" in c), classes[0] if classes else "")

    segments = []
    for i, (start, by_class) in enumerate(cues):
        caption = by_class.get(lang, "")
        if not caption:
            continue
        end = cues[i + 1][0] if i + 1 < len(cues) else start + LAST_CUE_SECONDS
        segments.append(Segment(start, end, caption))
    return segments


def read_subtitle_file(path: Path) -> list[Segment]:
    """확장자로 형식을 고른다. UTF-8이 아니면 한글 자막에 흔한 CP949로 읽는다."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED:
        raise ValueError(f"지원하지 않는 자막 형식: {suffix} (지원: {', '.join(sorted(SUPPORTED))})")
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp949")
    return parse_smi(text) if suffix == ".smi" else parse_srt(text)


@dataclass(frozen=True)
class VideoSubtitles:
    video_id: str
    title: str
    segments: list[Segment]


def load_catalog(path: Path) -> list[VideoSubtitles]:
    """자막 목록 JSON을 읽는다. 영상마다 segments를 직접 쓰거나, subtitle_file로 자막 파일을 가리킨다(JSON 기준 상대 경로)."""
    path = Path(path)
    videos = []
    for video in json.loads(path.read_text(encoding="utf-8")):
        if "subtitle_file" in video:
            segments = read_subtitle_file(path.parent / video["subtitle_file"])
        else:
            segments = [Segment(s["start"], s["end"], s["text"]) for s in video["segments"]]
        videos.append(VideoSubtitles(video["video_id"], video.get("title", ""), segments))
    return videos
