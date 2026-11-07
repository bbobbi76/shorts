import { useState } from 'react';
import { apiBase, dataMode } from '../../data/config';

interface Feedback {
  status: 'correct' | 'partially_correct' | 'incorrect' | 'needs_review';
  score: number | null;
  good_points: string[];
  improvement_points: string[];
  corrected_answer: string;
  explanation: string;
  next_practice: string;
}

export function PracticeFeedback({ practiceId }: { practiceId: number }) {
  const [answer, setAnswer] = useState('');
  const [answerType, setAnswerType] = useState<'FORMULA' | 'RESULT'>('FORMULA');
  const [result, setResult] = useState<Feedback | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (dataMode !== 'api') return null;
  return <section className="learn-white-section"><h2>AI 실습 피드백</h2>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy || !answer.trim()) return;
      setBusy(true); setError(''); setResult(null);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(`${apiBase.replace(/\/ui$/, '')}/ai/feedback`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ practice_id: practiceId, learner_answer: answer.trim(), answer_type: answerType }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || body.detail || '피드백을 가져오지 못했습니다.');
        setResult(body);
      } catch (reason) {
        setError(controller.signal.aborted ? '응답 시간이 초과되었습니다. 다시 시도해 주세요.' : reason instanceof Error ? reason.message : '서버에 연결할 수 없습니다.');
      } finally { clearTimeout(timer); setBusy(false); }
    }}>
      <label>제출 유형<select value={answerType} disabled={busy} onChange={event => { setAnswerType(event.target.value as 'FORMULA' | 'RESULT'); setResult(null); }}><option value="FORMULA">수식</option><option value="RESULT">결과 값</option></select></label>
      <label className="learn-note-label" htmlFor="practice-answer">실습 답안</label>
      <textarea id="practice-answer" rows={3} maxLength={4000} required disabled={busy} value={answer} onChange={event => { setAnswer(event.target.value); setResult(null); }} placeholder="작성한 수식 또는 결과를 입력하세요."/>
      <p className="help">제출하면 답안이 AI 평가 서비스로 전송됩니다. 수식을 Excel에서 실행한 결과는 아니며, 평가 근거가 부족하면 검토가 필요하다고 표시합니다.</p>
      <button className="button primary" disabled={busy || !answer.trim()}>{busy ? '평가 중…' : 'AI 피드백 받기'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><h3>{({ correct: '정답', partially_correct: '부분 정답', incorrect: '오답', needs_review: '검토 필요' })[result.status]}{result.score !== null ? ` · ${result.score}점` : ''}</h3>
      <p>{result.explanation}</p>
      {result.good_points.length > 0 && <><h4>잘한 점</h4><ul>{result.good_points.map((point, i) => <li key={i}>{point}</li>)}</ul></>}
      {result.improvement_points.length > 0 && <><h4>개선할 점</h4><ul>{result.improvement_points.map((point, i) => <li key={i}>{point}</li>)}</ul></>}
      {result.corrected_answer && <p>참고 답안: <code>{result.corrected_answer}</code></p>}
      <p>{result.next_practice}</p>
    </div>}
  </section>;
}
