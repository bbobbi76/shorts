import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Check, CheckCircle2, ChevronDown, FileText, Layers3, Pencil, Plus, RotateCcw, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import './admin-quiz-studio.css';

type Draft = { id: string; question: string; options: string[]; correctIndex: number; explanation: string; difficulty: string };
type Reference = { id: string; name: string; size: number };
const examples = [
  { question: 'C2부터 C5까지 입력된 매출액을 모두 더하는 올바른 수식은 무엇인가요?', options: ['=SUM(C2:C5)', '=SUM(C2,C5)', '=COUNT(C2:C5)', '=AVERAGE(C2:C5)'], correctIndex: 0, explanation: 'SUM은 선택한 범위의 합계를 구합니다. C2:C5는 C2부터 C5까지의 모든 셀을 포함합니다. 쉼표로 C2,C5를 지정하면 두 셀만 더합니다.' },
  { question: '엑셀에서 수식을 입력할 때 가장 먼저 작성해야 하는 기호는 무엇인가요?', options: ['#', '=', '$', '@'], correctIndex: 1, explanation: '엑셀 수식은 등호(=)로 시작합니다. 예를 들어 =A1+B1은 두 셀의 값을 더하는 수식입니다.' },
  { question: 'C6 셀에 =SUM(C2:C6)을 입력하면 어떤 문제가 생길 수 있나요?', options: ['합계가 자동으로 반올림된다.', 'C2 셀만 계산된다.', '자기 자신을 포함해 순환 참조가 생긴다.', '자동으로 평균을 계산한다.'], correctIndex: 2, explanation: '합계 수식을 입력한 C6 자체가 계산 범위에 포함되면 순환 참조가 생깁니다. C6에 합계를 구할 때는 =SUM(C2:C5)처럼 해당 셀을 제외해야 합니다.' },
  { question: '연속된 셀 범위를 지정하는 기호는 무엇인가요?', options: ['세미콜론(;)', '느낌표(!)', '콜론(:)', '물음표(?)'], correctIndex: 2, explanation: '콜론(:)은 시작 셀과 마지막 셀 사이의 연속된 범위를 나타냅니다. A1:A5는 A1부터 A5까지를 의미합니다.' },
  { question: 'A1에 10, A2에 20, A3에 30이 있을 때 =SUM(A1:A3)의 결과는 무엇인가요?', options: ['10', '20', '30', '60'], correctIndex: 3, explanation: 'SUM(A1:A3)은 A1, A2, A3에 입력된 숫자를 모두 더합니다. 따라서 10+20+30=60입니다.' },
];
const sampleText = '학습 주제: 엑셀 수식과 SUM 함수\n• 수식은 등호(=)로 시작합니다.\n• SUM 함수는 지정한 범위의 합계를 계산합니다.\n• C2:C5는 C2부터 C5까지의 연속된 셀 범위입니다.\n• 합계 셀 자신을 범위에 포함하면 순환 참조가 발생합니다.';
const allowed = ['pdf', 'docx', 'pptx', 'txt', 'md', 'xlsx', 'csv'];

