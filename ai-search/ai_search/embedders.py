import hashlib
import math
import re
from typing import Literal, Protocol

Purpose = Literal["query", "document"]


class Embedder(Protocol):
    def embed(self, texts: list[str], purpose: Purpose) -> list[list[float]]: ...


class EmbeddingError(RuntimeError):
    pass


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vector))
    return [x / norm for x in vector] if norm else vector


class MockEmbedder:
    """키·네트워크 없이 쓰는 개발용 임베더.

    단어와 글자 2-gram을 해시해 벡터를 만든다. 의미는 모르고 겹치는 글자로만 비슷함을 판단하지만,
    "부서별 매출 합계"처럼 자막과 겹치는 단어가 있는 질문은 그럴듯한 결과가 나온다.
    """

    def __init__(self, dimensions: int = 2048):
        self._dimensions = dimensions

    def embed(self, texts: list[str], purpose: Purpose) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self._dimensions
        for word in re.findall(r"\w+", text.lower()):
            features = [word] + [word[i : i + 2] for i in range(len(word) - 1)]
            for feature in features:
                digest = hashlib.md5(feature.encode("utf-8")).digest()
                vector[int.from_bytes(digest[:4], "little") % self._dimensions] += 1.0
        return _normalize(vector)


class GeminiEmbedder:
    BATCH_SIZE = 100

    def __init__(self, api_key: str, model: str, dimensions: int = 768, timeout_seconds: float = 10.0):
        from google import genai
        from google.genai import types

        self._types = types
        self._client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000))
        )
        self._model = model
        self._dimensions = dimensions

    def embed(self, texts: list[str], purpose: Purpose) -> list[list[float]]:
        task_type = "RETRIEVAL_QUERY" if purpose == "query" else "RETRIEVAL_DOCUMENT"
        config = self._types.EmbedContentConfig(
            task_type=task_type, output_dimensionality=self._dimensions
        )
        vectors: list[list[float]] = []
        try:
            for i in range(0, len(texts), self.BATCH_SIZE):
                response = self._client.models.embed_content(
                    model=self._model, contents=texts[i : i + self.BATCH_SIZE], config=config
                )
                vectors.extend(e.values for e in response.embeddings)
        except Exception as exc:
            raise EmbeddingError(f"Gemini 임베딩 실패: {exc}") from exc
        # 차원을 줄이면 정규화가 풀려서 돌아오므로 직접 정규화
        return [_normalize(list(v)) for v in vectors]
