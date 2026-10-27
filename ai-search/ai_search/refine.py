import logging
import re
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

logger = logging.getLogger(__name__)

PROMPT = """너는 직장인 실무 교육 숏폼 영상의 검색어를 다듬는 도우미다.
사용자 질문을 자막 검색에 쓰기 좋은 짧은 한국어 검색어로 바꿔라.
- 질문에 있는 대상과 조건(부서, 기간, 개수, 오류 이름 등)은 하나도 빠뜨리지 않는다.
- 도구·기능 이름(예: 엑셀 피벗 테이블)은 질문만 보고 확실할 때만 넣는다. 조건이 몇 개인지처럼 애매하면 넣지 않는다.
- 질문에 없는 내용을 지어내지 않는다.
- 검색어 한 줄만 출력한다. 설명, 따옴표, 마침표 없이.

질문: {query}
검색어:"""

# 검색어로 보기 어려운 응답(설명을 붙였거나 너무 긴 것)은 버리고 원문으로 검색한다
MAX_REFINED_CHARS = 60
_PREFIX = re.compile(r"^\s*(검색어|키워드)\s*[:：]\s*")
# 무료 등급 한도(분당 요청 수)에 걸렸는데 다시 시도까지 시간을 못 읽었을 때 쉬는 시간
DEFAULT_COOLDOWN_SECONDS = 30.0


def clean_refined(text: str | None, query: str) -> str | None:
    """정제 결과가 검색어로 쓸 만한지 확인한다. 아니면 None."""
    if not text:
        return None
    lines = [line for line in text.strip().splitlines() if line.strip()]
    if len(lines) != 1:
        return None
    # "검색어". 처럼 따옴표와 마침표가 섞여 붙어 오므로 둘 다 지운다
    refined = _PREFIX.sub("", lines[0]).strip().strip("\"'“”‘’`.。 ").strip()
    if not refined or len(refined) > MAX_REFINED_CHARS or not re.search(r"[\w가-힣]", refined):
        return None
    return None if refined == query.strip() else refined


def _retry_seconds(exc: Exception) -> float | None:
    """429 응답에 들어 있는 retryDelay(예: '29s')를 읽는다."""
    match = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s", str(exc))
    return float(match.group(1)) if match else None


class GeminiRefiner:
    """질문을 검색어로 다듬는다. 실패하면 None을 돌려 원문으로 검색하게 한다.

    - wait_seconds 안에 답이 없으면 기다리지 않는다 (호출은 뒤에서 끝까지 진행되고 버려진다)
    - 같은 질문은 성공한 정제 결과를 기억해 다시 호출하지 않는다
    - 무료 등급 한도(429)에 걸리면 다시 시도할 수 있을 때까지 호출하지 않는다
    """

    # Gemini API는 10초보다 짧은 deadline을 거부한다 (400 INVALID_ARGUMENT). 그래서 기다리는 시간은 따로 둔다
    def __init__(self, api_key: str, model: str, wait_seconds: float = 3.0, cache_size: int = 256,
                 timeout_seconds: float = 10.0):
        from google import genai
        from google.genai import types

        self._model = model
        self._client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000))
        )
        self._wait_seconds = wait_seconds
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._cache_size = cache_size
        self._blocked_until = 0.0
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="refine")

    def refine(self, query: str) -> str | None:
        key = " ".join(query.split())
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            if time.monotonic() < self._blocked_until:
                return None

        future = self._pool.submit(self._call, query)
        try:
            refined = future.result(timeout=self._wait_seconds)
        except FutureTimeout:
            logger.warning("질문 정제가 %.1f초 안에 끝나지 않아 원문으로 검색", self._wait_seconds)
            return None
        except Exception as exc:
            if getattr(exc, "code", None) == 429:
                cooldown = _retry_seconds(exc) or DEFAULT_COOLDOWN_SECONDS
                with self._lock:
                    self._blocked_until = time.monotonic() + cooldown
                logger.warning("Gemini 사용량 한도 초과, %.0f초 동안 정제 없이 검색", cooldown)
            else:
                logger.warning("질문 정제 실패, 원문으로 검색", exc_info=True)
            return None

        refined = clean_refined(refined, query)
        if refined:
            with self._lock:
                self._cache[key] = refined
                if len(self._cache) > self._cache_size:
                    self._cache.popitem(last=False)
        return refined

    def _call(self, query: str) -> str:
        response = self._client.models.generate_content(model=self._model, contents=PROMPT.format(query=query))
        return response.text or ""
