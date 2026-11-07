# 최종 실제 Gemini 평가 검증 (2026-11-07)

## 결과

**실제 MySQL에서 조회한 SUMIFS 과제를 실제 Gemini `gemini-3.1-flash-lite`로 평가하는 데 성공했다.**
Mock이나 고정 데모 응답을 사용하지 않았다. 기존 서버의 모델 환경 변수는 변경하지 않았다.

## 확인 과정과 호출 횟수

1. 실행 서버의 모델은 `gemini-3.8-flash`였다. 현재 서버에 제출 요청을 1회 보냈고 HTTP 502가 반환됐다.
2. 실제 서버 콘솔의 예외는 `google.genai.errors.ServerError`, 외부 코드는 504, 원인은 deadline expired였다. 정상 JSON 수신 이후의 파싱·Pydantic 오류가 아니었다.
3. 같은 키로 SDK 모델 목록을 조회했다. `gemini-3.8-flash`와 `gemini-3.1-flash-lite` 모두 목록에 있으며 `generateContent` 작업을 지원한다고 반환됐다. 모델 목록 조회 성공이 실제 생성 성공을 보장하지는 않는다.
4. 공식 가격표에서 `gemini-3.1-flash-lite`의 무료 등급을 확인했다. 계정의 실제 과금 등급·남은 할당량은 조회하지 않았다.
5. 진단 프로세스의 `GEMINI_FEEDBACK_MODEL`만 `gemini-3.1-flash-lite`로 바꾸어 대체 모델 평가를 1회 수행했다. 기존 DB는 읽기 전용으로 조회했다.
6. 대체 평가가 성공해 추가 외부 호출과 자동 재시도는 수행하지 않았다.

이번 차수의 생성 요청은 기존 모델 서버 요청 1회와 대체 모델 평가 1회다. 모델 목록 조회는 생성 요청과 별개다.

## 실제 성공한 평가

| 항목 | 결과 |
| --- | --- |
| 실습 | 실제 DB의 SUMIFS 과제, practice_id=3 |
| 제출 | `=SUMIF(A:A,"영업팀",B:B)` |
| 서버 과제·기준 조회 | 성공 |
| 모델 | `gemini-3.1-flash-lite` |
| Gemini 생성 | 성공, FinishReason.STOP |
| JSON 파싱 | 성공 |
| 필수 공개 필드 누락 | 없음 |
| 내부 criterion_checks | 존재 |
| ProviderAssessment Pydantic 검증 | 성공 |
| 서버 근거 대조 후 최종 결과 | `incorrect`, score=0 |

0점은 SUMIFS 필수 과제에 SUMIF를 제출한 함수 제약 위반 결과이며 외부 오류를 0점으로 바꾼 것이 아니다.
잘한 점·개선점 목록, 수정 답안, 설명, 다음 실습 추천의 필드 형식도 검증했다. 키·DB 비밀번호·서버 정답·응답 원문은 출력하지 않았다.

## 최소 변경과 테스트

- AI 평가 함수의 기본 모델만 `gemini-3.1-flash-lite`로 변경했다.
- 명시적인 모델 환경 변수 우선 정책, 기존 루브릭·JSON Schema·보류 정책은 유지했다.
- 기본 모델 회귀 테스트와 AI 연동 안내를 갱신했다.
- 모델·제공자 응답 경계 테스트: **17 passed**.
- `git diff --check`: 통과.
- 이번 작업에서 DB·프론트·main 앱 코드는 변경하지 않았다. commit·push도 하지 않았다.

## 현재 서버에 적용

현재 실행 서버는 명시적으로 `gemini-3.8-flash`를 사용하므로, 파일 기본값 변경만으로 실행 중인 서버가 바뀌지 않는다.
DB 환경 변수와 Gemini 키가 설정된 동일 PowerShell에서 Ctrl+C로 종료한다.
현재 위치가 backend 폴더일 때 아래와 같이 실행한다.

```powershell
$env:GEMINI_FEEDBACK_MODEL = 'gemini-3.1-flash-lite'
..\.verification\venv312\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

브라우저: http://127.0.0.1:5174/learn/courses → SUMIFS 실습 영상 → 실습·업무자료 → 답안 제출.
재시작 후의 8000번 API와 사용자 브라우저 결과는 아직 재검증하지 않았다. 이 문서의 실제 성공은 **운영과 동일한 평가 함수·실제 DB·실제 Gemini를 사용한 별도 진단 프로세스**의 결과다.

공식 근거: [모델 목록](https://ai.google.dev/gemini-api/docs/models), [가격표](https://ai.google.dev/gemini-api/docs/pricing), [프로젝트별 할당량 안내](https://ai.google.dev/gemini-api/docs/rate-limits).
