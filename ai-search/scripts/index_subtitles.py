"""자막을 ChromaDB에 인덱싱한다. .env의 SEARCH_PROVIDER 모드로 인덱싱된다.

사용 (ai-search 폴더에서):
  .venv\\Scripts\\python -m scripts.index_subtitles                      # data/subtitles.json 전체
  .venv\\Scripts\\python -m scripts.index_subtitles 목록.json
  .venv\\Scripts\\python -m scripts.index_subtitles 자막.srt --video-id 11 --title "영상 제목"   # SRT·VTT·SMI 파일 하나
"""

import argparse
import time
from pathlib import Path

from ai_search import get_search_service
from ai_search.config import SEARCH_ROOT, load_settings
from ai_search.subtitle_files import SUPPORTED, VideoSubtitles, load_catalog, read_subtitle_file


def main() -> None:
    parser = argparse.ArgumentParser(description="자막을 검색 인덱스에 넣는다")
    parser.add_argument("source", nargs="?", type=Path, default=SEARCH_ROOT / "data" / "subtitles.json",
                        help="자막 목록 JSON 또는 자막 파일(.srt .vtt .smi)")
    parser.add_argument("--video-id", help="자막 파일 하나를 넣을 때 영상 ID")
    parser.add_argument("--title", default="", help="자막 파일 하나를 넣을 때 영상 제목")
    args = parser.parse_args()

    if args.source.suffix.lower() in SUPPORTED:
        if not args.video_id:
            parser.error("자막 파일을 넣을 때는 --video-id가 필요합니다")
        videos = [VideoSubtitles(args.video_id, args.title, read_subtitle_file(args.source))]
    else:
        videos = load_catalog(args.source)

    settings = load_settings()
    print(f"모드: {settings.provider} / 컬렉션: {settings.collection}")
    service = get_search_service()

    started = time.perf_counter()
    for video in videos:
        chunks = service.index_video(video.video_id, video.segments, video.title)
        print(f"  {video.video_id} {video.title}: 자막 {len(video.segments)}줄, 청크 {chunks}개")
    print(f"완료: 영상 {len(videos)}개, {time.perf_counter() - started:.1f}초 → {settings.chroma_path}")


if __name__ == "__main__":
    main()
