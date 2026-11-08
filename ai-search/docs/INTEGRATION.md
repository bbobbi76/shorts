# AI 검색 서비스 연동 안내

사용자 검색 화면에서 AI 검색을 쓰도록 백엔드와 프론트에 붙이는 방법입니다.
검색 기능, 공개 콘텐츠 필터, DB 자막 인덱싱은 모두 `ai-search/` 안에 있고, 백엔드와 프론트에는 연결 코드만 붙입니다.
붙일 코드는 그대로 적용할 수 있는 패치로 [integration/](integration/)에 있습니다.

```
사용자 검색 화면 ──POST /api/ai/search──▶ 백엔드 (install_search 한 줄)
                                         ├─ 검색: ai_search (Gemini 임베딩·질문 정제, ChromaDB)
                                         ├─ 결과 필터: 과정·콘텐츠가 모두 공개인 것만 (DB 조회)
                                         └─ 인덱싱: 공개 콘텐츠의 DB 자막(subtitles)을 1분마다 동기화
```

## 1 백엔드 (현지민님)

패치 적용 (레포 맨 위 폴더에서):

```powershell
git apply ai-search\docs\integration\backend.patch
```

바뀌는 곳은 두 파일입니다.

`backend/app/main.py` (라우터 등록 아래):

```python
# AI 검색: POST /api/ai/search, 공개 콘텐츠만 검색, DB 자막을 자동으로 인덱싱 (ai-search/docs/INTEGRATION.md)
from ai_search.integration import install_search  # noqa: E402
install_search(app, SessionLocal)
```

`backend/requirements.txt`:

```
# AI 검색 (ai-search 폴더를 설치, 백엔드 폴더에서 pip install -r requirements.txt)
-e ../ai-search
```

설치와 설정:

```powershell
cd backend
.venv\Scripts\python -m pip install -r requirements.txt   # chromadb, google-genai가 함께 설치됩니다
```

- 실제 검색은 `SEARCH_PROVIDER=gemini`와 `GEMINI_API_KEY`가 필요합니다. `backend/.env` 또는 `ai-search/.env`에 넣으면 됩니다. 없으면 mock 모드(키 없이 동작, 검색 품질 낮음)로 동작합니다.
- 서비스 인덱스는 `ai-search/chroma_service/`에 따로 만들어져 개발용 데모 인덱스(`chroma_data/`)와 섞이지 않습니다. 둘 다 깃에 올리지 않습니다.
- 백엔드 고정 버전(FastAPI 0.115.0 등)과 함께 설치해 충돌이 없는 것을 확인했습니다.

### 동작

| 상황 | 처리 |
|---|---|
| 백엔드가 켜질 때 | 공개 콘텐츠의 DB 자막을 인덱싱합니다 (별도 스레드라 서버 시작을 막지 않음) |
| 콘텐츠 공개·자막 수정 | 1분 안에 바뀐 콘텐츠만 다시 인덱싱합니다 (제목·자막 지문 비교, 바뀌지 않으면 Gemini를 부르지 않음) |
| 비공개·삭제 | 검색할 때 DB에서 공개 여부를 확인하므로 **바로** 결과에서 빠지고, 1분 안에 인덱스에서도 지워집니다 |
| Gemini·DB 장애 | 동기화는 다음 주기에 다시 시도하고 백엔드는 계속 동작합니다. 검색 API는 임베딩 실패 시 503을 돌려줍니다 |

DB는 읽기만 하며 DB 명세서의 `contents`·`courses`·`subtitles` 테이블을 씁니다.

### API

`POST /api/ai/search` (로그인 필요 없음)

```json
{ "query": "이번 달 부서별 매출 합치려면?", "top_k": 12 }
```

```json
{
  "query": "이번 달 부서별 매출 합치려면?",
  "refined_query": "이번 달 부서별 매출 합치기",
  "results": [{ "type": "video", "video_id": "2", "start": 47.0, "end": 76.0, "score": 0.75, "text": "엔터를 누르면 ...", "moments": [] }]
}
```

- `video_id`는 `contents.content_id`(문자열), `start`는 재생 시작 시점(초)입니다.
- 결과가 없으면 `results: []`입니다.
- 검색어가 비었거나 공백뿐이거나 200자를 넘으면 백엔드 공통 오류 형식(`{message, details}`)의 400, Gemini 장애 시 503(`{"detail": "..."}`)입니다.
- 필드 설명은 [ai-search README](../README.md#post-search)를 참고하세요.

## 2 프론트 (적용 완료)

`main`에 반영되어 있어 따로 할 일이 없습니다. 바뀐 내용은 아래와 같고, 변경 원본은 [integration/front.patch](integration/front.patch)입니다.

| 파일 | 변경 |
|---|---|
| `Front/src/features/learner/aiSearch.ts` (새 파일) | `aiSearch()`: `/api/ai/search` 호출. 예시 모드이거나 실패하면 `null`. `aiResults()`: 결과를 검색 카드 형식(콘텐츠, 걸린 자막, 시작 시점)으로 변환 |
| `Front/src/features/learner/BrowsePages.tsx` | 검색어가 바뀌면 AI 검색을 부르고, 결과가 있으면 그걸 보여주고 없거나 실패하면 기존 단어 검색 결과를 그대로 보여줌. 결과 개수 옆에 "AI 검색" 표시 |

- 카드의 자막 구간을 누르면 기존 `?t=` 주소로 그 시점부터 재생됩니다 (학습 화면 수정 없음).
- 예시 데이터 모드(`VITE_DATA_MODE=mock`)에서는 AI 검색을 부르지 않아 지금과 똑같이 동작합니다.
- AI 검색이 끝나기 전에는 단어 검색 결과가 먼저 보이고, 응답이 오면 바뀝니다 (질문 정제를 최대 3초 기다림).

## 3 확인 결과 (임규혁, 로컬 MySQL + 시연 데이터)

| 확인 | 결과 |
|---|---|
| 백엔드 테스트 (패치 적용 상태) | 143개 통과, 1개 건너뜀 |
| 프론트 타입 검사·테스트 (패치 적용 상태) | 통과, 45개 통과 |
| ai-search 테스트 | 47개 통과 (연동 테스트 5개 포함) |
| 백엔드 시작 시 인덱싱 | 공개 콘텐츠 12개 인덱싱 |
| 자연어 검색 | "이번 달 부서별 매출 합치려면?" → 피벗·SUMIF·SUMIFS, "스크롤 내리면 맨 위 제목 줄이 안 보여" → 틀 고정, "오늘 점심 메뉴 추천해줘" → 결과 없음 |
| 구간 재생 | SUMIF 카드의 0:47 자막을 누르면 47초부터 재생 |
| 비공개 처리 | 관리자에서 비공개로 바꾸면 바로 검색에서 빠지고, 다시 공개하면 돌아옴 |

시연 데이터는 [demo_data/README.md](../../demo_data/README.md)로 같은 환경을 만들 수 있습니다.
