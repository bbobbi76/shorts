from dataclasses import dataclass


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class Chunk:
    index: int
    start: float
    end: float
    text: str


def chunk_segments(segments: list[Segment], window: int = 3, stride: int = 2) -> list[Chunk]:
    """자막 한 줄은 너무 짧아 의미가 약하므로 연속된 줄을 묶는다.

    window=3, stride=2면 한 줄씩 겹치게 묶여서 문장이 경계에서 잘려도 한쪽 청크에는 온전히 들어간다.
    """
    ordered = sorted((s for s in segments if s.text.strip()), key=lambda s: s.start)
    if not ordered:
        return []

    groups = [ordered[i : i + window] for i in range(0, max(len(ordered) - window, 0) + 1, stride)]
    # stride 때문에 마지막 줄이 빠졌으면 끝부분을 한 묶음 더 만든다
    if groups[-1][-1] is not ordered[-1]:
        groups.append(ordered[-window:])

    return [
        Chunk(
            index=index,
            start=group[0].start,
            end=group[-1].end,
            text=" ".join(s.text.strip() for s in group),
        )
        for index, group in enumerate(groups)
    ]
