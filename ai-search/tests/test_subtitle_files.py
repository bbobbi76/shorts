import json

import pytest

from ai_search import Segment
from ai_search.config import SEARCH_ROOT
from ai_search.subtitle_files import load_catalog, parse_smi, parse_srt, read_subtitle_file

SRT = (
    "1\r\n00:00:01,500 --> 00:00:04,000\r\n첫 줄\r\n\r\n"
    "2\r\n00:00:04,000 --> 00:01:02,250\r\n두 줄로\r\n<i>나뉜</i> 자막\r\n\r\n"
    "3\r\n00:01:02,250 --> 00:01:05,000\r\n\r\n"
)

VTT = """WEBVTT

NOTE 설명 블록은 무시

00:01.000 --> 00:03.500 align:start
시간 없는 표기

intro
01:00:00.000 --> 01:00:02.000
한 시간 뒤
"""

SMI_ONE_SYNC = """<SAMI><BODY>
<SYNC Start=1000><P Class=ENCC>Hello<P Class=KRCC>안녕<br>하세요
<SYNC Start=3000><P Class=ENCC>&nbsp;<P Class=KRCC>&nbsp;
<SYNC Start=5000><P Class=KRCC>마지막 &amp; 끝
</BODY></SAMI>"""

SMI_SPLIT_SYNC = """<SAMI><BODY>
<SYNC Start=0><P Class=KRCC>첫 자막
<SYNC Start=0><P Class=ENCC>first
<SYNC Start=2500><P Class=KRCC>둘째 자막
<SYNC Start=2500><P Class=ENCC>second
<SYNC Start=4000><P Class=KRCC>&nbsp;
</BODY></SAMI>"""


def test_srt_times_multiline_and_tags():
    expected = [Segment(1.5, 4.0, "첫 줄"), Segment(4.0, 62.25, "두 줄로 나뉜 자막")]
    assert parse_srt(SRT) == expected
    assert parse_srt(SRT.replace("\r\n", "\r\r\n")) == expected  # 깨진 줄바꿈


def test_vtt_header_notes_and_short_times():
    assert parse_srt(VTT) == [Segment(1.0, 3.5, "시간 없는 표기"), Segment(3600.0, 3602.0, "한 시간 뒤")]


def test_smi_picks_korean_class_and_clears_on_nbsp():
    assert parse_smi(SMI_ONE_SYNC) == [
        Segment(1.0, 3.0, "안녕 하세요"),
        Segment(5.0, 8.0, "마지막 & 끝"),  # 마지막 줄은 끝 시간이 없어 3초로 둔다
    ]


def test_smi_merges_syncs_split_by_language():
    assert parse_smi(SMI_SPLIT_SYNC) == [Segment(0.0, 2.5, "첫 자막"), Segment(2.5, 4.0, "둘째 자막")]


def test_smi_without_class():
    assert parse_smi("<SYNC Start=0>그냥 글자<SYNC Start=2000>&nbsp;") == [Segment(0.0, 2.0, "그냥 글자")]


def test_read_file_by_extension_and_cp949(tmp_path):
    smi = tmp_path / "old.SMI"
    smi.write_bytes(SMI_SPLIT_SYNC.encode("cp949"))
    assert read_subtitle_file(smi)[0].text == "첫 자막"

    srt = tmp_path / "a.srt"
    srt.write_text(SRT, encoding="utf-8-sig", newline="")  # BOM이 있어도 첫 줄을 읽는다
    assert len(read_subtitle_file(srt)) == 2

    with pytest.raises(ValueError, match="지원하지 않는"):
        read_subtitle_file(tmp_path / "a.txt")


def test_catalog_mixes_inline_segments_and_files(tmp_path):
    (tmp_path / "subs").mkdir()
    (tmp_path / "subs" / "b.srt").write_text(SRT, encoding="utf-8", newline="")
    catalog = tmp_path / "list.json"
    catalog.write_text(json.dumps([
        {"video_id": "a", "title": "직접", "segments": [{"start": 0, "end": 1, "text": "x"}]},
        {"video_id": "b", "title": "파일", "subtitle_file": "subs/b.srt"},
    ]), encoding="utf-8")
    videos = load_catalog(catalog)
    assert [(v.video_id, len(v.segments)) for v in videos] == [("a", 1), ("b", 2)]


def test_sample_catalog_loads_every_video():
    videos = load_catalog(SEARCH_ROOT / "data" / "subtitles.json")
    assert len(videos) == len({v.video_id for v in videos})
    assert all(v.title and v.segments for v in videos)
