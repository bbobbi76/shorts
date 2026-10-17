import os
from dataclasses import dataclass
from pathlib import Path

SEARCH_ROOT = Path(__file__).resolve().parent.parent

# 모드마다 점수 분포가 달라서 기본 컷오프도 다르게 둔다
DEFAULT_MIN_SCORE = {"mock": 0.1, "gemini": 0.55}


def _load_dotenv() -> None:
    env_file = SEARCH_ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


@dataclass(frozen=True)
class Settings:
    provider: str
    gemini_api_key: str
    gemini_embedding_model: str
    gemini_refine_model: str
    gemini_refine: bool
    chroma_path: Path
    min_score: float

    @property
    def collection(self) -> str:
        # 모드마다 벡터 크기가 달라서 컬렉션을 나눈다. 모델을 바꾸면 다시 인덱싱해야 하므로 이름에 포함
        model = self.gemini_embedding_model if self.provider == "gemini" else "hash"
        return f"subtitles_{self.provider}_{model}".replace(".", "-")


def load_settings() -> Settings:
    _load_dotenv()
    provider = os.getenv("SEARCH_PROVIDER", "mock").strip().lower()
    if provider not in DEFAULT_MIN_SCORE:
        raise ValueError(f"SEARCH_PROVIDER는 mock 또는 gemini: {provider!r}")

    api_key = os.getenv("GEMINI_API_KEY", "")
    if provider == "gemini" and not api_key:
        raise ValueError("SEARCH_PROVIDER=gemini 인데 GEMINI_API_KEY가 비어 있음")

    chroma_path = Path(os.getenv("CHROMA_PATH", "./chroma_data"))
    if not chroma_path.is_absolute():
        chroma_path = SEARCH_ROOT / chroma_path

    min_score = os.getenv("MIN_SCORE", "").strip()
    return Settings(
        provider=provider,
        gemini_api_key=api_key,
        gemini_embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
        gemini_refine_model=os.getenv("GEMINI_REFINE_MODEL", "gemini-flash-latest"),
        gemini_refine=os.getenv("GEMINI_REFINE", "true").lower() == "true",
        chroma_path=chroma_path,
        min_score=float(min_score) if min_score else DEFAULT_MIN_SCORE[provider],
    )
