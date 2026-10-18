import logging

logger = logging.getLogger(__name__)

PROMPT = """너는 직장인 실무 교육 숏폼 영상의 검색어를 다듬는 도우미다.
사용자 질문을 자막 검색에 쓰기 좋은 짧은 한국어 검색어로 바꿔라.
- 관련 도구·기능 이름(예: 엑셀 SUMIF, 피벗 테이블)이 분명하면 포함한다.
- 질문에 없는 내용을 지어내지 않는다.
- 검색어 한 줄만 출력한다. 설명, 따옴표, 마침표 없이.

질문: {query}
검색어:"""


class GeminiRefiner:
    """질문을 검색어로 다듬는다. 실패하면 None을 돌려 원문으로 검색하게 한다."""

    # Gemini API는 10초보다 짧은 deadline을 거부한다 (400 INVALID_ARGUMENT)
    def __init__(self, api_key: str, model: str, timeout_seconds: float = 10.0):
        from google import genai
        from google.genai import types

        self._model = model
        self._client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000))
        )

    def refine(self, query: str) -> str | None:
        try:
            response = self._client.models.generate_content(
                model=self._model, contents=PROMPT.format(query=query)
            )
            lines = (response.text or "").strip().splitlines()
            return lines[0].strip() if lines and lines[0].strip() else None
        except Exception:
            logger.warning("질문 정제 실패, 원문으로 검색", exc_info=True)
            return None
