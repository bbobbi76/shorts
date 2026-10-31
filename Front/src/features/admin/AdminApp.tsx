import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Routes, Route, useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Clapperboard, FileText, Layers3, LockKeyhole, LogOut, Menu, Search, Settings2, ShieldCheck, X } from 'lucide-react';
import { dataMode, repository } from '../../data/repository';
import { Context } from './context';
import { toError } from '../../shared/format';
import { Modal, Loading } from '../../shared/ui';
import { Login } from './auth/Login';
import { ContentList } from './contents/ContentList';
import { ContentEditor, EditorById } from './contents/ContentEditor';
import { CourseList } from './courses/CourseList';
import { CourseEditor, CourseById } from './courses/CourseEditor';
import { CatalogPage } from './catalog/CatalogManager';
import { MetadataProvider } from './metadata';
import { DashboardPage } from './dashboard/DashboardPage';
import { CourseOrder } from './courses/CourseOrder';
import './workfit.css';

export default function App() {
  const [session, setSession] = useState<{ name: string } | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'login' | 'forbidden' | 'error'>('loading');
  const [globalError, setGlobalError] = useState('');
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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
  async function logout(leave = false) {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      try { await repository.logout(); }
      catch (error) { if (![401, 403].includes(toError(error).status)) throw error; }
      setSession(null); setGlobalError(''); setSettings(false); setConfirmLogout(false); setAuthState('login');
      if (leave) { setDirty(false); navigate('/', { replace: true }); }
    } catch (error) { setGlobalError(toError(error).message); setConfirmLogout(false); setAuthState('error'); handleError(error); }
    finally { setLoggingOut(false); }
  }

  function requestLogout() {
    if (dirtyRef.current) setConfirmLogout(true);
    else void logout(true);
  }

  return <Context.Provider value={{ handleError, notify, setDirty, authEpoch }}>
    <MetadataProvider enabled={authState === 'ok'}>
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <div className="app-shell">
      <aside id="admin-sidebar" ref={sidebarRef} inert={isMobile && !mobileMenu} className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <Link to="/admin/contents" className="brand"><span className="brand-icon"><Layers3 size={24}/></span><span>실무 한 컷<small>교육 콘텐츠 관리자</small></span></Link>
        <div className="workspace"><span className="workspace-mark">1</span><div>1조 워크스페이스<small>콘텐츠 운영 공간</small></div><ShieldCheck size={17}/></div>
        <span className="nav-label">콘텐츠 운영</span>
        <nav aria-label="관리자 메뉴">
          <NavLink to="/admin/dashboard"><LayoutDashboard size={19}/>관리자 통계<ChevronRight size={15}/></NavLink>
          <NavLink to="/admin/contents"><Clapperboard size={19}/>콘텐츠 관리<ChevronRight size={15}/></NavLink>
          <NavLink to="/admin/courses"><BookOpen size={19}/>과정 관리<ChevronRight size={15}/></NavLink>
          <NavLink to="/admin/resources"><FileText size={19}/>실무자료 관리<ChevronRight size={15}/></NavLink>
          <NavLink to="/admin/tags"><Search size={19}/>검색 태그 관리<ChevronRight size={15}/></NavLink>
        </nav>

        <div className="sidebar-bottom"><Link className="role-switch" to="/learn"><BookOpen size={18}/>사용자 화면 보기</Link><Link className="role-switch" to="/">관리자·사용자 선택</Link><button onClick={() => setSettings(true)}><Settings2 size={18}/>시연 설정</button><div className="profile"><span className="avatar">관</span><div>{session?.name ?? '관리자'}<small>{dataMode === 'mock' ? '예시 데이터 모드' : '서버 연결 모드'}</small></div><button aria-label="로그아웃" title="로그아웃" disabled={loggingOut} onClick={requestLogout}><LogOut size={17}/></button></div></div>
      </aside>
      {mobileMenu && <button className="nav-scrim" aria-label="메뉴 닫기" onClick={() => setMobileMenu(false)}/>}
      <div className="main-shell">
        <header className="topbar"><button ref={menuButtonRef} className="mobile-toggle icon-button" aria-label="메뉴 열기" aria-controls="admin-sidebar" aria-expanded={mobileMenu} onClick={() => setMobileMenu(v => !v)}><Menu/></button><span>관리자 <ChevronRight size={13}/> {location.pathname.includes('dashboard') ? '관리자 통계' : location.pathname.includes('courses') ? '과정 관리' : location.pathname.includes('resources') ? '실무자료 관리' : location.pathname.includes('tags') ? '검색 태그 관리' : '콘텐츠 관리'}</span><span className={`mode-dot ${dataMode}`}>{dataMode === 'mock' ? '예시 데이터' : 'API 연결'}</span></header>
        <div className="mode-banner"><span className="mode-banner-icon"><CircleHelp size={16}/></span>{dataMode === 'mock' ? '예시 데이터 모드 · 내용과 파일은 이 브라우저에 저장됩니다. 실제 서버 인증·DB 연결은 포함되지 않습니다.' : '서버 연결 모드 · 저장과 권한 확인은 연결된 백엔드에서 처리합니다.'}</div>
        <main id="main-content" tabIndex={-1}><Routes>
          <Route path="dashboard" element={<DashboardPage/>}/>
          <Route path="courses/:id/order" element={<CourseOrder/>}/>
          <Route path="contents" element={<ContentList/>}/>
          <Route path="contents/new" element={<ContentEditor key="new-content"/>}/>
          <Route path="contents/:id" element={<EditorById/>}/>
          <Route path="resources" element={<CatalogPage kind="resources"/>}/>
          <Route path="tags" element={<CatalogPage kind="tags"/>}/>
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
    {confirmLogout && <Modal title="저장하지 않은 내용을 버리고 로그아웃할까요?" onClose={() => { if (!loggingOut) setConfirmLogout(false); }}><p className="muted">로그아웃하면 작성 중인 변경사항이 사라집니다. 저장하려면 계속 작성해 주세요.</p><div className="button-row"><button className="button primary" disabled={loggingOut} onClick={() => setConfirmLogout(false)}>계속 작성</button><button className="button" disabled={loggingOut} onClick={() => void logout(true)}>{loggingOut ? '로그아웃 중…' : '저장하지 않고 로그아웃'}</button></div></Modal>}
    {authState !== 'ok'  && <Modal title={authState === 'forbidden' ? '관리자 권한이 필요해요' : authState === 'loading' ? '접속 확인 중' : authState === 'error' ? '서버에 연결하지 못했어요' : '관리자 로그인'}>
      {authState === 'loading' ? <Loading/> : authState === 'login' ? <Login onSuccess={value => { setSession(value); setAuthState('ok'); setAuthEpoch(n => n + 1); }}/>
        : <div className="auth-message"><LockKeyhole size={35}/><p>{globalError || '현재 계정으로는 관리자 화면을 이용할 수 없습니다. 작성 중인 내용은 현재 화면에 유지됩니다.'}</p><div className="button-row"><button className="button" onClick={checkSession}>다시 확인</button><button className="button primary" disabled={loggingOut} onClick={() => void logout()}>다른 계정으로 로그인</button></div></div>}
    </Modal>}
    {settings && <Modal title="시연 설정" onClose={() => setSettings(false)}><p className="muted">{dataMode === 'api' ? '입력 내용과 파일은 연결된 서버에 저장됩니다.' : '입력 내용과 파일은 현재 브라우저에 저장됩니다.'}</p>{dataMode === 'mock' && <><hr/><h3>오류 처리 확인</h3><p className="help">아래 설정은 시연용입니다. 실패 후에도 작성 내용이 유지되는지 확인할 수 있어요.</p><div className="settings-actions"><button className="button" onClick={() => { sessionStorage.setItem('demo-failure', 'save'); notify('다음 저장 요청에서 한 번 실패합니다.'); setSettings(false); }}>다음 저장 실패</button><button className="button" onClick={() => { sessionStorage.setItem('demo-failure', 'upload'); notify('다음 업로드 요청에서 한 번 실패합니다.'); setSettings(false); }}>다음 업로드 실패</button><button className="button" onClick={() => { sessionStorage.setItem('demo-role', 'signed-out'); setAuthState('login'); setSettings(false); }}>로그인 만료 재현</button><button className="button" onClick={() => { sessionStorage.setItem('demo-role', 'member'); setGlobalError('일반 회원 계정은 관리자 화면을 이용할 수 없습니다.'); setAuthState('forbidden'); setSettings(false); }}>권한 없음 재현</button></div></>}</Modal>}
    {dirty && <span className="sr-only" role="status">저장하지 않은 변경사항이 있습니다.</span>}
  </MetadataProvider></Context.Provider>;
}
