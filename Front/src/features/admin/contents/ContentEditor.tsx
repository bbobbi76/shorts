import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Eye, Plus, X } from 'lucide-react';
import { emptyFeedback, type Catalog, type Content, type Course, ServiceError, emptyContent, publicationProblems, publishIssues, statusLabels } from '../../../domain/model';
import { repository, catalogRepository, dataMode } from '../../../data/repository';
import { validateContent } from '../../../domain/validation';
import { useApp } from '../context';
import { toError, when } from '../../../shared/format';
import { PageHeading, Loading, ErrorBox, SectionHeading, Field } from '../../../shared/ui';
import { UploadField } from '../media/UploadField';
import { Modal, StatusBadge } from '../../../shared/ui';
import { ContentPreview } from './ContentPreview';
import AdminQuizStudio from '../quiz/AdminQuizStudio';
import { PracticeFields, FeedbackFields, ContentConnections, SubtitleFields } from './ContentFields';

export function ContentEditor() {
  const location = useLocation();
  const publicationError = useRef(location.state?.publicationError as { message: string; status: number; fields: string[] } | undefined);
  const { id } = useParams(); const navigate = useNavigate(); const { setDirty, handleError, notify, authEpoch } = useApp();
  const [value, setValue] = useState<Content>(emptyContent); const [courses, setCourses] = useState<Course[]>([]); const [catalog, setCatalog] = useState<Catalog>({ tags: [], resources: [] });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [uploads, setUploads] = useState(0); const [error, setError] = useState<ServiceError | null>(null); const [preview, setPreview] = useState(false); const [retry, setRetry] = useState(0); const loaded = useRef(false); const created = useRef(false); const requestLock = useRef(false); const [showValidation, setShowValidation] = useState(false);
  useEffect(() => { let active = true; const alreadyLoaded = loaded.current; if (!alreadyLoaded) setLoading(true); Promise.all([repository.courses(), id && !alreadyLoaded ? repository.content(id) : Promise.resolve(null), catalogRepository.read()]).then(([list, content, catalog]) => { if (active) { setCourses(list); setCatalog(catalog); if (content) setValue(content); loaded.current = true; if (!alreadyLoaded) { const failure = publicationError.current; setError(failure ? new ServiceError(failure.message, failure.status, failure.fields) : null); publicationError.current = undefined; } } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, handleError, authEpoch, retry]);
  const change = <K extends keyof Content,>(key: K, update: Content[K]) => { setValue(v => ({ ...v, [key]: update })); setError(null); setDirty(true); };
  const quiz = (update: Partial<Content['quiz']>) => change('quiz', { ...value.quiz, ...update });
  const issues = publishIssues(value, courses); const fieldErrors = showValidation ? publicationProblems(value, courses) : {}; const locked = busy || uploads > 0;
  useEffect(() => { if (uploads > 0) setDirty(true); }, [uploads, setDirty]);
  const sections = ['기본 정보', '영상·썸네일', 'AI 퀴즈', '실습', '태그·자료', '자막'];
  const updateContent = (next: Content) => { setValue(next); setDirty(true); setError(null); };
  async function save(action: 'save' | 'publish' | 'unpublish') {
    if (locked || requestLock.current) return;
    setError(null);
    if (action === 'publish' || value.status === 'PUBLISHED') setShowValidation(true);
    if ((action === 'publish' || (value.status === 'PUBLISHED' && action === 'save')) && issues.length) { setError(new ServiceError('공개에 필요한 항목을 확인해 주세요.', 422, issues)); return; }
    requestLock.current = true; setBusy(true);
    let savedId: string | undefined;
    try {
      if (action === 'unpublish') {
        const final = await repository.transition(value.id, 'unpublish');
        setValue(current => ({ ...current, status: final.status, updatedAt: final.updatedAt }));
        notify('비공개로 변경했습니다. 작성 중인 변경사항은 수정 저장해 주세요.');
        return;
      }
      validateContent(value, { ...catalog, courses });
      // Save content first. If publication fails, keep the returned ID to avoid duplicate creation.
      const saved = await repository.saveContent(value, !id && !created.current);
      created.current = true; savedId = saved.id;
      setValue(saved); setDirty(false);
      if (action !== 'save') { const final = await repository.transition(saved.id, action); setValue(final); }
      notify(action === 'publish' ? (courses.find(c => c.id === saved.courseId)?.status === 'PUBLISHED' ? '콘텐츠를 공개했습니다.' : '콘텐츠를 공개했습니다. 사용자에게 표시하려면 소속 과정도 공개해 주세요.') : '콘텐츠가 저장되었습니다.');
      if (id !== saved.id || location.state?.publicationError) navigate(`/admin/contents/${saved.id}`, { replace: true, state: null });
    } catch (e) {
      const failure = toError(e); setError(failure); handleError(e);
      if (savedId && id !== savedId) navigate(`/admin/contents/${savedId}`, { replace: true, state: { publicationError: { message: `콘텐츠는 저장했지만 공개하지 못했습니다. ${failure.message}`, status: failure.status, fields: failure.fields } } });
    }
    finally { requestLock.current = false; setBusy(false); }
  }
  return <><Link className="back-link" to="/admin/contents"><ArrowLeft size={16}/>콘텐츠 목록</Link><PageHeading eyebrow="CONTENT EDITOR" title={id ? '콘텐츠 수정' : '새 콘텐츠 등록'} description="영상과 퀴즈, 실무자료를 연결해 하나의 배움을 만들어 보세요.">{!loading && <StatusBadge status={value.status}/>}</PageHeading>
    {loading ? <Loading/> : !loaded.current ? <ErrorBox error={error} retry={() => setRetry(n => n + 1)}/> : <div className="editor-layout"><div className="editor-main">
      <div className="editor-steps">{sections.map((section, index) => <a key={section} href={`#section-${index + 1}`}><span>{String(index + 1).padStart(2, '0')}</span>{section}</a>)}</div>
      <fieldset disabled={locked}>
      <section className="panel form-section" id="section-1"><SectionHeading number="01" title="기본 정보" description="콘텐츠가 속한 과정과 학습 내용을 입력해 주세요."/>
        <Field label="소속 과정" required error={fieldErrors.courseId} hint={!courses.length ? '먼저 과정 관리에서 과정을 등록해 주세요.' : undefined}><select value={value.courseId} onChange={e => change('courseId', e.target.value)}><option value="">과정을 선택해 주세요</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
        <Field label="콘텐츠 제목" required error={fieldErrors.title}><input maxLength={100} placeholder="예: SUMIF 함수로 조건별 합계 구하기" value={value.title} onChange={e => change('title', e.target.value)}/></Field>
        <Field label="학습 목표"><textarea rows={3} maxLength={500} placeholder="이 영상을 보고 할 수 있는 일을 적어주세요." value={value.learningGoal} onChange={e => change('learningGoal', e.target.value)}/></Field>
        <Field label="활용 업무"><input maxLength={255} value={value.workUse} placeholder="예: 부서별 매출 합계 계산" onChange={e => change('workUse', e.target.value)}/></Field>
        <div className="wf-grid"><Field label="과정 내 순서"><input type="number" min={0} step={1} value={value.sortOrder} onChange={e => change('sortOrder', e.target.valueAsNumber)}/></Field>
        <Field label="작업 상태" hint={value.status === 'PUBLISHED' ? '공개 중에는 비공개로 변경 후 작업 상태를 수정할 수 있습니다.' : '임시저장 버튼으로 상태를 저장합니다.'}><select disabled={value.status === 'PUBLISHED'} value={value.status} onChange={e => change('status', e.target.value as Content['status'])}>{(['DRAFT', 'REVIEW', 'HIDDEN', ...(value.status === 'PUBLISHED' ? ['PUBLISHED'] : [])] as Content['status'][]).map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}</select></Field></div>
        <p className="help">영상 버전 {value.version} · 영상을 교체하고 저장하면 버전이 올라갑니다.</p>
      </section>
      <section className="panel form-section" id="section-2"><SectionHeading number="02" title="영상·썸네일" description="세로형 숏폼 영상과 대표 이미지를 등록해 주세요."/><div className="media-grid"><UploadField kind="video" label="숏폼 영상" validationError={fieldErrors.video} media={value.video} onChange={media => change('video', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/><UploadField kind="thumbnail" label="썸네일" media={value.thumbnail} onChange={media => change('thumbnail', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/></div><p className="help">MP4 100MB · 썸네일 5MB · 예제·자료 20MB까지 선택할 수 있습니다.</p></section>
      <section className="panel form-section" id="section-3"><SectionHeading number="03" title="AI 퀴즈·확인 퀴즈" description="참고 자료로 퀴즈 초안을 만들고, 학습 내용을 확인할 문제를 관리하세요."/><AdminQuizStudio contentTitle={value.title}/><h3>콘텐츠 퀴즈 직접 입력</h3>
        <Field label="퀴즈 문제" required error={fieldErrors.question}><textarea rows={2} maxLength={500} placeholder="예: 특정 부서의 매출만 합산할 때 사용하는 함수는?" value={value.quiz.question} onChange={e => quiz({ question: e.target.value })}/></Field>
        <div className="field"><span className="field-label">보기 및 정답<span className="required">*</span></span><p className="help">정답 왼쪽의 원을 선택해 주세요.</p><div className="quiz-options" role="radiogroup" aria-label="퀴즈 정답" aria-required="true" aria-invalid={!!(fieldErrors.options || fieldErrors.correctIndex)} aria-describedby={fieldErrors.options || fieldErrors.correctIndex ? "quiz-option-errors" : undefined}>{value.quiz.options.map((option, index) => <div className="quiz-option" key={index}><input type="radio" name="correctAnswer" aria-label={`보기 ${index + 1} 정답`} checked={value.quiz.correctIndex === index} onChange={() => quiz({ correctIndex: index })}/><span>{index + 1}</span><input aria-label={`보기 ${index + 1}`} value={option} maxLength={255} placeholder={`보기 ${index + 1}`} onChange={e => quiz({ options: value.quiz.options.map((text, i) => i === index ? e.target.value : text) })}/>{value.quiz.options.length > 2 && <button className="icon-button" type="button" aria-label={`보기 ${index + 1} 삭제`} onClick={() => updateContent({ ...value, optionFeedbacks: value.optionFeedbacks.filter((_, i) => i !== index), quiz: { ...value.quiz, options: value.quiz.options.filter((_, i) => i !== index), correctIndex: value.quiz.correctIndex === index ? -1 : value.quiz.correctIndex > index ? value.quiz.correctIndex - 1 : value.quiz.correctIndex } })}><X size={16}/></button>}</div>)}</div>{(fieldErrors.options || fieldErrors.correctIndex) && <div id="quiz-option-errors" className="field-error">{fieldErrors.options && <p>{fieldErrors.options}</p>}{fieldErrors.correctIndex && <p>{fieldErrors.correctIndex}</p>}</div>}{value.quiz.options.length < 4 && <button className="text-button" type="button" onClick={() => updateContent({ ...value, optionFeedbacks: [...value.optionFeedbacks, emptyFeedback()], quiz: { ...value.quiz, options: [...value.quiz.options, ''] } })}><Plus size={15}/>보기 추가</button>}</div>
        <Field label="정답 해설" required error={fieldErrors.explanation}><textarea rows={3} maxLength={3000} value={value.quiz.explanation} placeholder="왜 정답인지, 어떤 개념을 복습하면 좋은지 적어주세요." onChange={e => quiz({ explanation: e.target.value })}/></Field>
        <FeedbackFields value={value} onChange={updateContent}/>
      </section>
      <section className="panel form-section" id="section-4"><SectionHeading number="04" title="선택 실습" description="실습 안내와 정답을 비교할 기준을 입력해 주세요."/><span className="optional-label">선택 항목</span><PracticeFields value={value} onChange={updateContent}/><Field label="선택 실습 안내"><textarea rows={3} value={value.practiceText} onChange={e => change('practiceText', e.target.value)}/></Field><UploadField kind="practice" label="실습 예제 파일" media={value.practice} onChange={media => change('practice', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/></section>
      <section className="panel form-section" id="section-5"><SectionHeading number="05" title="태그·스킬·실무자료" description="검색과 학습에 필요한 항목을 연결해 주세요."/><ContentConnections value={value} catalog={catalog} onChange={updateContent}/></section>
      <section className="panel form-section" id="section-6"><SectionHeading number="06" title="자막 구간" description="영상에서 설명하는 내용을 구간별로 정리합니다."/><SubtitleFields value={value} onChange={updateContent}/></section>
      </fieldset>
      <ErrorBox error={error}/><div className="editor-actionbar"><span>{uploads > 0 ? '파일 업로드 중…' : busy ? (dataMode === 'api' ? '서버에 저장하고 있어요…' : '브라우저에 저장하고 있어요…') : `최근 저장 · ${when(value.updatedAt)}`}</span><div className="button-row"><button className="button" disabled={locked} onClick={() => void save('save')}>{id ? '수정 저장' : '임시저장'}</button>{value.status === 'PUBLISHED' ? <button className="button primary" disabled={locked} onClick={() => void save('unpublish')}>비공개로 변경</button> : <button className="button primary" disabled={locked} onClick={() => void save('publish')}><Check size={17}/>공개하기</button>}</div></div>
    </div><aside className="editor-aside"><section className="panel publish-panel"><h2>공개 전 체크리스트</h2>{value.courseId && courses.find(c => c.id === value.courseId)?.status !== 'PUBLISHED' && <p className="help">소속 과정이 공개되지 않았습니다. 콘텐츠와 과정을 모두 공개해야 사용자에게 표시됩니다.</p>}<p>학습자를 만나기 전,<br/>필수 항목을 확인해 주세요.</p><ul>{[{ name: '소속 과정', ready: courses.some(c => c.id === value.courseId) }, { name: '콘텐츠 제목', ready: !!value.title.trim() }, { name: '재생 가능한 영상', ready: !!value.video?.duration }, { name: '퀴즈·보기·정답·해설', ready: !issues.some(i => i.includes('퀴즈')) }].map(item => <li key={item.name} className={item.ready ? 'ready' : ''}><span>{item.ready ? <Check size={13}/> : <i/>}</span>{item.name}</li>)}</ul><button className="button full" disabled={locked} onClick={() => setPreview(true)}><Eye size={17}/>학습 화면 미리보기</button><p className="help">현재 입력 내용으로 미리 봅니다.<br/>미리보기만으로 저장되지는 않아요.</p></section></aside></div>}
    {preview && <Modal title="학습 화면 미리보기" wide onClose={() => setPreview(false)}><ContentPreview value={value} course={courses.find(c => c.id === value.courseId)} catalog={catalog}/></Modal>}
  </>;
}

export function EditorById() { const { id } = useParams(); return <ContentEditor key={id}/>; }