export default function AdminQuizStudio({ contentTitle }: { contentTitle: string }) {
  const inputId = useId(); const fileInput = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<Reference[]>([]);
  const [material, setMaterial] = useState(''); const [instructions, setInstructions] = useState('');
  const [count, setCount] = useState(3); const [difficulty, setDifficulty] = useState('기초');
  const [drafts, setDrafts] = useState<Draft[]>([]); const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ items: Draft[]; index: number } | null>(null);
  const [message, setMessage] = useState(''); const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false); const [editError, setEditError] = useState('');
  const hasMaterial = references.length > 0 || material.trim().length > 0;

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const accepted: Reference[] = []; const rejected: string[] = [];
    Array.from(files).forEach(file => {
      if (!allowed.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) rejected.push(`${file.name}: 지원하지 않는 형식입니다.`);
      else if (file.size === 0 || file.size > 10 * 1024 * 1024) rejected.push(`${file.name}: 0바이트 초과, 10MB 이하의 파일을 선택해 주세요.`);
      else accepted.push({ id: crypto.randomUUID(), name: file.name, size: file.size });
    });
    setReferences(previous => [...previous, ...accepted]); setFileError(rejected.join(' '));
    if (accepted.length) setMessage(`${accepted.length}개 파일을 화면에 첨부했습니다. 파일 내용은 전송·분석하지 않습니다.`);
  }
  function generate() {
    if (!hasMaterial) return;
    const added = examples.slice(0, count).map(example => ({ ...example, options: [...example.options], id: crypto.randomUUID(), difficulty }));
    setDrafts(previous => [...previous, ...added]); setRemoved(null); setConfirmDelete(null);
    setMessage(`미리 작성된 엑셀 퀴즈 예시 ${added.length}개를 추가했습니다. 참고 자료와 생성 설정을 AI로 분석한 결과가 아닙니다.`);
  }
  function remove(id: string) {
    if (id === 'all') { setRemoved({ items: drafts, index: 0 }); setDrafts([]); setEditing(null); }
    else {
      const index = drafts.findIndex(item => item.id === id); const item = drafts[index];
      if (!item) return;
      setRemoved({ items: [item], index }); setDrafts(previous => previous.filter(value => value.id !== id));
      if (editing?.id === id) setEditing(null);
    }
    setConfirmDelete(null); setMessage('예시 퀴즈를 삭제했습니다. 삭제 취소로 복원할 수 있습니다.');
  }
  function restore() {
    if (!removed) return;
    setDrafts(previous => [...previous.slice(0, removed.index), ...removed.items, ...previous.slice(removed.index)]);
    setRemoved(null); setMessage('삭제한 예시 퀴즈를 복원했습니다.');
  }
  function saveEdit() {
    if (!editing) return;
    if (!editing.question.trim() || editing.options.some(option => !option.trim()) || !editing.explanation.trim()) { setEditError('문제, 보기, 정답 해설을 모두 입력해 주세요.'); return; }
    setDrafts(previous => previous.map(item => item.id === editing.id ? editing : item)); setEditing(null); setEditError(''); setMessage('예시 퀴즈의 수정 내용을 화면에 반영했습니다.');
  }

  return <div className="aq-studio">
    <div className="aq-title"><span className="aq-title-icon"><Sparkles size={20}/></span><div><h3>자료로 시작하는 AI 퀴즈</h3><p>학습 자료를 넣고, 퀴즈 초안을 검토하는 흐름을 확인하세요.</p></div><span className="aq-demo-badge">화면 예시</span></div>
    <p className="aq-demo-note">실제 AI를 호출하지 않으며 미리 작성된 엑셀 퀴즈를 표시합니다. 첨부 파일과 입력 내용은 전송·분석·저장하지 않습니다.</p>
    <div className="aq-source-heading"><h4><span>1</span>생성에 참고할 자료</h4><button className="text-button" type="button" onClick={() => { setMaterial(sampleText); setMessage('예시 학습 내용을 입력했습니다.'); }}>예시 자료 넣기<Plus size={14}/></button></div>
    <div className="aq-content-context"><FileText size={16}/><span>연결 콘텐츠</span><strong>{contentTitle || '새 콘텐츠'}</strong></div>
    <input id={inputId} ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.xlsx,.csv" aria-label="AI 퀴즈 참고 파일 선택" onChange={(event: ChangeEvent<HTMLInputElement>) => { addFiles(event.target.files); event.target.value = ''; }}/>
    <button type="button" className={`aq-dropzone ${dragging ? 'is-dragging' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event: DragEvent) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><UploadCloud size={25}/><strong>클릭하거나 참고 자료를 끌어 놓으세요</strong><span>PDF, Word, PPT, TXT, MD, Excel, CSV · 파일당 최대 10MB</span><small>강의안, 영상 대본, 실습 설명 등을 첨부하는 화면입니다.</small></button>
    {fileError && <p className="field-error" role="alert">{fileError}</p>}
    {references.length > 0 && <ul className="aq-files" aria-label="선택한 참고 파일">{references.map(file => <li key={file.id}><FileText size={19}/><div><strong>{file.name}</strong><span>{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)}KB` : `${(file.size / (1024 * 1024)).toFixed(1)}MB`} · 전송하지 않은 로컬 파일</span></div><button className="icon-button" type="button" aria-label={`${file.name} 참고 자료 제거`} onClick={() => { setReferences(previous => previous.filter(item => item.id !== file.id)); setMessage('참고 파일을 목록에서 제거했습니다.'); }}><X size={16}/></button></li>)}</ul>}
    <label className="aq-label" htmlFor={`${inputId}-text`}>참고 내용 직접 입력<span>파일 대신 입력해도 돼요</span></label>
    <textarea id={`${inputId}-text`} rows={5} maxLength={10000} value={material} onChange={event => setMaterial(event.target.value)} placeholder="영상 대본이나 학습 내용을 붙여 넣어주세요. 예: SUM 함수는 지정한 셀 범위의 합계를 계산합니다."/>
    <div className="aq-settings"><label>문제 유형<span className="aq-type"><Layers3 size={16}/>객관식 · 4지선다</span></label><label>문항 수<select value={count} onChange={event => setCount(Number(event.target.value))}><option value={1}>1문항</option><option value={3}>3문항</option><option value={5}>5문항</option></select></label><label>난이도<select value={difficulty} onChange={event => setDifficulty(event.target.value)}><option>기초</option><option>응용</option></select></label></div>
    <label className="aq-label" htmlFor={`${inputId}-request`}>추가 요청<span>선택</span></label><textarea id={`${inputId}-request`} rows={2} maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="예: 실무 상황을 중심으로 출제하고, 오답 이유도 설명해 주세요."/>
    <div className="aq-generate-row"><span>{hasMaterial ? '자료가 준비됐어요. 퀴즈 예시를 확인해보세요.' : '참고 파일이나 텍스트를 넣으면 시작할 수 있어요.'}<small>난이도·요청에 따른 실제 문항 생성은 연결하지 않았습니다.</small></span><button className="button primary" type="button" onClick={generate} disabled={!hasMaterial}><Sparkles size={17}/>AI 퀴즈 생성</button></div>
    <div className="aq-drafts-heading"><div><h4><span>2</span>퀴즈 초안 검토<span className="aq-count">{drafts.length}</span></h4><p>문제·정답·해설을 확인하고 수정하거나 삭제하세요.</p></div>{drafts.length > 0 && <button className="text-button danger" type="button" onClick={() => setConfirmDelete('all')}><Trash2 size={14}/>전체 삭제</button>}</div>
    {confirmDelete === 'all' && <div className="aq-delete-confirm" role="alert"><span>예시 퀴즈 {drafts.length}개를 모두 삭제할까요?</span><div><button className="button" type="button" onClick={() => setConfirmDelete(null)}>취소</button><button className="button aq-danger" type="button" onClick={() => remove('all')}>전체 삭제</button></div></div>}
    {message && <div className="aq-status" role="status"><CheckCircle2 size={16}/><span>{message}</span>{removed && <button className="text-button" type="button" onClick={restore}><RotateCcw size={14}/>삭제 취소</button>}</div>}
    {drafts.length === 0 ? <div className="aq-empty"><Sparkles size={25}/><h4>아직 생성한 퀴즈가 없어요</h4><p>참고 자료를 넣고 AI 퀴즈 생성을 눌러보세요.<br/>생성 예시를 이곳에서 검토할 수 있어요.</p></div> : <div className="aq-drafts">{drafts.map((draft, index) => <article className="aq-draft" key={draft.id} aria-label={`퀴즈 초안 ${index + 1}`}><div className="aq-card-heading"><div><span className="aq-question-number">Q{String(index + 1).padStart(2,'0')}</span><span className="aq-tag">객관식</span><span className="aq-tag">{draft.difficulty}</span><span className="aq-tag aq-sample-tag">예시</span></div><div className="aq-card-actions"><button className="icon-button" type="button" aria-label={`퀴즈 ${index + 1} 수정`} onClick={() => { setEditing({ ...draft, options: [...draft.options] }); setEditError(''); setConfirmDelete(null); }}><Pencil size={16}/></button><button className="icon-button aq-delete-icon" type="button" aria-label={`퀴즈 ${index + 1} 삭제`} onClick={() => setConfirmDelete(draft.id)}><Trash2 size={16}/></button></div></div>
      {confirmDelete === draft.id && <div className="aq-delete-confirm" role="alert"><span>이 퀴즈를 삭제할까요?</span><div><button className="button" type="button" onClick={() => setConfirmDelete(null)}>취소</button><button className="button aq-danger" type="button" onClick={() => remove(draft.id)}>삭제</button></div></div>}
      {editing?.id === draft.id ? <div className="aq-edit"><label className="aq-label" htmlFor={`${draft.id}-question`}>문제</label><textarea id={`${draft.id}-question`} value={editing.question} maxLength={2000} rows={3} onChange={event => setEditing({ ...editing, question: event.target.value })}/><span className="aq-label">보기와 정답</span><div className="aq-edit-options" role="radiogroup" aria-label={`퀴즈 ${index + 1} 정답 선택`}>{editing.options.map((option, optionIndex) => <div key={optionIndex}><input type="radio" name={`answer-${draft.id}`} aria-label={`초안 ${index + 1} 보기 ${optionIndex + 1} 정답`} checked={editing.correctIndex === optionIndex} onChange={() => setEditing({ ...editing, correctIndex: optionIndex })}/><input aria-label={`초안 ${index + 1} 보기 ${optionIndex + 1} 내용`} maxLength={500} value={option} onChange={event => setEditing({ ...editing, options: editing.options.map((text, itemIndex) => itemIndex === optionIndex ? event.target.value : text) })}/></div>)}</div><label className="aq-label" htmlFor={`${draft.id}-explanation`}>정답 해설</label><textarea id={`${draft.id}-explanation`} rows={4} maxLength={3000} value={editing.explanation} onChange={event => setEditing({ ...editing, explanation: event.target.value })}/>{editError && <p className="field-error" role="alert">{editError}</p>}<div className="aq-edit-footer"><button className="button" type="button" onClick={() => { setEditing(null); setEditError(''); }}>취소</button><button className="button primary" type="button" onClick={saveEdit}><Check size={16}/>수정 반영</button></div></div> : <><h5>{draft.question}</h5><ol className="aq-choice-list">{draft.options.map((option, optionIndex) => <li className={draft.correctIndex === optionIndex ? 'correct' : ''} key={optionIndex}><span>{optionIndex + 1}</span><p>{option}</p>{draft.correctIndex === optionIndex && <small><Check size={13}/>정답</small>}</li>)}</ol><div className="aq-explanation"><strong>정답 해설</strong><p>{draft.explanation}</p></div></>}
    </article>)}</div>}
    <p className="aq-bottom-note">참고 자료와 퀴즈 초안은 이 화면에서만 유지됩니다. 새로고침하면 초기화되며, 아래 콘텐츠 퀴즈 입력란이나 저장 버튼과 연결되지 않습니다.</p>
    <div className="aq-manual-label"><ChevronDown size={16}/><span>콘텐츠에 등록할 퀴즈는 아래에서 직접 입력할 수 있습니다.</span></div>
  </div>;
}
