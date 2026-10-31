import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { statusLabels, type Catalog, type SearchTag, type WorkResource } from '../../../domain/model';
import { catalogRepository, repository, dataMode } from '../../../data/repository';
import { ErrorBox, Field as FormField } from '../../../shared/ui';
import { useApp } from '../context';
import { toError } from '../../../shared/format';
import { ServiceError } from '../../../domain/model';
import { useMetadata, MetadataStatus } from '../metadata';
import { tagLabels, resourceLabels } from './labels';
export function CatalogPage({ kind }: { kind: 'tags' | 'resources' }) {
  const { setDirty, handleError, authEpoch } = useApp();
  return <CatalogManager key={kind} kind={kind} onDirty={setDirty} onError={handleError} authEpoch={authEpoch}/>;
}

const newTag = (): SearchTag => ({ id: crypto.randomUUID(), name: '', tagType: 'SITUATION', synonyms: [] });
const newResource = (): WorkResource => ({ id: crypto.randomUUID(), title: '', resourceType: 'TEMPLATE', description: '', file: null, promptText: '', categoryId: '', status: 'DRAFT' });
export function CatalogManager({ kind, onDirty, onError, authEpoch }: { kind: 'tags' | 'resources'; onDirty: (dirty: boolean) => void; onError: (error: unknown) => void; authEpoch: number }) {
  const metadata = useMetadata(); const { categories } = metadata;
  const [catalog, setCatalog] = useState<Catalog | null>(null); const [error, setError] = useState<ServiceError | null>(null); const [retry, setRetry] = useState(0); const [loading, setLoading] = useState(true); const [message, setMessage] = useState('');
  const [tag, setTag] = useState(newTag); const [resource, setResource] = useState(newResource); const [synonyms, setSynonyms] = useState('');
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const isTag = kind === 'tags';
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    catalogRepository.read().then(data => { if (active) setCatalog(data); })
      .catch(e => { if (active) { setError(toError(e)); onError(e); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authEpoch, onError, retry]);
  const changed = () => { setDirty(true); onDirty(true); setMessage(''); setError(null); };
  const changeResource = (patch: Partial<WorkResource>) => { setResource(r => ({ ...r, ...patch })); changed(); };
  function select(nextTag?: SearchTag, nextResource?: WorkResource) {
    if (dirty && !window.confirm('저장하지 않은 내용을 버리고 이동할까요?')) return;
    setTag(nextTag ?? newTag()); setSynonyms(nextTag?.synonyms.join('\n') ?? ''); setResource(nextResource ?? newResource()); setDirty(false); onDirty(false); setMessage(''); setError(null);
  }
  async function save() {
    if (busy || (!isTag && !metadata.ready)) return; setBusy(true); setError(null);
    try {
      if (isTag) { const saved = await catalogRepository.saveTag({ ...tag, synonyms: synonyms.split('\n').map(v => v.trim()).filter(Boolean) }); setTag(saved); setSynonyms(saved.synonyms.join('\n')); setCatalog(current => current && ({ ...current, tags: [...current.tags.filter(t => t.id !== tag.id && t.id !== saved.id), saved] })); }
      else { const saved = await catalogRepository.saveResource(resource); setResource(saved); setCatalog(current => current && ({ ...current, resources: [...current.resources.filter(r => r.id !== resource.id && r.id !== saved.id), saved] })); }
      setDirty(false); onDirty(false); setMessage(dataMode === 'api' ? '서버에 저장했습니다.' : '이 브라우저에 저장했습니다.');
    } catch (e) { setError(toError(e)); onError(e); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>{isTag ? '검색 태그 관리' : '실무자료 관리'}</h1><p className="page-description">{isTag ? '업무 상황·오류·함수·툴과 같은 뜻의 검색어를 관리합니다.' : '템플릿·예시 문서·프롬프트를 등록하고 콘텐츠에 연결합니다.'}</p></div><button className="button" disabled={busy} onClick={() => select()}><Plus size={17}/>새로 등록</button></div>
    {!isTag && <MetadataStatus/>}<ErrorBox error={error} retry={!catalog ? () => setRetry(n => n + 1) : undefined}/>{message && <p className="wf-message" role="status">{message}</p>}
    <div className="wf-catalog-layout"><section className="panel wf-catalog-list" aria-label={isTag ? '등록된 태그' : '등록된 자료'}><h2>{isTag ? '등록된 태그' : '등록된 자료'}</h2>{catalog ? isTag ? catalog.tags.map(t => <button className={`wf-record ${t.id === tag.id ? 'active' : ''}`} key={t.id} disabled={busy} onClick={() => select(t)}><strong>{t.name}</strong><small>{tagLabels[t.tagType]} · 동의어 {t.synonyms.length}개</small></button>) : catalog.resources.map(r => <button className={`wf-record ${r.id === resource.id ? 'active' : ''}`} key={r.id} disabled={busy} onClick={() => select(undefined, r)}><strong>{r.title}</strong><small>{resourceLabels[r.resourceType]} · {statusLabels[r.status]}</small></button>) : <p className="help">{loading ? '불러오는 중…' : '목록을 불러오지 못했습니다. 다시 시도해 주세요.'}</p>}{catalog && !(isTag ? catalog.tags.length : catalog.resources.length) && <p className="help">등록한 항목이 없습니다.</p>}</section>
    <form className="panel wf-catalog-form" onSubmit={e => { e.preventDefault(); void save(); }}><h2>{isTag ? '태그 정보' : '자료 정보'}</h2><fieldset disabled={busy || loading || !catalog || (!isTag && !metadata.ready)}>{isTag ? <>
      <FormField label="대표 태그"><input required maxLength={50} value={tag.name} onChange={e => { setTag({ ...tag, name: e.target.value }); changed(); }}/></FormField>
      <FormField label="태그 유형"><select value={tag.tagType} onChange={e => { setTag({ ...tag, tagType: e.target.value as SearchTag['tagType'] }); changed(); }}>{Object.entries(tagLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></FormField>
      <FormField label="동의어 (한 줄에 하나)"><textarea rows={5} value={synonyms} placeholder={'부서별 합계\n항목별 합계'} onChange={e => { setSynonyms(e.target.value); changed(); }}/></FormField>
    </> : <>
      <FormField label="자료 제목"><input required maxLength={100} value={resource.title} onChange={e => changeResource({ title: e.target.value })}/></FormField>
      <FormField label="자료 유형"><select value={resource.resourceType} onChange={e => changeResource({ resourceType: e.target.value as WorkResource['resourceType'] })}>{Object.entries(resourceLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></FormField>
      <FormField label="자료 설명"><textarea rows={3} maxLength={500} value={resource.description} onChange={e => changeResource({ description: e.target.value })}/></FormField>
      {resource.resourceType === 'PROMPT' ? <FormField label="프롬프트 본문"><textarea required rows={6} value={resource.promptText} onChange={e => changeResource({ promptText: e.target.value })}/></FormField> : <><FormField label="자료 파일"><input type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.txt" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || busy) return; changed(); setBusy(true); setError(null); try { const media = await repository.upload(file, 'resource'); changeResource({ file: media }); } catch (error) { setError(toError(error)); onError(error); } finally { setBusy(false); } }}/></FormField>{resource.file && <p className="wf-file">{resource.file.name}<button className="text-button" type="button" onClick={() => changeResource({ file: null })}>파일 제거</button></p>}</>}
      <div className="wf-grid"><FormField label="자료 분야"><select value={resource.categoryId} onChange={e => changeResource({ categoryId: e.target.value })}><option value="">분야 미지정</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField><FormField label="자료 공개 상태"><select value={resource.status} onChange={e => changeResource({ status: e.target.value as WorkResource['status'] })}>{(['DRAFT', 'PUBLISHED', 'HIDDEN'] as const).map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}</select></FormField></div>
    </>}<button className="button primary" disabled={busy || loading || !catalog || (!isTag && !metadata.ready)}>{busy ? '저장 중…' : '저장'}</button></fieldset></form></div></>;
}
