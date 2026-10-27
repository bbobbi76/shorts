import os
from dataclasses import dataclass
from pathlib import Path

SEARCH_ROOT = Path(__file__).resolve().parent.parent

# 모드마다 점수 분포가 달라서 기본 컷오프도 다르게 둔다.
# gemini 0.67: 평가 질문에서 관련 질문 1위 최저 0.69, 관련 영상이 없는 질문 최고 0.65 사이
DEFAULT_MIN_SCORE = {"mock": 0.1, "gemini": 0.67}
# 1위 영상보다 이만큼 이상 낮은 영상은 보여주지 않는다. mock은 점수 폭이 달라 끈다
DEFAULT_RELATIVE_MARGIN = {"mock": None, "gemini": 0.08}
# 정제 검색어와 원문 질문의 유사도가 이보다 낮으면 질문을 지어낸 것으로 보고 정제 검색어를 버린다.
# 평가에서 정상 정제의 유사도는 최저 0.74
DEFAULT_REFINE_MIN_SIMILARITY = 0.7
# 질문 정제를 이 시간(초)까지만 기다리고 넘으면 원문으로 검색한다
DEFAULT_REFINE_WAIT_SECONDS = 3.0


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
    refine_min_similarity: float
    relative_margin: float | None
    refine_wait_seconds: float

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
    refine_min_similarity = os.getenv("REFINE_MIN_SIMILARITY", "").strip()
    relative_margin = os.getenv("RELATIVE_MARGIN", "").strip()
    refine_wait = os.getenv("GEMINI_REFINE_WAIT", "").strip()
    return Settings(
        provider=provider,
        gemini_api_key=api_key,
        gemini_embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
        gemini_refine_model=os.getenv("GEMINI_REFINE_MODEL", "gemini-flash-lite-latest"),
        gemini_refine=os.getenv("GEMINI_REFINE", "true").lower() == "true",
        chroma_path=chroma_path,
        min_score=float(min_score) if min_score else DEFAULT_MIN_SCORE[provider],
        refine_min_similarity=(
            float(refine_min_similarity) if refine_min_similarity else DEFAULT_REFINE_MIN_SIMILARITY
        ),
        # "off"로 두면 끈다
        relative_margin=(
            None if relative_margin.lower() == "off"
            else float(relative_margin) if relative_margin else DEFAULT_RELATIVE_MARGIN[provider]
        ),
        refine_wait_seconds=float(refine_wait) if refine_wait else DEFAULT_REFINE_WAIT_SECONDS,
    )
