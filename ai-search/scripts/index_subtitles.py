"""자막 JSON을 ChromaDB에 인덱싱한다. .env의 SEARCH_PROVIDER 모드로 인덱싱된다.

사용 (ai-search 폴더에서): .venv\\Scripts\\python -m scripts.index_subtitles [자막.json]
기본값은 data/subtitles.json
"""

import json
import sys
import time
from pathlib import Path

from ai_search import Segment, get_search_service
from ai_search.config import SEARCH_ROOT, load_settings


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SEARCH_ROOT / "data" / "subtitles.json"
    videos = json.loads(source.read_text(encoding="utf-8"))

    settings = load_settings()
    print(f"모드: {settings.provider} / 컬렉션: {settings.collection}")
    service = get_search_service()

    started = time.perf_counter()
    for video in videos:
        segments = [Segment(s["start"], s["end"], s["text"]) for s in video["segments"]]
        chunks = service.index_video(video["video_id"], segments, video.get("title", ""))
        print(f"  {video['video_id']} {video.get('title', '')}: 청크 {chunks}개")
    print(f"완료: 영상 {len(videos)}개, {time.perf_counter() - started:.1f}초 → {settings.chroma_path}")


if __name__ == "__main__":
    main()
