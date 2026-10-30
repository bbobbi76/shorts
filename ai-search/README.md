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
- `refined_query`는 질문 정제를 하지 않았거나 정제 결과를 버렸으면 `null`입니다.
- `type`은 지금은 항상 `"video"`입니다. 나중에 과정·실무자료 검색을 추가할 때 구분용입니다.
- 결과가 없으면 `results: []` → 프론트에서 "검색 조건 초기화 안내"를 보여줍니다.
- `group_by_video: false`로 보내면 영상별로 묶지 않은 자막 구간 목록을 돌려줍니다.

| 상태 코드 | 의미 |
|---|---|
| 422 | 검색어가 비었거나 200자 초과 |
| 503 | Gemini 임베딩 호출 실패. 재시도 안내 (필요하면 제목 검색으로 대체) |

## 자막 데이터 (`data/subtitles.json`)

```json
[
  { "video_id": "1", "title": "...", "segments": [{ "start": 0.0, "end": 6.5, "text": "..." }] },
  { "video_id": "11", "title": "...", "subtitle_file": "samples/conditional_format.srt" }
]
```

자막을 `segments`로 직접 쓰거나, `subtitle_file`로 자막 파일을 가리킵니다(JSON 기준 상대 경로).
지금은 초기 범위(엑셀 실무 기초) 영상 12개의 **임시 자막**입니다. 10개는 JSON에 직접 썼고, 11번은 SRT, 12번은 SMI(CP949) 샘플 파일입니다. `video_id`는 임시 값이라 백엔드 DB가 생기면 실제 Content.id로 맞춥니다.
테스트는 데이터가 늘어도 흔들리지 않게 처음 3개 영상만 씁니다.
자막은 3줄씩(1줄 겹침) 묶어 임베딩하고, 영상 제목을 앞에 붙여서 자막에 기능 이름이 없어도 검색되게 합니다.

- ChromaDB 데이터(`chroma_data/`)는 깃에 올리지 않습니다. 자막 JSON에서 `index_subtitles`로 다시 만듭니다.
- `index_subtitles`로 인덱스를 바꾼 뒤에는 실행 중인 서버를 다시 켜야 반영됩니다. 서버가 켜질 때 읽은 인덱스를 계속 쓰기 때문입니다. (백엔드 안에서 `index_video`를 부르는 경우는 같은 프로세스라 바로 반영됩니다.)
- mock과 gemini는 컬렉션이 따로라서 모드를 바꾸면 그 모드로 한 번 인덱싱해야 합니다. 임베딩 모델을 바꿀 때도 같습니다.
- 기준값은 아래 "검색 품질과 할루시네이션 방지"를 참고하세요. 자막이 늘면 `evaluate_search`에 질문을 추가해 다시 확인하세요.
- mock 모드는 글자 모양만 비교하므로 점수로 관련 여부를 정확히 가르지 못합니다. 검색 품질은 gemini 모드로 확인하세요.

## 자막 파일 (SRT · VTT · SMI)

`read_subtitle_file(경로)`가 확장자로 형식을 골라 `Segment` 목록으로 바꿉니다. UTF-8이 아니면 CP949로 읽습니다.

| 형식 | 처리 |
|---|---|
| SRT | 번호 줄 무시, 여러 줄 자막은 한 줄로 합침, `<i>` 같은 꾸밈 태그 제거 |
| VTT | `WEBVTT` 헤더·`NOTE`·큐 설정(`align:` 등) 무시, 시 단위 생략 표기(`00:01.000`) 지원 |
| SMI | 다음 `SYNC` 시작이 앞 자막의 끝, `&nbsp;`는 자막 지움. 언어가 여러 개면 `KR`이 들어간 클래스(KRCC 등)를 사용 |

```powershell
.venv\Scripts\python -m scripts.index_subtitles 자막.smi --video-id 12 --title "틀 고정으로 제목 줄 고정하기"
```

백엔드에서 관리자가 올린 자막 파일(`files.file_type = SUBTITLE`)을 인덱싱할 때:

