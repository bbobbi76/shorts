# AI 검색 (`ai_search`)

자연어 질문으로 "어떤 영상의 몇 초부터 보면 되는지"를 찾아주는 검색 모듈입니다.
답변 문장은 만들지 않고 **영상 ID · 구간 시간 · 점수**만 돌려줍니다.

```
질문 ─(gemini 모드) 검색어 정제─▶ 임베딩 ─▶ ChromaDB 유사도 검색 ─▶ 비공개 제외 ─▶ 영상별 묶기 ─▶ 결과
```

| 모드 (`SEARCH_PROVIDER`) | 임베딩 | 질문 정제 | 용도 |
|---|---|---|---|
| `mock` (기본) | 글자 해시 (키·네트워크 없음) | 안 함 | 개발·연동. 응답 형식은 실제와 같음 |
| `gemini` | `gemini-embedding-001` | `gemini-flash-lite-latest` (실패하면 원문으로 검색) | 실제 검색 |

## 실행 (ai-search 폴더에서, Python 3.12)

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env                          # gemini 모드면 GEMINI_API_KEY 입력

.venv\Scripts\python -m scripts.index_subtitles # data/subtitles.json 인덱싱 (모드별로 한 번씩)
.venv\Scripts\python -m uvicorn dev_server:app --port 8001
.venv\Scripts\python -m pytest                  # 테스트 (키 없이 동작)
.venv\Scripts\python -m scripts.evaluate_search # 질문 목록으로 검색 품질·점수 분포 확인
```

데모 화면: http://localhost:8001/ (검색 결과를 영상 제목·구간·자막·점수로 보여줌)
API 문서: http://localhost:8001/docs

## 백엔드에 붙이기

```python
import sys
sys.path.append("../ai-search")   # backend 폴더 기준. 또는 PYTHONPATH에 ai-search 폴더 추가

from ai_search import router as search_router, get_visible_filter

app.include_router(search_router)            # → POST /search

# 비공개 콘텐츠 제외: 검색된 video_id 중 공개된 것만 돌려주는 함수로 바꿔 끼운다
def public_only():
    def visible(video_ids: list[str]) -> list[str]:
        return [...]  # DB에서 id IN video_ids AND 공개 상태인 Content.id (문자열로)
    return visible

app.dependency_overrides[get_visible_filter] = public_only
```

백엔드 requirements에 `chromadb`, `google-genai`를 추가해야 합니다.

### 영상 공개·수정·비공개 시 인덱스 갱신

```python
from ai_search import Segment, get_search_service

service = get_search_service()
service.index_video(str(content.id), [Segment(start, end, text), ...], title=content.title)  # 공개·수정
service.delete_video(str(content.id))                                                       # 비공개·삭제
```

`index_video`는 같은 영상의 기존 자막을 통째로 교체합니다.

## `POST /search`

```json
{ "query": "이번 달 부서별 매출 합치려면?", "top_k": 5, "group_by_video": true }
```

```json
{
  "query": "이번 달 부서별 매출 합치려면?",
  "refined_query": "엑셀 SUMIF 부서별 매출 합계",
  "results": [
    {
      "type": "video",
      "video_id": "1",
      "start": 47.0,
      "end": 76.0,
      "score": 0.71,
      "text": "엔터를 누르면 영업팀 매출 합계만 바로 나옵니다. ...",
      "moments": [{ "start": 0.0, "end": 21.0, "score": 0.62, "text": "..." }]
    }
  ]
}
```

- `video_id`는 백엔드 DB의 Content.id(문자열)입니다. 제목·썸네일·재생 시간은 백엔드가 이 값으로 조회해 붙입니다.
- `results`는 점수 높은 순이며 영상당 한 번만 나옵니다. `start`(초)부터 재생하면 됩니다.
- `moments`는 같은 영상에서 걸린 다른 구간(최대 3개, 시간순)입니다. 쓰지 않아도 됩니다.
- `refined_query`는 질문 정제를 하지 않았으면 `null`입니다.
- `type`은 지금은 항상 `"video"`입니다. 나중에 과정·실무자료 검색을 추가할 때 구분용입니다.
- 결과가 없으면 `results: []` → 프론트에서 "검색 조건 초기화 안내"를 보여줍니다.
- `group_by_video: false`로 보내면 영상별로 묶지 않은 자막 구간 목록을 돌려줍니다.

| 상태 코드 | 의미 |
|---|---|
| 422 | 검색어가 비었거나 200자 초과 |
| 503 | Gemini 임베딩 호출 실패. 재시도 안내 (필요하면 제목 검색으로 대체) |

## 자막 데이터 (`data/subtitles.json`)

```json
[{ "video_id": "1", "title": "...", "segments": [{ "start": 0.0, "end": 6.5, "text": "..." }] }]
```

지금은 초기 범위(엑셀 실무 기초) 영상 10개의 **임시 자막**입니다. `video_id` 1~10은 임시 값이라 백엔드 DB가 생기면 실제 Content.id로 맞춥니다.
테스트는 데이터가 늘어도 흔들리지 않게 처음 3개 영상만 씁니다.
자막은 3줄씩(1줄 겹침) 묶어 임베딩하고, 영상 제목을 앞에 붙여서 자막에 기능 이름이 없어도 검색되게 합니다.

- ChromaDB 데이터(`chroma_data/`)는 깃에 올리지 않습니다. 자막 JSON에서 `index_subtitles`로 다시 만듭니다.
- mock과 gemini는 컬렉션이 따로라서 모드를 바꾸면 그 모드로 한 번 인덱싱해야 합니다. 임베딩 모델을 바꿀 때도 같습니다.
- `MIN_SCORE`(기본 mock 0.1, gemini 0.65)보다 점수가 낮은 결과는 버립니다. gemini 0.65는 `evaluate_search`로 샘플 영상 10개·질문 24개를 검색해 정한 값입니다(관련 질문 1위 0.70~0.83, 관련 없는 질문 0.62 이하). 자막이 늘면 질문을 추가해 다시 확인하세요.
- mock 모드는 글자 모양만 비교하므로 점수로 관련 여부를 정확히 가르지 못합니다. 검색 품질은 gemini 모드로 확인하세요.
