import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { categories, levelLabels, type Course, ServiceError, emptyCourse, statusLabels } from '../../../domain/model';
import { repository } from '../../../data/repository';
import { useApp } from '../context';
import { toError } from '../../../shared/format';
import { PageHeading, Loading, ErrorBox, SectionHeading, Field } from '../../../shared/ui';
import { UploadField } from '../media/UploadField';

export function CourseEditor() {
  const { id } = useParams(); const navigate = useNavigate(); const { setDirty, handleError, notify, authEpoch } = useApp();
  const [value, setValue] = useState<Course>(emptyCourse); const [loading, setLoading] = useState(!!id); const [busy, setBusy] = useState(false); const [uploads, setUploads] = useState(0); const [error, setError] = useState<ServiceError | null>(null); const loaded = useRef(false); const [retry, setRetry] = useState(0); const requestLock = useRef(false);
  useEffect(() => { if (!id || loaded.current) return; let active = true; setLoading(true); setError(null); repository.course(id).then(course => { if (active) { setValue(course); loaded.current = true; setError(null); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, handleError, authEpoch, retry]);
  const change = <K extends keyof Course,>(key: K, text: Course[K]) => { setValue(v => ({ ...v, [key]: text })); setError(null); setDirty(true); };
  return <><Link className="back-link" to="/admin/courses"><ArrowLeft size={16}/>과정 목록</Link><PageHeading title={id ? '과정 수정' : '새 과정 등록'} description="학습자가 무엇을 배울 수 있는지 알려주세요."/>{loading ? <Loading/> : id && !loaded.current ? <ErrorBox error={error} retry={() => setRetry(n => n + 1)}/> : <form className="course-form panel" onSubmit={async event => {
    event.preventDefault(); if (busy || uploads || requestLock.current) return; requestLock.current = true; setBusy(true); setError(null);
    try { const saved = await repository.saveCourse(value, !id); setDirty(false); notify('과정이 저장되었습니다.'); setValue(saved); loaded.current = true; navigate(`/admin/courses/${saved.id}`, { replace: true }); }
    catch (e) { setError(toError(e)); handleError(e); } finally { requestLock.current = false; setBusy(false); }
  }}><fieldset disabled={busy || uploads > 0}><SectionHeading number="01" title="과정 기본 정보" description="과정의 분야와 학습 방향을 설정합니다."/>
    <Field label="과정명" required><input required maxLength={100} value={value.title} onChange={e => change('title', e.target.value)} placeholder="예: 신입 직장인을 위한 엑셀 기초"/></Field>
    <Field label="과정 소개"><textarea rows={3} maxLength={500} value={value.summary} onChange={e => change('summary', e.target.value)}/></Field>
    <Field label="학습 목표" hint="과정 공개 시 필요합니다."><textarea rows={3} maxLength={500} value={value.learningGoal} onChange={e => change('learningGoal', e.target.value)}/></Field>
    <div className="three-fields"><Field label="교육 분야" required><select value={value.categoryId} onChange={e => change('categoryId', e.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{c.categoryType === 'JOB' ? '직무별' : '공통 실무'} · {c.name}</option>)}</select></Field>
    <Field label="난이도"><select value={value.level} onChange={e => change('level', e.target.value as Course['level'])}>{Object.entries(levelLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
    <Field label="과정 공개 상태"><select value={value.status} onChange={e => change('status', e.target.value as Course['status'])}>{(['DRAFT', 'PUBLISHED', 'HIDDEN'] as const).map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}</select></Field></div>
    <p className="help">공개하려면 학습 목표와 공개된 콘텐츠가 1개 이상 필요합니다. 과정 안의 콘텐츠를 먼저 공개한 뒤 과정 상태를 변경하세요.</p>
    {value.legacyClassification && <p className="help">이전 분류: {value.legacyClassification.job} · {value.legacyClassification.topic}</p>}
    <UploadField kind="thumbnail" label="과정 썸네일" media={value.thumbnail} onChange={media => change('thumbnail', media)} onBusy={isBusy => { setUploads(n => n + (isBusy ? 1 : -1)); if (isBusy) setDirty(true); }}/>
    </fieldset><ErrorBox error={error}/><div className="form-bottom"><Link className="button" to="/admin/courses">목록으로</Link><button className="button primary" disabled={busy || uploads > 0}>{busy ? '저장 중…' : id ? '수정 저장' : '과정 등록 저장'}</button></div></form>}</>;
}

export function CourseById() { const { id } = useParams(); return <CourseEditor key={id}/>; }
