# 시연 데이터 (`demo_data`)

최종 시연과 기능 캡처용 데이터입니다. 백엔드 DB를 만들 때 `init_db.py --demo`로 함께 넣습니다.

> 영상은 제목과 자막이 시간에 맞춰 나오는 **샘플 슬라이드 영상**이고 자막은 임시 자막입니다. 화면에 "시연용 샘플 영상 · 실제 강의가 아닙니다"가 계속 표시됩니다.

| 파일 | 내용 |
|---|---|
| `demo_data.sql` | 시연 데이터 INSERT문 (80KB) |
| `uploads/` | SQL이 가리키는 실제 파일: 영상 12개, 썸네일 15개, 실습 예제 CSV 11개 (1.7MB) |
| `quiz_practice_list.md` | 영상별 퀴즈·정답·실습·실습 정답 목록 (검토용) |
| `init_db_demo.patch` | `init_db.py`에 `--demo` 옵션을 추가한 변경 기록 (이미 반영됨) |

## 들어가는 것

| 항목 | 내용 |
|---|---|
| 과정 3개 (공개) | 엑셀 함수 기초(5개), 데이터 정리와 보고서 실무(5개), 엑셀 오류 해결과 날짜 계산(2개) |
| 콘텐츠 12개 (공개) | 샘플 영상(54~88초, 9:16)과 썸네일, 학습 목표, 자막 90줄(AI 검색 샘플 자막) |
| 퀴즈 12개 | 4지선다, 해설, 오답마다 피드백과 다시 볼 시점 |
| 실습 11개 | 실습 안내, 예제 CSV, 정답 결과, 필수 함수, 정답 수식 |

## 넣는 방법

`backend/.env`에 **새 DB 이름**(`DB_NAME`)을 넣고, `backend` 폴더에서 `--demo`를 붙여 DB를 만듭니다.

```powershell
.venv\Scripts\python init_db.py --demo
```

테이블과 기본 seed를 만든 뒤 시연 데이터 SQL을 넣고, 영상·썸네일·실습 파일을 `backend/uploads`로 복사합니다.
백엔드를 켜면(`.venv\Scripts\python -m uvicorn app.main:app --port 8000`) 사용자 화면에 과정 3개와 영상 12개가 보입니다. 관리자 로그인은 seed 관리자(`admin@workfit.dev` / `admin1234`)입니다.

> `--demo` 옵션은 `main`의 `init_db.py`에 이미 들어가 있어 패치를 따로 적용하지 않습니다. `--demo` 없이 실행하면 시연 데이터 없이 DB만 만듭니다.

### `--demo`가 없을 때 (직접 넣기)

1. `init_db.py`로 새 DB를 만듭니다.
2. `demo_data.sql`을 넣습니다. PowerShell에서 `Get-Content ... | mysql`로 넘기면 한글이 깨지므로 파일을 직접 읽게 합니다.

   ```powershell
   mysql -u root -p --default-character-set=utf8mb4 <DB_NAME> -e "source demo_data/demo_data.sql"
   ```

   Docker MySQL이면 `docker cp demo_data\demo_data.sql <컨테이너>:/demo_data.sql` 후 `docker exec <컨테이너> sh -c "mysql -uroot -p<비밀번호> --default-character-set=utf8mb4 <DB_NAME> < /demo_data.sql"`, Workbench면 DB를 선택하고 파일을 열어 실행합니다.

3. 업로드 파일을 복사합니다.

   ```powershell
   New-Item -ItemType Directory -Force backend\uploads | Out-Null
   Copy-Item -Recurse -Force demo_data\uploads\* backend\uploads\
   ```

## 주의

- **새 DB에만** 넣습니다. `init_db.py`로 만든 직후의 DB를 기준으로 번호(과정 2~4, 콘텐츠 2~13, 파일 4~41)를 그대로 넣기 때문입니다. `--demo`는 기존 DB에서는 넣지 않고 안내만 합니다.
- 다시 넣고 싶으면 DB를 지우거나 새 `DB_NAME`으로 다시 만듭니다.
- 퀴즈는 공개 API에서 정답 보호를 위해 빠지므로 관리자 화면(등록·미리보기)에서만 보입니다.
- 기본 seed의 예시 콘텐츠(실제 영상 없음)는 `init_db.py`가 임시저장으로 두므로 사용자 화면에는 나오지 않습니다.

## 만든 방법

관리자 API(관리자 화면과 같은 업로드·저장·공개 검사)로 등록한 뒤 해당 행만 SQL로 내보냈습니다.
