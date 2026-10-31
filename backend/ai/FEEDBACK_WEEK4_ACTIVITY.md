# 4주차 AI 피드백 구현 활동 기록 (실제 Gemini 테스트 전 초안)

**담당:** AI 피드백

## 1. 개요
3주차 OpenAI 기반 과제 평가 기능을 유지하면서, 팀 AI 검색 담당자가 채택한 Gemini SDK를 AI 피드백에도 적용했습니다. 목업 모드와 Gemini 실제 평가 모드를 분리하고, DB 없이 확인 가능한 데모 화면과 FastAPI API를 구현했습니다.

## 2. 개발 내용
- **Mock 평가 모드:** 엑셀 SUMIF 과제의 정답·부분 정답·오답 예시를 고정 규칙으로 표시했습니다. 예시 점수이며 실제 AI 평가와 구분했습니다.
- **Gemini 연동:** `google-genai` SDK의 `client.models.generate_content()`로 과제와 학습자 답안을 평가하도록 작성했습니다. `application/json` 응답을 요청하고 Pydantic으로 응답 형식을 검증했습니다.
- **FastAPI:** 기존 `POST /api/ai/feedback`에 Gemini 평가를 연결하고, 별도 `POST /api/ai/feedback/mock`을 추가했습니다.
- **데모 UI:** `/demo`에서 과제와 답안을 편집하고 Mock/Gemini 모드를 선택하여 결과를 볼 수 있게 구현했습니다.
- **검증:** 정답·부분 정답·오답, 데모 화면, 키 미설정 응답, 모델 호출 인터페이스를 테스트했습니다.

## 3. 결과 / 증빙
- Mock 자동 테스트 결과: **로컬 실행 후 실제 통과 개수와 캡처 추가**.
- Gemini 실제 호출 결과: **API 키 승인 및 실제 실행 후 점수·개선점 캡처 추가**.
- 구현 경로: `backend/ai/ai_feedback.py`, `mock_feedback.py`, `demo.html`, `test_gemini_feedback.py`, `backend/app/routers/ai_feedback.py`.

## 4. 남은 작업
실제 Gemini 키와 모델 접근권한을 확인한 뒤 정답·부분 정답·오답 3개를 평가하고, 평가 정확성을 비교할 예정입니다. 프론트엔드와 통합할 때 과제 정답은 서버에서 조회하도록 개선하고 인증 및 호출 제한을 추가할 계획입니다.
