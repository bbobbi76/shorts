import { cloneElement, isValidElement, useEffect, useId, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { categories, categoryName, skills, statusLabels, emptyFeedback, type Catalog, type Content, type SearchTag, type WorkResource, type Subtitle } from './model';
import { catalogRepository, repository } from './repository';
import './workfit.css';

const tagLabels = { SITUATION: '업무 상황', ERROR: '오류 메시지', FUNCTION: '함수', TOOL: '툴' };
const resourceLabels = { TEMPLATE: '템플릿', EXAMPLE_DOC: '예시 문서', PROMPT: '프롬프트' };
function FormField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="wf-field"><label htmlFor={id}>{label}</label>{isValidElement<Record<string, unknown>>(children) ? cloneElement(children, { id }) : children}</div>;
}

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

const newTag = (): SearchTag => ({ id: crypto.randomUUID(), name: '', tagType: 'SITUATION', synonyms: [] });
const newResource = (): WorkResource => ({ id: crypto.randomUUID(), title: '', resourceType: 'TEMPLATE', description: '', file: null, promptText: '', categoryId: '', status: 'DRAFT' });
export function CatalogManager({ kind, onDirty, onError, authEpoch }: { kind: 'tags' | 'resources'; onDirty: (dirty: boolean) => void; onError: (error: unknown) => void; authEpoch: number }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [tag, setTag] = useState(newTag); const [resource, setResource] = useState(newResource); const [synonyms, setSynonyms] = useState('');
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const isTag = kind === 'tags';
  useEffect(() => { let active = true; catalogRepository.read().then(data => { if (active) setCatalog(data); }).catch(e => { if (active) { setError(e.message); onError(e); } }); return () => { active = false; }; }, [authEpoch, onError]);
  const changed = () => { setDirty(true); onDirty(true); setMessage(''); setError(''); };
  const changeResource = (patch: Partial<WorkResource>) => { setResource(r => ({ ...r, ...patch })); changed(); };
  function select(nextTag?: SearchTag, nextResource?: WorkResource) {
    if (dirty && !window.confirm('저장하지 않은 내용을 버리고 이동할까요?')) return;
    setTag(nextTag ?? newTag()); setSynonyms(nextTag?.synonyms.join('\n') ?? ''); setResource(nextResource ?? newResource()); setDirty(false); onDirty(false); setMessage(''); setError('');
  }
  async function save() {
    if (busy) return; setBusy(true); setError('');
    try {
      if (isTag) { const saved = await catalogRepository.saveTag({ ...tag, synonyms: synonyms.split('\n').map(v => v.trim()).filter(Boolean) }); setTag(saved); }
      else { const saved = await catalogRepository.saveResource(resource); setResource(saved); }
      setCatalog(await catalogRepository.read()); setDirty(false); onDirty(false); setMessage('이 브라우저에 저장했습니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); onError(e); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>{isTag ? '검색 태그 관리' : '실무자료 관리'}</h1><p className="page-description">{isTag ? '업무 상황·오류·함수·툴과 같은 뜻의 검색어를 관리합니다.' : '템플릿·예시 문서·프롬프트를 등록하고 콘텐츠에 연결합니다.'}</p></div><button className="button" disabled={busy} onClick={() => select()}><Plus size={17}/>새로 등록</button></div>
    {error && <div className="error-box" role="alert">{error}</div>}{message && <p className="wf-message" role="status">{message}</p>}
    <div className="wf-catalog-layout"><section className="panel wf-catalog-list" aria-label={isTag ? '등록된 태그' : '등록된 자료'}><h2>{isTag ? '등록된 태그' : '등록된 자료'}</h2>{catalog ? isTag ? catalog.tags.map(t => <button className={`wf-record ${t.id === tag.id ? 'active' : ''}`} key={t.id} disabled={busy} onClick={() => select(t)}><strong>{t.name}</strong><small>{tagLabels[t.tagType]} · 동의어 {t.synonyms.length}개</small></button>) : catalog.resources.map(r => <button className={`wf-record ${r.id === resource.id ? 'active' : ''}`} key={r.id} disabled={busy} onClick={() => select(undefined, r)}><strong>{r.title}</strong><small>{resourceLabels[r.resourceType]} · {statusLabels[r.status]}</small></button>) : <p className="help">불러오는 중…</p>}{catalog && !(isTag ? catalog.tags.length : catalog.resources.length) && <p className="help">등록한 항목이 없습니다.</p>}</section>
    <form className="panel wf-catalog-form" onSubmit={e => { e.preventDefault(); void save(); }}><h2>{isTag ? '태그 정보' : '자료 정보'}</h2><fieldset disabled={busy || !catalog}>{isTag ? <>
      <FormField label="대표 태그"><input required maxLength={50} value={tag.name} onChange={e => { setTag({ ...tag, name: e.target.value }); changed(); }}/></FormField>
      <FormField label="태그 유형"><select value={tag.tagType} onChange={e => { setTag({ ...tag, tagType: e.target.value as SearchTag['tagType'] }); changed(); }}>{Object.entries(tagLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></FormField>
      <FormField label="동의어 (한 줄에 하나)"><textarea rows={5} value={synonyms} placeholder={'부서별 합계\n항목별 합계'} onChange={e => { setSynonyms(e.target.value); changed(); }}/></FormField>
    </> : <>
      <FormField label="자료 제목"><input required maxLength={100} value={resource.title} onChange={e => changeResource({ title: e.target.value })}/></FormField>
      <FormField label="자료 유형"><select value={resource.resourceType} onChange={e => changeResource({ resourceType: e.target.value as WorkResource['resourceType'] })}>{Object.entries(resourceLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></FormField>
      <FormField label="자료 설명"><textarea rows={3} maxLength={500} value={resource.description} onChange={e => changeResource({ description: e.target.value })}/></FormField>
      {resource.resourceType === 'PROMPT' ? <FormField label="프롬프트 본문"><textarea required rows={6} value={resource.promptText} onChange={e => changeResource({ promptText: e.target.value })}/></FormField> : <><FormField label="자료 파일"><input type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.txt" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setBusy(true); setError(''); try { const media = await repository.upload(file, 'resource'); changeResource({ file: media }); } catch (error) { setError(error instanceof Error ? error.message : '파일을 저장하지 못했습니다.'); onError(error); } finally { setBusy(false); } }}/></FormField>{resource.file && <p className="wf-file">{resource.file.name}<button className="text-button" type="button" onClick={() => changeResource({ file: null })}>파일 제거</button></p>}</>}
      <div className="wf-grid"><FormField label="자료 분야"><select value={resource.categoryId} onChange={e => changeResource({ categoryId: e.target.value })}><option value="">분야 미지정</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField><FormField label="자료 공개 상태"><select value={resource.status} onChange={e => changeResource({ status: e.target.value as WorkResource['status'] })}>{(['DRAFT', 'PUBLISHED', 'HIDDEN'] as const).map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}</select></FormField></div>
    </>}<button className="button primary" disabled={busy || !catalog}>{busy ? '저장 중…' : '저장'}</button></fieldset></form></div></>;
}
