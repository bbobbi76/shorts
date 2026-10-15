import AdminQuizStudio from './AdminQuizStudio';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Routes, Route, useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, CircleHelp, Clapperboard, Eye, FileText, ImagePlus, Layers3, LoaderCircle, LockKeyhole, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { type Content, type Course, type Media, type MediaKind, ServiceError, emptyContent, emptyCourse, filePolicies, publicationProblems, publishIssues, statusLabels, validateFile } from './model';
import { apiBase, dataMode, repository } from './repository';

type AppContext = { handleError: (e: unknown) => void; notify: (text: string) => void; setDirty: (dirty: boolean) => void; authEpoch: number };
const Context = createContext<AppContext>(null!);
const useApp = () => useContext(Context);
const toError = (error: unknown) => error instanceof ServiceError ? error : new ServiceError(error instanceof Error ? error.message : '작업을 처리하지 못했습니다. 다시 시도해 주세요.');
const when = (date: string) => date ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(date)) : '저장 전';
const fileSize = (size: number) => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;

export default function App() {
  const [session, setSession] = useState<{ name: string } | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'login' | 'forbidden' | 'error'>('loading');
  const [globalError, setGlobalError] = useState('');
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const media = window.matchMedia('(max-width: 760px)'); const update = () => setIsMobile(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => {
    if (!mobileMenu || !isMobile) return;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const focusable = () => [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])];
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileMenu(false); }
      if (event.key === 'Tab') { const items = focusable(); const first = items[0]; const last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; menuButtonRef.current?.focus({ preventScroll: true }); };
  }, [mobileMenu, isMobile]);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [dirty, dirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => { dirtyRef.current = value; dirtyState(value); }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => { setMobileMenu(false); window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, []);
  const handleError = useCallback((error: unknown) => {
    const e = toError(error);
    if (e.status === 401) setAuthState('login');
    if (e.status === 403) setAuthState('forbidden');
  }, []);
  const checkSession = useCallback(async () => {
    setGlobalError('');
    try { const value = await repository.session(); setSession(value); setAuthState('ok'); setAuthEpoch(n => n + 1); }
    catch (error) { const e = toError(error); setAuthState(e.status === 401 ? 'login' : e.status === 403 ? 'forbidden' : 'error'); setGlobalError(e.message); }
  }, []);
  useEffect(() => { void checkSession(); }, [checkSession]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const notify = useCallback((message: string) => setToast(message), []);
  async function logout() { try { await repository.logout(); setDirty(false); setSettings(false); setAuthState('login'); navigate('/', { replace: true }); } catch (error) { setGlobalError(toError(error).message); setAuthState('error'); handleError(error); } }
  return <Context.Provider value={{ handleError, notify, setDirty, authEpoch }}>
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <div className="app-shell">
      <aside id="admin-sidebar" ref={sidebarRef} inert={isMobile && !mobileMenu} className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <Link to="/admin/contents" className="brand"><span className="brand-icon"><Layers3 size={24}/></span><span>실무 한 컷<small>교육 콘텐츠 관리자</small></span></Link>
        <div className="workspace"><span className="workspace-mark">1</span><div>1조 워크스페이스<small>콘텐츠 운영 공간</small></div><ShieldCheck size={17}/></div>
        <span className="nav-label">콘텐츠 운영</span>
        <nav aria-label="관리자 메뉴">
          <NavLink to="/admin/contents"><Clapperboard size={19}/>콘텐츠 관리<ChevronRight size={15}/></NavLink>
          <NavLink to="/admin/courses"><BookOpen size={19}/>과정 관리<ChevronRight size={15}/></NavLink>
        </nav>

        <div className="sidebar-bottom"><Link className="role-switch" to="/learn"><BookOpen size={18}/>사용자 화면 보기</Link><Link className="role-switch" to="/">관리자·사용자 선택</Link><button onClick={() => setSettings(true)}><Settings2 size={18}/>연결 및 시연 설정</button><div className="profile"><span className="avatar">관</span><div>{session?.name ?? '관리자'}<small>{dataMode === 'mock' ? '예시 데이터 모드' : '서버 연결 모드'}</small></div><button aria-label="로그아웃" title="로그아웃" onClick={logout}><LogOut size={17}/></button></div></div>
      </aside>
      {mobileMenu && <button className="nav-scrim" aria-label="메뉴 닫기" onClick={() => setMobileMenu(false)}/>}
      <div className="main-shell">
        <header className="topbar"><button ref={menuButtonRef} className="mobile-toggle icon-button" aria-label="메뉴 열기" aria-controls="admin-sidebar" aria-expanded={mobileMenu} onClick={() => setMobileMenu(v => !v)}><Menu/></button><span>관리자 <ChevronRight size={13}/> {location.pathname.includes('courses') ? '과정 관리' : '콘텐츠 관리'}</span><span className={`mode-dot ${dataMode}`}>{dataMode === 'mock' ? '예시 데이터' : 'API 연결'}</span></header>
        <div className="mode-banner"><span className="mode-banner-icon"><CircleHelp size={16}/></span>{dataMode === 'mock' ? '예시 데이터 모드 · 내용과 파일은 이 브라우저에 저장됩니다. 실제 서버 인증·DB 연결은 포함되지 않습니다.' : '서버 연결 모드 · 저장과 권한 확인은 연결된 백엔드에서 처리합니다.'}</div>
        <main id="main-content" tabIndex={-1}><Routes>
          <Route path="contents" element={<ContentList/>}/>
          <Route path="contents/new" element={<ContentEditor key="new-content"/>}/>
          <Route path="contents/:id" element={<EditorById/>}/>
          <Route path="courses" element={<CourseList/>}/>
          <Route path="courses/new" element={<CourseEditor key="new-course"/>}/>
          <Route path="courses/:id" element={<CourseById/>}/>
          <Route path="*" element={<ContentList/>}/>
        </Routes></main>
        <footer className="app-footer"><span>실무 한 컷 · 1조 관리자 모듈</span><span>로컬 실행</span></footer>
      </div>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={19}/>{toast}<button className="icon-button" onClick={() => setToast('')} aria-label="알림 닫기"><X size={16}/></button></div>}
    {blocker.state === 'blocked' && <Modal title="저장하지 않은 변경사항" onClose={() => blocker.reset()}><p className="muted">이동하면 저장하지 않은 변경사항이 사라집니다. 계속 작성하거나 저장한 뒤 이동해 주세요.</p><div className="button-row"><button className="button primary" onClick={() => blocker.reset()}>계속 작성</button><button className="button" onClick={() => { setDirty(false); blocker.proceed(); }}>저장하지 않고 이동</button></div></Modal>}
    {authState !== 'ok' && <Modal title={authState === 'forbidden' ? '관리자 권한이 필요해요' : authState === 'loading' ? '접속 확인 중' : authState === 'error' ? '서버에 연결하지 못했어요' : '관리자 로그인'}>
      {authState === 'loading' ? <Loading/> : authState === 'login' ? <Login onSuccess={value => { setSession(value); setAuthState('ok'); setAuthEpoch(n => n + 1); }}/>
        : <div className="auth-message"><LockKeyhole size={35}/><p>{globalError || '현재 계정으로는 관리자 화면을 이용할 수 없습니다. 작성 중인 내용은 현재 화면에 유지됩니다.'}</p><div className="button-row"><button className="button" onClick={checkSession}>다시 확인</button><button className="button primary" onClick={logout}>다른 계정으로 로그인</button></div></div>}
    </Modal>}
    {settings && <Modal title="연결 및 시연 설정" onClose={() => setSettings(false)}><p className="muted">현재 모드: <strong>{dataMode === 'mock' ? '브라우저 예시 데이터' : `실제 API · ${apiBase}`}</strong></p><p className="help">모드는 실행 환경의 VITE_DATA_MODE로 선택합니다. 실제 API 모드에서 오류가 나도 예시 데이터로 자동 전환하지 않습니다.</p>{dataMode === 'mock' && <><hr/><h3>오류 처리 확인</h3><p className="help">아래 설정은 시연용입니다. 실패 후에도 작성 내용이 유지되는지 확인할 수 있어요.</p><div className="settings-actions"><button className="button" onClick={() => { sessionStorage.setItem('demo-failure', 'save'); notify('다음 저장 요청에서 한 번 실패합니다.'); setSettings(false); }}>다음 저장 실패</button><button className="button" onClick={() => { sessionStorage.setItem('demo-failure', 'upload'); notify('다음 업로드 요청에서 한 번 실패합니다.'); setSettings(false); }}>다음 업로드 실패</button><button className="button" onClick={() => { sessionStorage.setItem('demo-role', 'signed-out'); setAuthState('login'); setSettings(false); }}>로그인 만료 재현</button><button className="button" onClick={() => { sessionStorage.setItem('demo-role', 'member'); setGlobalError('일반 회원 계정은 관리자 화면을 이용할 수 없습니다.'); setAuthState('forbidden'); setSettings(false); }}>권한 없음 재현</button></div></>}</Modal>}
    {dirty && <span className="sr-only" role="status">저장하지 않은 변경사항이 있습니다.</span>}
  </Context.Provider>;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  useEffect(() => { const previousFocus = document.activeElement as HTMLElement | null; const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); }; }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose?.(); }}><div className="modal-heading"><h2 id={titleId}>{title}</h2>{onClose && <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X/></button>}</div>{children}</dialog>;
}
function Login({ onSuccess }: { onSuccess: (value: { name: string }) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { onSuccess(await repository.login(email, password)); } catch (e) { setError(toError(e).message); } finally { setBusy(false); } }}>
    <p className="muted">{dataMode === 'mock' ? '시연용 관리자 세션입니다. 비밀번호 없이 화면을 확인할 수 있어요.' : '관리자 계정으로 로그인해 주세요. 작성 중인 내용은 유지됩니다.'}</p>
    {dataMode === 'api' && <><Field label="이메일" required><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></Field><Field label="비밀번호" required><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></Field></>}
    {error && <ErrorBox error={new ServiceError(error)}/>}
    <button className="button primary full" disabled={busy}>{busy ? '로그인 중…' : dataMode === 'mock' ? '관리자로 입장' : '로그인'}</button>
  </form>;
}
function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  const id = React.useId();
  const description = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className={`field ${error ? 'has-error' : ''}`}><label htmlFor={id}>{label}{required && <span className="required" aria-hidden="true">*</span>}</label>{React.isValidElement<Record<string, unknown>>(children) ? React.cloneElement(children, { id, 'aria-required': required || undefined, 'aria-invalid': !!error || undefined, 'aria-describedby': description }) : children}{hint && <p id={`${id}-hint`} className="help">{hint}</p>}{error && <p id={`${id}-error`} className="field-error">{error}</p>}</div>;
}
function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/>불러오는 중…</div>; }
function ErrorBox({ error, retry }: { error: ServiceError | null; retry?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const detail = error?.fields.join('|');
  useEffect(() => { if (error) ref.current?.focus(); }, [error?.message, detail]);
  return error && <div ref={ref} tabIndex={-1} className="error-box" role="alert"><strong>{error.message}</strong>{error.fields.length > 0 && <ul>{error.fields.map(text => <li key={text}>{text}</li>)}</ul>}{retry && <button type="button" className="text-button" onClick={retry}>다시 시도</button>}</div>;
}
function StatusBadge({ status }: { status: Content['status'] }) { return <span className={`badge ${status.toLowerCase()}`}><i/>{statusLabels[status]}</span>; }
function PageHeading({ title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p className="page-description">{description}</p></div>{children}</div>; }

function ContentList() {
  const [contents, setContents] = useState<Content[]>([]); const [courses, setCourses] = useState<Course[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<ServiceError | null>(null); const [reload, setReload] = useState(0);
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('ALL'); const [course, setCourse] = useState('');
  const { handleError, authEpoch } = useApp();
  useEffect(() => { let active = true; setLoading(true); setError(null); Promise.all([repository.contents(), repository.courses()]).then(([items, list]) => { if (active) { setContents(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); setCourses(list); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [reload, authEpoch, handleError]);
  const results = contents.filter(c => (status === 'ALL' || c.status === status) && (!course || c.courseId === course) && c.title.toLowerCase().includes(query.trim().toLowerCase()));
  return <><PageHeading title="콘텐츠 관리" description="과정별 영상을 검색하고 등록·수정·공개 상태를 관리합니다."><Link className="button primary" to="/admin/contents/new"><Plus size={18}/>콘텐츠 등록</Link></PageHeading>
    <section className="panel library-panel" aria-busy={loading}>
      <div className="library-top"><h2>학습 콘텐츠 <span>{loading ? '—' : contents.length}</span></h2><span className="help">최근 수정순</span></div>
      <div className="filter-row"><div className="tabs" role="group" aria-label="공개 상태 필터">{[['ALL', '전체'], ['PUBLISHED', '공개'], ['DRAFT', '임시저장'], ['PRIVATE', '비공개']].map(([key, label]) => <button type="button" key={key} aria-label={label} aria-pressed={status === key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}<span aria-hidden="true">{loading ? '—' : contents.filter(c => key === 'ALL' || c.status === key).length}</span></button>)}</div>
        <div className="filter-inputs"><label className="filter-field"><span>소속 과정</span><select aria-label="과정 필터" value={course} onChange={e => setCourse(e.target.value)}><option value="">모든 과정</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label className="filter-field"><span>콘텐츠 제목</span><div className="search-input"><Search size={17} aria-hidden="true"/><input aria-label="콘텐츠 제목 검색" placeholder="제목으로 검색" value={query} onChange={e => setQuery(e.target.value)}/></div></label></div>
      </div>
      {loading ? <Loading/> : error ? <ErrorBox error={error} retry={() => setReload(n => n + 1)}/> : results.length ? <div className="table-scroll"><table className="content-table"><caption className="sr-only">콘텐츠 제목, 소속 과정, 공개 상태와 수정일</caption><thead><tr><th scope="col">콘텐츠</th><th scope="col" className="desktop-column">소속 과정</th><th scope="col" className="desktop-column">공개 상태</th><th scope="col" className="desktop-column">수정일</th><th scope="col">관리</th></tr></thead><tbody>{results.map(content => { const courseTitle = courses.find(c => c.id === content.courseId)?.title || '과정 미지정'; return <tr key={content.id}><td><Link className="content-cell" to={`/admin/contents/${content.id}`}><span className="mini-art"><Clapperboard size={20} aria-hidden="true"/></span><span><strong>{content.title || '제목 없는 콘텐츠'}</strong><small>{content.video ? `${Math.round(content.video.duration ?? 0)}초 · 영상 등록됨` : '영상 등록 전'}{dataMode === 'mock' && content.id.startsWith('sample-') ? ' · 예시' : ''}</small></span></Link><div className="mobile-meta"><span>{courseTitle}</span><StatusBadge status={content.status}/></div></td><td className="course-cell desktop-column">{courseTitle}</td><td className="desktop-column"><StatusBadge status={content.status}/></td><td className="date-cell desktop-column">{when(content.updatedAt)}</td><td><Link className="table-edit" aria-label={`${content.title || '제목 없는 콘텐츠'} 수정`} to={`/admin/contents/${content.id}`}>수정<ArrowRight size={14}/></Link></td></tr>; })}</tbody></table></div> : <div className="empty"><Search size={28} aria-hidden="true"/><h3>표시할 콘텐츠가 없어요</h3><p>{contents.length ? '검색어 또는 필터를 바꿔 다시 확인해 주세요.' : '첫 콘텐츠를 등록하고 영상과 퀴즈를 연결해 주세요.'}</p>{contents.length ? <button type="button" className="button" onClick={() => { setQuery(''); setStatus('ALL'); setCourse(''); }}>검색 조건 초기화</button> : <Link className="button primary" to="/admin/contents/new">콘텐츠 등록</Link>}</div>}
      <div className="table-footer"><span role="status">{loading ? '불러오는 중' : `${results.length}개 표시 · 전체 ${contents.length}개`}</span><span>수정 화면에서 공개 상태를 변경할 수 있습니다.</span></div>
    </section>
    <p className="list-help">공개 필수 항목: 소속 과정, 제목, 재생 가능한 영상, 퀴즈·정답·해설. 실습·업무자료는 선택 사항입니다.</p>
  </>;
}
function CourseList() {
  const [courses, setCourses] = useState<Course[]>([]); const [error, setError] = useState<ServiceError | null>(null); const [loading, setLoading] = useState(true); const [reload, setReload] = useState(0);
  const { handleError, authEpoch } = useApp();
  useEffect(() => { let active = true; setLoading(true); repository.courses().then(list => { if (active) { setCourses(list); setError(null); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [authEpoch, reload, handleError]);
  return <><PageHeading title="과정 관리" description="과정의 소개, 학습 목표와 분류를 관리합니다."><Link className="button primary" to="/admin/courses/new"><Plus size={18}/>과정 등록</Link></PageHeading><section className="panel library-panel" aria-busy={loading}><div className="library-top"><h2>학습 과정 <span>{loading ? '—' : courses.length}</span></h2></div>{loading ? <Loading/> : error ? <ErrorBox error={error} retry={() => setReload(n => n + 1)}/> : courses.length ? <div className="table-scroll"><table className="course-table"><caption className="sr-only">과정명, 직무, 주제와 난이도</caption><thead><tr><th scope="col">과정</th><th scope="col" className="desktop-column">직무·주제</th><th scope="col" className="desktop-column">난이도</th><th scope="col" className="desktop-column">수정일</th><th scope="col">관리</th></tr></thead><tbody>{courses.map(course => <tr key={course.id}><td><h3 className="course-title"><Link to={`/admin/courses/${course.id}`}>{course.title}</Link></h3><p className="course-description">{course.description || '과정 소개 없음'}</p><div className="mobile-meta"><span>{course.job} · {course.topic} · {course.level}</span></div></td><td className="desktop-column">{course.job}<br/><span className="muted">{course.topic}</span></td><td className="desktop-column">{course.level}</td><td className="date-cell desktop-column">{when(course.updatedAt)}</td><td><Link className="table-edit" to={`/admin/courses/${course.id}`} aria-label={`${course.title} 과정 수정`}>과정 수정<ArrowRight size={14}/></Link></td></tr>)}</tbody></table></div> : <div className="empty"><BookOpen size={28} aria-hidden="true"/><h3>등록된 과정이 없습니다</h3><p>콘텐츠를 연결할 과정을 먼저 등록해 주세요.</p><Link className="button primary" to="/admin/courses/new">과정 등록</Link></div>}</section></>;
}
function CourseById() { const { id } = useParams(); return <CourseEditor key={id}/>; }
function CourseEditor() {
  const { id } = useParams(); const navigate = useNavigate(); const { setDirty, handleError, notify, authEpoch } = useApp();
  const [value, setValue] = useState<Course>(emptyCourse); const [loading, setLoading] = useState(!!id); const [busy, setBusy] = useState(false); const [error, setError] = useState<ServiceError | null>(null); const loaded = useRef(false);
  useEffect(() => { if (!id || loaded.current) return; let active = true; repository.course(id).then(course => { if (active) { setValue(course); loaded.current = true; setError(null); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, handleError, authEpoch]);
  const change = (key: keyof Course, text: string) => { setValue(v => ({ ...v, [key]: text })); setError(null); setDirty(true); };
  return <><Link className="back-link" to="/admin/courses"><ArrowLeft size={16}/>과정 목록</Link><PageHeading eyebrow="COURSE EDITOR" title={id ? '과정 수정' : '새 과정 등록'} description="학습자가 무엇을 배울 수 있는지 알려주세요."/>{loading ? <Loading/> : id && !loaded.current ? <ErrorBox error={error}/> : <form className="course-form panel" onSubmit={async event => { event.preventDefault(); if (busy) return; if (!value.title.trim()) { setError(new ServiceError('과정명을 입력해 주세요.')); return; } setBusy(true); setError(null); try { const saved = await repository.saveCourse(value, !id); setDirty(false); notify('과정이 저장되었습니다.'); navigate(`/admin/courses/${saved.id}`, { replace: true }); setValue(saved); loaded.current = true; } catch (e) { setError(toError(e)); handleError(e); } finally { setBusy(false); } }}><fieldset disabled={busy}><div className="section-heading"><span className="section-number">01</span><div><h2>과정 기본 정보</h2><p>과정의 주제와 학습 방향을 설정합니다.</p></div></div><Field label="과정명" required error={error?.message === '과정명을 입력해 주세요.' ? error.message : undefined}><input maxLength={120} value={value.title} onChange={e => change('title', e.target.value)} placeholder="예: 신입 직장인을 위한 엑셀 기초"/></Field><Field label="과정 소개"><textarea rows={3} maxLength={2000} value={value.description} onChange={e => change('description', e.target.value)} placeholder="어떤 내용을 배우는 과정인가요?"/></Field><Field label="학습 목표"><textarea rows={3} maxLength={2000} value={value.objective} onChange={e => change('objective', e.target.value)} placeholder="이 과정을 마치면 할 수 있는 일을 적어주세요."/></Field><div className="three-fields"><Field label="직무"><input value={value.job} maxLength={60} onChange={e => change('job', e.target.value)}/></Field><Field label="주제"><input value={value.topic} maxLength={60} onChange={e => change('topic', e.target.value)}/></Field><Field label="난이도"><select value={value.level} onChange={e => change('level', e.target.value)}><option>기초</option><option>응용</option></select></Field></div></fieldset><ErrorBox error={error}/><div className="form-bottom"><Link className="button" to="/admin/courses">목록으로</Link><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>}{busy ? '저장 중…' : id ? '수정 저장' : '과정 등록 저장'}</button></div></form>}</>;
}

function EditorById() { const { id } = useParams(); return <ContentEditor key={id}/>; }
function ContentEditor() {
  const { id } = useParams(); const navigate = useNavigate(); const { setDirty, handleError, notify, authEpoch } = useApp();
  const [value, setValue] = useState<Content>(emptyContent); const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [uploads, setUploads] = useState(0); const [error, setError] = useState<ServiceError | null>(null); const [preview, setPreview] = useState(false); const [retry, setRetry] = useState(0); const loaded = useRef(false); const created = useRef(false); const requestLock = useRef(false); const [showValidation, setShowValidation] = useState(false);
  useEffect(() => { let active = true; const alreadyLoaded = loaded.current; if (!alreadyLoaded) setLoading(true); Promise.all([repository.courses(), id && !alreadyLoaded ? repository.content(id) : Promise.resolve(null)]).then(([list, content]) => { if (active) { setCourses(list); if (content) setValue(content); loaded.current = true; if (!alreadyLoaded) setError(null); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, handleError, authEpoch, retry]);
  const change = <K extends keyof Content,>(key: K, update: Content[K]) => { setValue(v => ({ ...v, [key]: update })); setError(null); setDirty(true); };
  const quiz = (update: Partial<Content['quiz']>) => change('quiz', { ...value.quiz, ...update });
  const issues = publishIssues(value, courses); const fieldErrors = showValidation ? publicationProblems(value, courses) : {}; const locked = busy || uploads > 0;
  useEffect(() => { if (uploads > 0) setDirty(true); }, [uploads, setDirty]);
  const sections = ['기본 정보', '영상·썸네일', 'AI 퀴즈', '실습·업무자료'];
  async function save(action: 'save' | 'publish' | 'unpublish') {
    if (locked || requestLock.current) return;
    setError(null);
    if (action === 'publish' || value.status === 'PUBLISHED') setShowValidation(true);
    if ((action === 'publish' || (value.status === 'PUBLISHED' && action === 'save')) && issues.length) { setError(new ServiceError('공개에 필요한 항목을 확인해 주세요.', 422, issues)); return; }
    requestLock.current = true; setBusy(true);
    try {
      if (action === 'unpublish') {
        const final = await repository.transition(value.id, 'unpublish');
        setValue(current => ({ ...current, status: final.status, updatedAt: final.updatedAt }));
        notify('비공개로 변경했습니다. 작성 중인 변경사항은 수정 저장해 주세요.');
        return;
      }
      // Save content first. If publication fails, keep the returned ID to avoid duplicate creation.
      const saved = await repository.saveContent(value, !id && !created.current);
      created.current = true;
      setValue(saved); setDirty(false);
      if (action !== 'save') { const final = await repository.transition(saved.id, action); setValue(final); }
      notify(action === 'publish' ? '콘텐츠를 공개했습니다.' : '콘텐츠가 저장되었습니다.');
      if (!id) navigate(`/admin/contents/${saved.id}`, { replace: true });
    } catch (e) { setError(toError(e)); handleError(e); }
    finally { requestLock.current = false; setBusy(false); }
  }
  return <><Link className="back-link" to="/admin/contents"><ArrowLeft size={16}/>콘텐츠 목록</Link><PageHeading eyebrow="CONTENT EDITOR" title={id ? '콘텐츠 수정' : '새 콘텐츠 등록'} description="영상과 퀴즈, 실무자료를 연결해 하나의 배움을 만들어 보세요.">{!loading && <StatusBadge status={value.status}/>}</PageHeading>
    {loading ? <Loading/> : !loaded.current ? <ErrorBox error={error} retry={() => setRetry(n => n + 1)}/> : <div className="editor-layout"><div className="editor-main">
      <div className="editor-steps">{sections.map((section, index) => <a key={section} href={`#section-${index + 1}`}><span>{String(index + 1).padStart(2, '0')}</span>{section}</a>)}</div>
      <fieldset disabled={locked}>
      <section className="panel form-section" id="section-1"><SectionHeading number="01" title="기본 정보" description="콘텐츠가 속한 과정과 학습 내용을 입력해 주세요."/>
        <Field label="소속 과정" required error={fieldErrors.courseId} hint={!courses.length ? '먼저 과정 관리에서 과정을 등록해 주세요.' : undefined}><select value={value.courseId} onChange={e => change('courseId', e.target.value)}><option value="">과정을 선택해 주세요</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
        <Field label="콘텐츠 제목" required error={fieldErrors.title}><input maxLength={120} placeholder="예: SUMIF 함수로 조건별 합계 구하기" value={value.title} onChange={e => change('title', e.target.value)}/></Field>
        <Field label="학습 목표"><textarea rows={3} maxLength={2000} placeholder="이 영상을 보고 할 수 있는 일을 적어주세요." value={value.objective} onChange={e => change('objective', e.target.value)}/></Field>
      </section>
      <section className="panel form-section" id="section-2"><SectionHeading number="02" title="영상·썸네일" description="세로형 숏폼 영상과 대표 이미지를 등록해 주세요."/><div className="media-grid"><UploadField kind="video" label="숏폼 영상" validationError={fieldErrors.video} media={value.video} onChange={media => change('video', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/><UploadField kind="thumbnail" label="썸네일" media={value.thumbnail} onChange={media => change('thumbnail', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/></div><p className="help">파일 제한은 초기 화면 검증 기준입니다. 최종 운영 정책은 백엔드 담당자와 맞춰 주세요.</p></section>
      <section className="panel form-section" id="section-3"><SectionHeading number="03" title="AI 퀴즈·확인 퀴즈" description="참고 자료로 퀴즈 초안을 만들고, 학습 내용을 확인할 문제를 관리하세요."/><AdminQuizStudio contentTitle={value.title}/><h3>콘텐츠 퀴즈 직접 입력</h3>
        <Field label="퀴즈 문제" required error={fieldErrors.question}><textarea rows={2} maxLength={2000} placeholder="예: 특정 부서의 매출만 합산할 때 사용하는 함수는?" value={value.quiz.question} onChange={e => quiz({ question: e.target.value })}/></Field>
        <div className="field"><span className="field-label">보기 및 정답<span className="required">*</span></span><p className="help">정답 왼쪽의 원을 선택해 주세요.</p><div className="quiz-options" role="radiogroup" aria-label="퀴즈 정답" aria-required="true" aria-invalid={!!(fieldErrors.options || fieldErrors.correctIndex)} aria-describedby={fieldErrors.options || fieldErrors.correctIndex ? "quiz-option-errors" : undefined}>{value.quiz.options.map((option, index) => <div className="quiz-option" key={index}><input type="radio" name="correctAnswer" aria-label={`보기 ${index + 1} 정답`} checked={value.quiz.correctIndex === index} onChange={() => quiz({ correctIndex: index })}/><span>{index + 1}</span><input aria-label={`보기 ${index + 1}`} value={option} maxLength={500} placeholder={`보기 ${index + 1}`} onChange={e => quiz({ options: value.quiz.options.map((text, i) => i === index ? e.target.value : text) })}/>{value.quiz.options.length > 2 && <button className="icon-button" type="button" aria-label={`보기 ${index + 1} 삭제`} onClick={() => quiz({ options: value.quiz.options.filter((_, i) => i !== index), correctIndex: value.quiz.correctIndex === index ? -1 : value.quiz.correctIndex > index ? value.quiz.correctIndex - 1 : value.quiz.correctIndex })}><X size={16}/></button>}</div>)}</div>{(fieldErrors.options || fieldErrors.correctIndex) && <div id="quiz-option-errors" className="field-error">{fieldErrors.options && <p>{fieldErrors.options}</p>}{fieldErrors.correctIndex && <p>{fieldErrors.correctIndex}</p>}</div>}{value.quiz.options.length < 4 && <button className="text-button" type="button" onClick={() => quiz({ options: [...value.quiz.options, ''] })}><Plus size={15}/>보기 추가</button>}</div>
        <Field label="정답 해설" required error={fieldErrors.explanation}><textarea rows={3} maxLength={3000} value={value.quiz.explanation} placeholder="왜 정답인지, 어떤 개념을 복습하면 좋은지 적어주세요." onChange={e => quiz({ explanation: e.target.value })}/></Field>
      </section>
      <section className="panel form-section" id="section-4"><SectionHeading number="04" title="실습·업무자료" description="더 연습하고 바로 적용할 수 있는 자료를 연결해 주세요."/><span className="optional-label">선택 항목 · 파일이 없어도 공개할 수 있어요</span><Field label="선택 실습 안내"><textarea rows={3} maxLength={3000} value={value.practiceText} placeholder="예제 파일로 수행할 실습과 입력할 결과를 안내해 주세요." onChange={e => change('practiceText', e.target.value)}/></Field><div className="media-grid"><UploadField kind="practice" label="실습 예제 파일" media={value.practice} onChange={media => change('practice', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/><UploadField kind="resource" label="업무용 템플릿" media={value.resource} onChange={media => change('resource', media)} onBusy={isBusy => setUploads(n => n + (isBusy ? 1 : -1))}/></div></section>
      </fieldset>
      <ErrorBox error={error}/><div className="editor-actionbar"><span>{uploads > 0 ? '파일 업로드 중…' : busy ? '서버 응답을 기다리고 있어요…' : `최근 저장 · ${when(value.updatedAt)}`}</span><div className="button-row"><button className="button" disabled={locked} onClick={() => void save('save')}>{id ? '수정 저장' : '임시저장'}</button>{value.status === 'PUBLISHED' ? <button className="button primary" disabled={locked} onClick={() => void save('unpublish')}>비공개로 변경</button> : <button className="button primary" disabled={locked} onClick={() => void save('publish')}><Check size={17}/>공개하기</button>}</div></div>
    </div><aside className="editor-aside"><section className="panel publish-panel"><h2>공개 전 체크리스트</h2><p>학습자를 만나기 전,<br/>필수 항목을 확인해 주세요.</p><ul>{[{ name: '소속 과정', ready: courses.some(c => c.id === value.courseId) }, { name: '콘텐츠 제목', ready: !!value.title.trim() }, { name: '재생 가능한 영상', ready: !!value.video?.duration }, { name: '퀴즈·보기·정답·해설', ready: !issues.some(i => i.includes('퀴즈')) }].map(item => <li key={item.name} className={item.ready ? 'ready' : ''}><span>{item.ready ? <Check size={13}/> : <i/>}</span>{item.name}</li>)}</ul><button className="button full" disabled={locked} onClick={() => setPreview(true)}><Eye size={17}/>학습 화면 미리보기</button><p className="help">현재 입력 내용으로 미리 봅니다.<br/>미리보기만으로 저장되지는 않아요.</p></section></aside></div>}
    {preview && <Modal title="학습 화면 미리보기" wide onClose={() => setPreview(false)}><ContentPreview value={value} course={courses.find(c => c.id === value.courseId)}/></Modal>}
  </>;
}
function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) { return <div className="section-heading"><span className="section-number">{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>; }

async function inspectMedia(file: File, kind: MediaKind): Promise<Partial<Media>> {
  validateFile(file, kind);
  if (kind !== 'video' && kind !== 'thumbnail') return {};
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ServiceError('파일 정보를 확인하지 못했습니다. 다른 파일로 다시 시도해 주세요.')), 15_000);
      if (kind === 'video') {
        const video = document.createElement('video'); video.preload = 'metadata';
        video.onloadedmetadata = () => { clearTimeout(timer); if (!Number.isFinite(video.duration) || video.duration <= 0) reject(new ServiceError('영상 길이를 확인할 수 없습니다. 재생 가능한 MP4를 선택해 주세요.')); else resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); video.removeAttribute('src'); video.load(); };
        video.onerror = () => { clearTimeout(timer); reject(new ServiceError('재생할 수 없는 영상입니다. MP4 파일을 확인해 주세요.')); }; video.src = url;
      } else {
        const image = new Image(); image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight }); }; image.onerror = () => { clearTimeout(timer); reject(new ServiceError('이미지를 열 수 없습니다. JPG 또는 PNG를 확인해 주세요.')); }; image.src = url;
      }
    });
  } finally { URL.revokeObjectURL(url); }
}
function useMediaUrl(media: Media | null) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [retry, setRetry] = useState(0); const { handleError, authEpoch } = useApp();
  useEffect(() => {
    let active = true; let objectUrl = ''; setUrl(''); setError('');
    if (media) repository.mediaBlob(media).then(blob => { if (active && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (active) { setError(toError(e).message); handleError(e); } });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [media?.id, retry, handleError, authEpoch]);
  return { url, error, retry: () => setRetry(n => n + 1) };
}
function UploadField({ kind, label, media, onChange, onBusy, validationError }: { kind: MediaKind; label: string; media: Media | null; onChange: (media: Media | null) => void; onBusy: (busy: boolean) => void; validationError?: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<ServiceError | null>(null); const { handleError } = useApp(); const input = useRef<HTMLInputElement>(null); const view = useMediaUrl(media);
  const policy = filePolicies[kind]; const inputId = React.useId(); const uploadLock = useRef(false);
  return <div className="upload-field" aria-busy={busy}><label className="field-label" htmlFor={inputId}>{label}{kind === 'video' && <span className="required" aria-hidden="true">*</span>}</label><input id={inputId} tabIndex={-1} aria-invalid={!!validationError} aria-describedby={validationError ? `${inputId}-error` : undefined} ref={input} className="sr-only" aria-label={`${label} 파일 선택`} type="file" accept={policy.accept} onChange={async event => { const file = event.target.files?.[0]; if (!file || busy || uploadLock.current) return; uploadLock.current = true; setError(null); setBusy(true); onBusy(true); try { const metadata = await inspectMedia(file, kind); const result = await repository.upload(file, kind, metadata); onChange({ ...result, ...metadata }); } catch (e) { setError(toError(e)); handleError(e); } finally { uploadLock.current = false; setBusy(false); onBusy(false); if (input.current) input.current.value = ''; } }}/>
    {media ? <div className={`uploaded ${kind === "practice" || kind === "resource" ? "document-upload" : ""}`}><div className="upload-preview">{kind === 'video' && view.url ? <video src={view.url} controls preload="metadata" onError={() => setError(new ServiceError('영상 재생에 실패했습니다. 파일을 확인하거나 다시 선택해 주세요.'))}/> : kind === 'thumbnail' && view.url ? <img src={view.url} alt="선택한 썸네일"/> : <FileText size={28}/>}</div><strong>{media.name}</strong><small>{fileSize(media.size)}{media.duration ? ` · ${Math.round(media.duration)}초 · ${media.width}×${media.height}` : ''}</small><div className="button-row"><button className="text-button" type="button" disabled={busy} onClick={() => input.current?.click()}>파일 변경</button><button className="text-button danger" type="button" disabled={busy} onClick={() => onChange(null)}>제거</button></div>{view.error ? <div role="alert" className="inline-error">{view.error}<button className="text-button" type="button" onClick={view.retry}>다시 불러오기</button></div> : view.url && (kind === 'practice' || kind === 'resource') ? <a className="text-button" href={view.url} download={media.name}><ArrowDownToLine size={15}/>파일 확인</a> : null}</div> : <button type="button" className="upload-box" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={25} className="spin"/> : kind === 'thumbnail' ? <ImagePlus size={26}/> : <UploadCloud size={26}/>}<strong>{busy ? '파일 확인 및 업로드 중…' : '파일을 선택해 주세요'}</strong><span>{kind === 'video' ? 'MP4' : kind === 'thumbnail' ? 'JPG, PNG' : 'XLSX, XLS, CSV, PDF, DOCX, TXT'} · 최대 {policy.limit}MB</span></button>}
    {validationError && <p id={`${inputId}-error`} className="field-error">{validationError}</p>}{busy && media && <p className="help" role="status">새 파일 업로드 중… 기존 파일을 유지합니다.</p>}<ErrorBox error={error}/>
  </div>;
}
function ContentPreview({ value, course }: { value: Content; course?: Course }) {
  const video = useMediaUrl(value.video); const thumbnail = useMediaUrl(value.thumbnail); const [answer, setAnswer] = useState(-1); const [submitted, setSubmitted] = useState(false); const [playError, setPlayError] = useState(false);
  return <div className="content-preview"><div className="preview-notice">미리보기 · 학습 기록과 퀴즈 답안은 저장하지 않습니다.</div><span className="eyebrow">{course?.title || '소속 과정 미지정'}</span><h2>{value.title || '제목 없는 콘텐츠'}</h2>{video.error || playError ? <div className="error-box" role="alert">{video.error || '영상 재생 오류: 파일을 다시 확인해 주세요.'}<button className="text-button" onClick={() => { setPlayError(false); video.retry(); }}>다시 불러오기</button></div> : video.url ? <video className="preview-video" controls src={video.url} poster={thumbnail.url} onError={() => setPlayError(true)}/> : <div className="empty preview-empty"><Clapperboard size={35}/><p>{value.video ? '영상 불러오는 중…' : '영상이 등록되지 않았어요.'}</p></div>}<p className="preview-objective">{value.objective || '학습 목표를 입력해 주세요.'}</p><section className="preview-quiz"><h3>배운 내용 확인하기</h3><p>{value.quiz.question || '퀴즈 문제를 입력해 주세요.'}</p>{value.quiz.options.map((text, index) => <label className="preview-option" key={index}><input type="radio" name="preview-answer" checked={answer === index} onChange={() => { setAnswer(index); setSubmitted(false); }}/>{text || `보기 ${index + 1} 미입력`}</label>)}<button className="button primary" disabled={answer < 0} onClick={() => setSubmitted(true)}>답안 확인</button>{submitted && <div className="preview-answer" role="status"><strong>{value.quiz.correctIndex < 0 ? '정답이 설정되지 않았습니다.' : answer === value.quiz.correctIndex ? '정답입니다.' : `정답: ${value.quiz.options[value.quiz.correctIndex]}`}</strong><p>{value.quiz.explanation || '해설을 입력해 주세요.'}</p></div>}</section>{value.practiceText && <section><h3>선택 실습</h3><p className="pre-wrap">{value.practiceText}</p></section>}<div className="preview-downloads">{value.practice && <Download media={value.practice} label="실습 예제"/>}{value.resource && <Download media={value.resource} label="업무 템플릿"/>}</div></div>;
}
function Download({ media, label }: { media: Media; label: string }) { const view = useMediaUrl(media); return <div className="download-card"><FileText size={23}/><div><strong>{label}</strong><small>{media.name}</small>{view.error && <span className="inline-error">{view.error}<button className="text-button" onClick={view.retry}>재시도</button></span>}</div>{view.url ? <a className="icon-button" aria-label={`${label} 다운로드`} href={view.url} download={media.name}><ArrowDownToLine size={19}/></a> : <span className="help">불러오는 중</span>}</div>; }