```python
from ai_search import get_search_service, read_subtitle_file

segments = read_subtitle_file(저장된_자막_경로)
get_search_service().index_video(str(content.id), segments, title=content.title)
```

## 검색 품질과 할루시네이션 방지

검색 결과는 AI가 만든 문장이 아니라 **실제 자막 원문과 구간**만 보여줍니다. 그래서 없는 내용을 지어낼 수 있는 곳은 질문 정제(LLM) 하나이고, 아래 장치로 막습니다.

| 장치 | 설정 (`.env`) | 기본값 | 하는 일 |
|---|---|---|---|
| 원문·정제어 같이 검색 | | 항상 | 정제어만 믿지 않고 원문 질문으로도 검색해 구간마다 높은 점수를 씁니다. 정제가 엉뚱한 기능 이름을 붙여도 원문 결과가 남습니다 |
| 정제어 유사도 검사 | `REFINE_MIN_SIMILARITY` | 0.7 | 정제어가 원문과 의미가 너무 멀면 지어낸 것으로 보고 버립니다 (평가에서 정상 정제는 최저 0.74) |
| 정제 결과 형식 검사 | | 항상 | 여러 줄·설명이 붙었거나 60자를 넘는 응답은 버립니다 |
| 정제 프롬프트 | | | 질문의 조건은 빠뜨리지 않고, 기능 이름은 확실할 때만 넣도록 지시합니다 |
| 점수 기준 | `MIN_SCORE` | mock 0.1, gemini 0.67 | 이보다 낮은 결과는 버립니다. 엑셀이지만 영상이 없는 주제(매크로, 차트 등)에 엉뚱한 영상을 보여주지 않게 합니다 |
| 약한 결과 빼기 | `RELATIVE_MARGIN` | gemini 0.08 (mock은 끔) | 1위보다 이만큼 이상 낮은 영상은 보여주지 않습니다. `off`면 끕니다 |
| 정제 대기 제한 | `GEMINI_REFINE_WAIT` | 3초 | 넘으면 기다리지 않고 원문으로 검색합니다. 뒤늦게 온 답은 같은 질문을 다시 검색할 때 씁니다 |
| 정제 결과 기억 | | 256개 | 같은 질문은 받은 답을 기억해 다시 호출하지 않습니다. 검색어로 못 쓰는 답도 기억해 한도를 아끼고, 호출이 실패했으면 다음에 다시 시도합니다 |
| 사용량 한도 대응 | | | 무료 등급은 정제 모델을 분당 15번까지 부를 수 있습니다. 한도(429)에 걸리면 다시 시도할 수 있을 때까지 정제 없이 바로 검색합니다. 대기 시간이 지난 뒤에 온 429도 반영합니다 |

`evaluate_search`(샘플 영상 12개, 질문 32개: 관련 24개, 관련 영상이 없는 8개) 결과입니다.

| 항목 | 이전 (정제어만 검색, 0.65) | 지금 |
|---|---|---|
| 관련 질문 1위 정답 | 23/24 | 22/24 |
| 정답 외에 함께 보여준 영상 | 평균 2.5개 | 평균 0.6개 |
| 관련 영상이 없는 질문에 결과를 보여줌 | 2/8 | 0/8 |
| 검색 시간 | 평균 2.6초, 최대 9.9초 | 평균 2.0초, 최대 3.6초 |

- 1위가 틀린 2개 중 "이번 달 부서별 매출 합치려면?"은 피벗(0.750)과 SUMIF(0.749)가 사실상 같은 점수라 둘 다 결과에 나옵니다.
- "영업팀이면서 3월 매출만 더하려면"(정답 SUMIFS)은 조건이 두 개라는 뜻을 임베딩이 구분하지 못합니다. 정제에서 SUMIFS를 추측해 붙이면 맞지만, 질문에 없는 내용을 지어내지 않는 쪽을 택했습니다.
- 평가 스크립트는 무료 한도에 걸리지 않게 질문마다 4.3초 간격을 둡니다.

