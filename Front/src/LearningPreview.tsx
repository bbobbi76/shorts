import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, FileSpreadsheet, Lightbulb, MessageSquareText, Play, Search, Sparkles } from 'lucide-react';
import './learning-preview.css';

function Sheet({ large = false }: { large?: boolean }) {
  return <div className={`lp-sheet ${large ? 'lp-sheet-large' : ''}`} aria-label="SUM 수식 학습용 화면 예시">
    <div className="lp-sheet-toolbar"><FileSpreadsheet size={16}/><span>주간 매출 정리.xlsx</span><span className="lp-sheet-dot"/></div>
    <div className="lp-formula"><span>C6</span><i>fx</i><strong>=SUM(C2:C5)</strong></div>
    <table><thead><tr><th/><th>A</th><th>B</th><th>C</th></tr></thead><tbody>
      <tr><th>1</th><td>구분</td><td>수량</td><td>매출액</td></tr>
      <tr><th>2</th><td>노트</td><td>12</td><td>24,000</td></tr>
      <tr><th>3</th><td>펜</td><td>20</td><td>30,000</td></tr>
      <tr><th>4</th><td>파일</td><td>8</td><td>16,000</td></tr>
      <tr><th>5</th><td>메모지</td><td>10</td><td>10,000</td></tr>
      <tr><th>6</th><td>합계</td><td/><td className="lp-cell-selected">80,000</td></tr>
    </tbody></table>
  </div>;
}

