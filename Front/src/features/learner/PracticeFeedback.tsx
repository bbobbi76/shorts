import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiBase, dataMode } from '../../data/config';
import { submitFeedback } from '../../data/api/feedback';
import type { PracticeFeedback as Feedback, PublicContent } from '../../domain/public-model';

const labels = { correct: '정답', partially_correct: '부분 정답', incorrect: '오답', needs_review: '평가 보류' };

export default function PracticeFeedback({ content }: { content: PublicContent }) {
  const [answer, setAnswer] = useState('');
  const [answerType, setAnswerType] = useState<'FORMULA' | 'RESULT'>('FORMULA');
  const [result, setResult] = useState<Feedback | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const live = dataMode === 'api';
  const available = live && Number.isSafeInteger(content.practiceId) && Number(content.practiceId) > 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!available || !answer.trim() || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    setLoading(true); setError(''); setResult(null);
    try {
      const response = await submitFeedback(apiBase, content.practiceId!, answer, answerType, controller.signal);
      if (pending.current === controller) setResult(response);
    } catch (cause) { if (pending.current === controller) setError(cause instanceof Error ? cause.message : '피드백 요청에 실패했습니다.'); }
    finally { window.clearTimeout(timeout); if (pending.current === controller) { pending.current = null; setLoading(false); } }
  }
  return <section className="learn-white-section learn-feedback" aria-labelledby="feedback-heading">
    <h2 id="feedback-heading">실습 답안 제출 · AI 피드백</h2>
    <p className="help">{live ? '실제 API 모드 · 서버에 등록된 과제 기준으로 평가를 요청합니다.' : 'Mock 모드 · 실제 AI 평가와 답안 제출은 제공하지 않습니다.'}</p>
    {content.practiceTitle && <h3>{content.practiceTitle}</h3>}
    {!available ? <p>{live ? '이 영상에는 제출 가능한 실습이 등록되어 있지 않습니다.' : '실제 제출은 API 모드에서 이용해 주세요. /learn/preview의 피드백은 미리 작성된 예시입니다.'}</p> : <form onSubmit={submit} aria-busy={loading}>
      <label htmlFor="practice-answer-type">답안 유형</label>
      <select id="practice-answer-type" value={answerType} disabled={loading} onChange={e => { setAnswerType(e.target.value as 'FORMULA' | 'RESULT'); setResult(null); setError(''); }}><option value="FORMULA">수식</option><option value="RESULT">계산 결과</option></select>
      <label htmlFor="practice-answer">내 실습 답안</label>
      <textarea id="practice-answer" rows={4} maxLength={4000} required disabled={loading} value={answer} onChange={e => { setAnswer(e.target.value); setResult(null); setError(''); }} placeholder="영상의 실습 안내에 따라 수식 또는 결과를 입력하세요."/>
      <p className="help">필수 함수가 있는 과제는 수식을 제출해 주세요. 답안은 AI 제공자에게 전달됩니다. 제출 이력은 저장되지 않습니다.</p>
      <button className="button primary" type="submit" disabled={loading || !answer.trim()}>{loading ? 'AI 평가 중…' : '답안 제출하고 AI 피드백 받기'}</button>
    </form>}
    {loading && <p role="status">AI 피드백을 기다리고 있습니다.</p>}
    {error && <p className="error-box" role="alert">{error}</p>}
    {result && <div className="learn-feedback-result" role="status">
      <h3>{labels[result.status]}{result.status !== 'needs_review' && result.score !== null ? ` · ${result.score}점` : ''}</h3>
      <p className="pre-wrap">{result.explanation}</p>
      {result.good_points.length > 0 && <><h4>잘한 점</h4><ul>{result.good_points.map((point, i) => <li key={i}>{point}</li>)}</ul></>}
      {result.improvement_points.length > 0 && <><h4>개선점</h4><ul>{result.improvement_points.map((point, i) => <li key={i}>{point}</li>)}</ul></>}
      {result.status !== 'needs_review' && result.corrected_answer && <><h4>수정 답안</h4><pre>{result.corrected_answer}</pre></>}
      {result.next_practice && <><h4>다음 실습 추천</h4><p className="pre-wrap">{result.next_practice}</p></>}
    </div>}
  </section>;
}
