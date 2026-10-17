from dataclasses import dataclass
from pathlib import Path

import chromadb

from .chunking import Chunk


@dataclass(frozen=True)
class Hit:
    video_id: str
    start: float
    end: float
    text: str
    score: float


class SubtitleStore:
    def __init__(self, path: Path | None, collection: str):
        # path가 없으면 메모리 DB (테스트용)
        client = chromadb.PersistentClient(path=str(path)) if path else chromadb.EphemeralClient()
        self._collection = client.get_or_create_collection(
            name=collection, metadata={"hnsw:space": "cosine"}
        )

    def replace_video(self, video_id: str, chunks: list[Chunk], embeddings: list[list[float]]) -> int:
        """영상 자막을 통째로 교체한다. 자막이 수정돼 청크 수가 줄어도 이전 청크가 남지 않게."""
        self.delete_video(video_id)
        if not chunks:
            return 0
        self._collection.add(
            ids=[f"{video_id}:{c.index}" for c in chunks],
            embeddings=embeddings,
            documents=[c.text for c in chunks],
            metadatas=[{"video_id": video_id, "start": c.start, "end": c.end} for c in chunks],
        )
        return len(chunks)

    def delete_video(self, video_id: str) -> None:
        self._collection.delete(where={"video_id": video_id})

    def count(self) -> int:
        return self._collection.count()

    def query(self, embedding: list[float], n: int) -> list[Hit]:
        total = self.count()
        if total == 0:
            return []
        result = self._collection.query(
            query_embeddings=[embedding],
            n_results=min(n, total),
            include=["documents", "metadatas", "distances"],
        )
        return [
            Hit(
                video_id=meta["video_id"],
                start=meta["start"],
                end=meta["end"],
                text=doc,
                score=round(1.0 - dist, 4),
            )
            for doc, meta, dist in zip(
                result["documents"][0], result["metadatas"][0], result["distances"][0]
            )
        ]
