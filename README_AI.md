# AI 피드백 모듈 (초기 구현)

이 폴더는 Shorts 프로젝트의 AI 담당 기능 초안입니다. 기존 프론트엔드나 FastAPI 앱을 덮어쓰지 않습니다.

## 기능
- 과제 제목·설명·기대 답안·사용자 답안을 입력으로 받음
- OpenAI API를 사용해 점수와 학습 피드백 생성
- Pydantic으로 응답 JSON 형식과 점수 범위를 검증
- API 키 누락 또는 응답 형식 오류를 예외로 알려줌

## 파일
- `backend/ai/schemas.py`: 요청/응답 데이터 형식
- `backend/ai/ai_feedback.py`: AI 평가 서비스 함수
- `backend/ai/example_request.json`: 예시 요청
- `requirements-ai.txt`: 이 모듈의 최소 의존성

## 로컬 준비
프로젝트 루트에서 실행합니다.

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements-ai.txt
$env:OPENAI_API_KEY="여기에_본인_API_키"
```

API 키를 코드나 GitHub에 올리지 마세요. `.env`를 사용하는 경우 `.gitignore`에 `.env`가 포함되어 있는지 확인하세요.

## FastAPI 담당자가 연결할 때
기존 FastAPI 라우터에서 `FeedbackRequest`를 요청 모델로 사용하고, `evaluate_answer(request)`를 호출한 뒤 `FeedbackResponse`를 반환하도록 연결할 수 있습니다. 이 초안은 `main.py`, 인증, DB 저장, 프론트엔드 연결을 구현하지 않습니다.

## 예시 입력
- 과제: A열은 팀 이름, B열은 매출. 영업팀의 매출 합계 수식 작성
- 기대 답안: `=SUMIF(A:A,"영업팀",B:B)`
- 제출 답안: `=SUMIF(A:A,"영업팀")`

평가 결과는 모델이 생성하므로 자동으로 정답을 보장하지 않습니다. 실제 사용 전에는 과제별 테스트와 팀 백엔드 연동 검증이 필요합니다.
