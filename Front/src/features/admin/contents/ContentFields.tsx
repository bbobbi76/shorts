import { Plus, Trash2 } from 'lucide-react';
import { statusLabels, emptyFeedback, type Catalog, type Content, type Subtitle } from '../../../domain/model';
import { Field as FormField } from '../../../shared/ui';
import { useMetadata } from '../metadata';
import { tagLabels, resourceLabels } from '../catalog/labels';

export function PracticeFields({ value, onChange }: { value: Content; onChange: (value: Content) => void }) {
  const p = value.practiceSettings;
  const update = (patch: Partial<Content['practiceSettings']>) => onChange({ ...value, practiceSettings: { ...p, ...patch } });
  return <div className="wf-fields">
    <FormField label="실습 제목"><input maxLength={100} value={p.title} onChange={e => update({ title: e.target.value })}/></FormField>
    <div className="wf-grid"><FormField label="결과 비교 방식"><select value={p.resultType} onChange={e => update({ resultType: e.target.value as 'NUMBER' | 'TEXT' })}><option value="NUMBER">숫자</option><option value="TEXT">텍스트</option></select></FormField><FormField label="정답 결과"><input maxLength={255} value={p.expectedResult} placeholder={p.resultType === 'NUMBER' ? '예: 4520000' : '예: 영업부'} onChange={e => update({ expectedResult: e.target.value })}/></FormField></div>
    <div className="wf-grid"><FormField label="숫자 허용 오차"><input type="number" min={0} step="0.0001" disabled={p.resultType === 'TEXT'} value={p.tolerance} onChange={e => update({ tolerance: e.target.valueAsNumber })}/></FormField><FormField label="핵심 함수"><input maxLength={50} placeholder="예: SUMIF" value={p.requiredFunction} onChange={e => update({ requiredFunction: e.target.value })}/></FormField></div>
    <FormField label="정답 수식"><input maxLength={1000} value={p.answerFormula} placeholder={'예: =SUMIF(B2:B20,"영업부",C2:C20)'} onChange={e => update({ answerFormula: e.target.value })}/></FormField>
  </div>;
}

export function FeedbackFields({ value, onChange }: { value: Content; onChange: (value: Content) => void }) {
  return <div className="wf-feedback"><h3>보기별 피드백</h3><p className="help">선택한 보기에 대한 설명과 다시 볼 영상 시점을 입력하세요.</p>{value.quiz.options.map((option, i) => {
    const feedback = value.optionFeedbacks[i] ?? emptyFeedback();
    const update = (patch: Partial<typeof feedback>) => onChange({ ...value, optionFeedbacks: value.quiz.options.map((_, index) => index === i ? { ...feedback, ...patch } : value.optionFeedbacks[index] ?? emptyFeedback()) });
    return <div className="wf-option-feedback" key={i}><strong>보기 {i + 1} · {option || '내용 미입력'}</strong><FormField label={`보기 ${i + 1} 피드백`}><textarea rows={2} value={feedback.feedback} onChange={e => update({ feedback: e.target.value, feedbackSource: e.target.value.trim() ? 'ADMIN' : 'NONE' })}/></FormField><FormField label={`보기 ${i + 1} 다시 볼 시점(초)`}><input type="number" min={0} max={value.video?.duration ? Math.floor(value.video.duration) : undefined} step={1} placeholder="선택" value={feedback.rewatchSec ?? ''} onChange={e => update({ rewatchSec: e.target.value === '' ? null : e.target.valueAsNumber })}/></FormField><small className="help">{feedback.feedbackSource === 'AI_DRAFT' ? 'AI 초안' : feedback.feedbackSource === 'ADMIN' ? '관리자 작성' : '미작성'}</small></div>;
  })}</div>;
}

export function ContentConnections({ value, catalog, onChange }: { value: Content; catalog: Catalog; onChange: (value: Content) => void }) {
  const { categories, skills } = useMetadata(); const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? '분야 확인 필요';
  const toggle = (key: 'tagIds' | 'skillIds' | 'resourceIds', id: string) => onChange({ ...value, [key]: value[key].includes(id) ? value[key].filter(v => v !== id) : [...value[key], id] });
  return <div className="wf-fields"><h3>검색 태그</h3><p className="help">태그에 등록한 동의어도 같은 검색어로 사용할 수 있습니다.</p><div className="wf-checks">{catalog.tags.map(t => <label key={t.id}><input type="checkbox" checked={value.tagIds.includes(t.id)} onChange={() => toggle('tagIds', t.id)}/><span>{t.name}<small>{tagLabels[t.tagType]}{t.synonyms.length ? ` · ${t.synonyms.join(', ')}` : ''}</small></span></label>)}</div>{!catalog.tags.length && <p className="help">검색 태그 관리에서 태그를 먼저 등록해 주세요.</p>}
    <h3>스킬</h3><div className="wf-checks">{skills.map(s => <label key={s.id}><input type="checkbox" checked={value.skillIds.includes(s.id)} onChange={() => toggle('skillIds', s.id)}/><span>{s.name}<small>{categoryName(s.categoryId)} · {s.description}</small></span></label>)}</div>
    <h3>실무자료 연결</h3><p className="help">여러 자료를 연결할 수 있습니다. 사용자에게는 공개된 자료만 표시됩니다.</p><div className="wf-checks">{catalog.resources.map(r => <label key={r.id}><input type="checkbox" checked={value.resourceIds.includes(r.id)} onChange={() => toggle('resourceIds', r.id)}/><span>{r.title}<small>{resourceLabels[r.resourceType]} · {statusLabels[r.status]}</small></span></label>)}</div>{!catalog.resources.length && <p className="help">실무자료 관리에서 파일이나 프롬프트를 등록한 후 연결해 주세요.</p>}
  </div>;
}

export function SubtitleFields({ value, onChange }: { value: Content; onChange: (value: Content) => void }) {
  const update = (id: string, patch: Partial<Subtitle>) => onChange({ ...value, subtitles: value.subtitles.map(row => row.id === id ? { ...row, ...patch } : row) });
  return <div className="wf-fields"><p className="help">자막의 시작·종료 시점을 초 단위로 입력하세요. 소수점 둘째 자리까지 저장합니다.</p>{value.subtitles.map((s, i) => <div className="wf-subtitle" key={s.id}><div className="wf-grid"><FormField label={`자막 ${i + 1} 시작(초)`}><input type="number" min={0} max={99999.99} step="0.01" value={s.startSec} onChange={e => update(s.id, { startSec: e.target.valueAsNumber })}/></FormField><FormField label={`자막 ${i + 1} 종료(초)`}><input type="number" min={0} max={99999.99} step="0.01" value={s.endSec} onChange={e => update(s.id, { endSec: e.target.valueAsNumber })}/></FormField></div><FormField label={`자막 ${i + 1} 문장`}><textarea maxLength={500} rows={2} value={s.text} onChange={e => update(s.id, { text: e.target.value })}/></FormField><button className="text-button danger" type="button" onClick={() => onChange({ ...value, subtitles: value.subtitles.filter(row => row.id !== s.id) })}><Trash2 size={15}/>자막 {i + 1} 삭제</button></div>)}<button className="text-button" type="button" onClick={() => onChange({ ...value, subtitles: [...value.subtitles, { id: crypto.randomUUID(), startSec: 0, endSec: 1, text: '' }] })}><Plus size={15}/>자막 구간 추가</button></div>;
}
