"""음성 트랙 유무와 관계없이 MP4 movie header의 재생 시간을 읽습니다."""
import math
import struct


def duration_seconds(path):
    with open(path, "rb") as stream:
        stream.seek(0, 2)
        file_end = stream.tell()

        def boxes(start, end):
            position = start
            while position + 8 <= end:
                stream.seek(position)
                size, kind = struct.unpack(">I4s", stream.read(8))
                header = 8
                if size == 1:
                    if position + 16 > end:
                        raise ValueError("truncated MP4 box")
                    size = struct.unpack(">Q", stream.read(8))[0]
                    header = 16
                elif size == 0:
                    size = end - position
                if size < header or position + size > end:
                    raise ValueError("invalid MP4 box size")
                yield kind, position + header, position + size
                position += size

        for kind, start, end in boxes(0, file_end):
            if kind != b"moov":
                continue
            for child, payload, limit in boxes(start, end):
                if child != b"mvhd":
                    continue
                stream.seek(payload)
                version = stream.read(1)[0]
                if version not in (0, 1):
                    raise ValueError("unknown movie header version")
                offset = 20 if version == 1 else 12
                width = 12 if version == 1 else 8
                if payload + offset + width > limit:
                    raise ValueError("truncated movie header")
                stream.seek(payload + offset)
                scale, duration = struct.unpack(">IQ" if version == 1 else ">II", stream.read(width))
                value = duration / scale if scale else 0
                if not math.isfinite(value) or value <= 0 or duration == (2**(64 if version else 32)-1):
                    raise ValueError("unknown movie duration")
                return value
    raise ValueError("MP4 movie header not found")