export default function LearningPreview({ lesson = false }: { lesson?: boolean }) {
  const [question, setQuestion] = useState('엑셀에서 수식을 어떻게 사용해?');
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState<'practice' | 'quiz'>('practice');
  const [answer, setAnswer] = useState('=SUM(C2:C5)');
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [playerNotice, setPlayerNotice] = useState(false);

  if (!lesson) return <div className="learning-preview">
    <section className="lp-hero">
      <span className="lp-eyebrow"><span/> 필요한 순간, 짧게 배우는 실무</span>
      <h1>막히는 업무를,<br/>한 문장으로 물어보세요.</h1>
      <p>무엇을 배워야 할지 몰라도 괜찮아요.<br className="lp-mobile-break"/> 지금 궁금한 내용을 그대로 적어보세요.</p>
      <form className="lp-question" onSubmit={e => { e.preventDefault(); setSearched(true); }}>
        <Search size={23} aria-hidden="true"/>
        <input aria-label="배우고 싶은 내용" placeholder="예: 엑셀에서 수식을 어떻게 사용해?" value={question} onChange={e => { setQuestion(e.target.value); setSearched(false); }}/>
        <button type="submit" aria-label="검색 결과 예시 보기"><ArrowRight size={22}/></button>
      </form>
      <div className="lp-prompts"><span>이렇게 물어보세요</span>{['엑셀에서 수식을 어떻게 사용해?', '합계를 자동으로 계산하고 싶어', '셀 주소에 $는 왜 붙여?'].map(text => <button key={text} onClick={() => { setQuestion(text); setSearched(false); }}>{text}</button>)}</div>
    </section>
    <section className="lp-results" aria-labelledby="lp-results-title">
      <div className="lp-section-title"><div><span className="lp-kicker">질문에서 학습으로</span><h2 id="lp-results-title">이런 영상으로 시작해 보세요</h2></div><span className="lp-example-label">검색 결과 예시</span></div>
      <p className="lp-example-note" role="status">{searched ? '화면 예시를 표시했어요. 입력한 문장을 분석하거나 실제로 검색하지 않습니다.' : '아래는 ‘엑셀 수식 사용법’에 대한 미리 작성된 결과입니다.'}</p>
      <Link className="lp-feature" to="/learn/preview" aria-label="SUM 함수로 합계 구하기 학습 화면 보기">
        <div className="lp-feature-art"><Sheet/><span className="lp-art-play"><Play size={21} fill="currentColor"/></span><span className="lp-duration">03:20</span></div>
        <div className="lp-feature-content"><div className="lp-tags"><span>엑셀</span><span>기초</span><span>수식·함수</span></div><h3>수식의 시작,<br/>SUM 함수로 합계 구하기</h3><p>수식 입력부터 셀 범위 선택까지.<br/>반복 계산을 줄이는 첫 번째 방법을 배워요.</p><div className="lp-match"><Lightbulb size={17}/><span>수식 작성 방법과 합계 계산이 궁금할 때</span></div><span className="lp-watch">학습 화면 보기<ArrowRight size={18}/></span></div>
      </Link>
      <div className="lp-related"><div className="lp-related-label">함께 살펴볼 주제<span>관련 영상 예시</span></div><article><span className="lp-topic-mark">$A$1</span><div><h3>복사해도 바뀌지 않는 셀 참조</h3><p>상대 참조와 절대 참조 · 4분</p></div></article><article><span className="lp-topic-mark">IF()</span><div><h3>조건에 따라 다른 결과 만들기</h3><p>IF 함수의 기본 구조 · 5분</p></div></article></div>
    </section>
    <section className="lp-flow"><div><span>01</span><h3>질문으로 영상 찾기</h3><p>업무 상황을 내 말로 검색해요.</p></div><ChevronRight/><div><span>02</span><h3>짧게 보고 직접 풀기</h3><p>영상 다음에 과제와 문제를 만나요.</p></div><ChevronRight/><div><span>03</span><h3>AI 피드백 확인하기</h3><p>잘한 점과 보완할 점을 확인해요.</p></div></section>
  </div>;

  return <div className="learning-preview lp-lesson-page">
    <Link className="lp-back" to="/learn"><ArrowLeft size={17}/>영상 찾기로 돌아가기</Link>
    <div className="lp-lesson-heading"><div className="lp-tags"><span>엑셀</span><span>기초</span><span>수식·함수</span></div><h1>수식의 시작, SUM 함수로 합계 구하기</h1><p>수식의 기본 구조를 이해하고, 여러 셀의 값을 한 번에 더해봐요.</p></div>
    <div className="lp-learning-grid"><section className="lp-video-column" aria-label="영상 학습 예시">
      <div className="lp-player"><div className="lp-player-title"><FileSpreadsheet size={18}/><span>EXCEL BASIC<span>01 / 수식과 함수</span></span></div><div className="lp-player-copy"><span>하나씩 더하지 않아도 괜찮아요</span><h2>합계는 SUM으로,<br/>계산은 한 번에.</h2></div><Sheet large/><button className="lp-player-play" aria-label="영상 영역 안내 보기" onClick={() => setPlayerNotice(true)}><Play size={24} fill="currentColor"/></button><div className="lp-player-controls"><Play size={14}/><span>00:00 / 03:20</span><div/><span>화면 예시</span></div></div>
      {playerNotice && <p className="lp-inline-note" role="status">영상 영역의 화면 예시입니다. 실제 강의 영상은 연결하지 않았습니다.</p>}
      <div className="lp-video-meta"><span><Clock3 size={15}/>3분 20초</span><span><CheckCircle2 size={15}/>실습 과제 1개</span><span><MessageSquareText size={15}/>확인 문제 1개</span></div>
      <section className="lp-takeaway"><h2>이 영상에서 배울 내용</h2><p><Check size={17}/>수식은 등호(=)로 시작해요.</p><p><Check size={17}/>SUM 함수로 여러 셀의 합계를 구해요.</p><p><Check size={17}/>콜론(:)으로 계산할 셀 범위를 지정해요.</p></section>
      <div className="lp-learning-note"><Lightbulb size={20}/><p>보고 끝내지 말고, 한 번 적용해보세요.<br/><span>옆의 과제와 문제로 방금 배운 내용을 정리할 수 있어요.</span></p></div>
    </section><aside className="lp-workspace" aria-label="과제와 피드백 예시">
      <div className="lp-workspace-heading"><span className="lp-kicker">직접 해보기</span><h2>배운 내용을 내 것으로</h2><p>실습하고 피드백을 확인하는 화면입니다.</p></div>
      <div className="lp-work-tabs" role="tablist" aria-label="학습 활동"><button id="practice-tab" role="tab" aria-selected={tab === 'practice'} aria-controls="lp-activity" onClick={() => { setTab('practice'); setFeedback(false); }}>실습 과제</button><button id="quiz-tab" role="tab" aria-selected={tab === 'quiz'} aria-controls="lp-activity" onClick={() => { setTab('quiz'); setFeedback(false); }}>확인 문제</button></div>
      <div className="lp-activity" id="lp-activity" role="tabpanel" aria-labelledby={tab === 'practice' ? 'practice-tab' : 'quiz-tab'}>
        <span className="lp-task-number">{tab === 'practice' ? '과제 01' : '문제 01'}</span><h3>{tab === 'practice' ? '주간 매출 합계를 구해보세요.' : 'C2부터 C5까지 더하는 수식은?'}</h3>
        <p>{tab === 'practice' ? '영상 속 표의 C2~C5에 매출액이 입력되어 있어요. C6에 넣을 SUM 수식을 작성해보세요.' : '여러 셀의 값을 더할 때 사용하는 올바른 범위 표현을 골라보세요.'}</p>
        {tab === 'practice' ? <><label htmlFor="lp-answer">작성한 수식 또는 풀이</label><textarea id="lp-answer" value={answer} onChange={e => { setAnswer(e.target.value); setFeedback(false); }} placeholder="수식이나 풀이 과정을 작성해보세요."/><span className="lp-answer-hint">파일 없이 수식과 풀이를 작성하는 화면 예시입니다.</span></> : <div className="lp-options">{['=SUM(C2:C5)', '=SUM(C2,C5)', '=C2+C5'].map((option, index) => <label key={option} className={choice === index ? 'is-selected' : ''}><input type="radio" name="sum-question" checked={choice === index} onChange={() => { setChoice(index); setFeedback(false); }}/><span>{option}</span></label>)}</div>}
        <button className="lp-feedback-button" onClick={() => setFeedback(true)}><Sparkles size={17}/>AI 피드백 예시 보기<ArrowRight size={17}/></button><p className="lp-disclosure">입력·선택 내용은 전송하거나 채점하지 않아요.<br/>버튼을 누르면 미리 작성한 피드백 예시가 표시됩니다.</p>
        {feedback && <section className="lp-feedback" aria-live="polite"><div className="lp-feedback-title"><Sparkles size={18}/><h3>AI 피드백</h3><span>예시</span></div><p className="lp-feedback-intro">아래는 <code>=SUM(C2:C5)</code>를 제출했을 때의 피드백 예시예요.</p><h4><CheckCircle2 size={16}/>잘한 점</h4><p>SUM 함수와 연속된 셀 범위를 올바르게 사용했어요. C2부터 C5까지의 매출액을 더하면 합계는 80,000원이에요.</p><h4><Lightbulb size={16}/>한 번 더 생각해보기</h4><p>{tab === 'practice' ? '계산할 범위에 합계 셀 C6을 포함하지 않도록 주의하세요. 합계 셀 자체를 포함하면 순환 참조가 생겨요.' : 'C2:C5는 C2부터 C5까지 전체 범위예요. C2,C5는 두 셀만 선택하므로 중간 값이 빠져요.'}</p><div className="lp-next-step">다음 연습 · C2부터 C10까지의 합계 수식을 적어보세요.</div></section>}
      </div>
    </aside></div>
  </div>;
}
