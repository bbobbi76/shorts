import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, Clapperboard, Layers3 } from 'lucide-react';
import { dataMode } from '../../data/repository';
import LearningPreview from './LearningPreview';
import { CourseList, CourseView, HistoryPage, PublicError, SearchPage } from './BrowsePages';
import LessonPage from './LessonPage';
import './learner.css';

function Brand() {
  return <Link to="/" className="brand"><span className="brand-icon"><Layers3 size={24}/></span><span>실무 한 컷<small>직장인을 위한 실무 학습</small></span></Link>;
}

export function RoleHome() {
  return <div className="role-home"><header className="learner-header"><Brand/><span className="badge published">{dataMode === 'mock' ? '예시 데이터 모드' : '서버 연결 모드'}</span></header><main className="role-main"><h1>이용할 화면을 선택하세요</h1><p className="page-description">사용자는 공개된 콘텐츠를 학습하고, 관리자는 과정과 콘텐츠를 운영합니다.</p><div className="role-options"><section className="panel role-option"><BookOpen size={28}/><h2>사용자</h2><p>필요한 영상을 찾고<br/>자막과 실습 자료로 학습합니다.</p><Link className="button primary" to="/learn" onClick={() => { if (dataMode === 'mock') sessionStorage.setItem('demo-role', 'member'); }}>사용자로 입장<ArrowRight size={17}/></Link></section><section className="panel role-option"><Clapperboard size={28}/><h2>관리자</h2><p>과정과 영상을 등록·수정하고<br/>콘텐츠 공개 상태를 관리합니다.</p><Link className="button" to="/admin/contents" onClick={() => { if (dataMode === 'mock') sessionStorage.setItem('demo-role', 'signed-out'); }}>관리자로 입장<ArrowRight size={17}/></Link></section></div><p className="help">{dataMode === 'mock' ? '예시 모드의 역할 선택은 화면 확인용입니다. 실제 회원가입·계정 인증은 서버 연결이 필요합니다.' : '관리자 화면은 서버에서 확인한 관리자 계정으로만 이용할 수 있습니다.'}</p></main></div>;
}

export default function LearnerApp() {
  const location = useLocation();
  const preview = location.pathname === '/learn/preview';
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="learner-shell learner-live"><a className="skip-link" href="#learner-main">본문으로 바로가기</a><header className="learner-header"><Brand/><nav aria-label="사용자 메뉴"><NavLink end to="/learn">영상 찾기</NavLink><NavLink to="/learn/courses">과정 탐색</NavLink><NavLink to="/learn/history">내 학습 기록</NavLink></nav><Link className="learn-role-link" to="/">화면 선택</Link></header>
    {(preview || dataMode === 'mock') && <div className="mode-banner">{preview ? '화면 미리보기 · 과제와 AI 피드백은 미리 작성된 예시입니다. 입력 내용은 채점하지 않습니다.' : '예시 데이터 모드 · 공개된 시연 자료로 학습할 수 있습니다.'}</div>}
    <main id="learner-main" tabIndex={-1}><Routes><Route index element={<SearchPage/>}/><Route path="preview" element={<LearningPreview lesson/>}/><Route path="courses" element={<CourseList/>}/><Route path="courses/:id" element={<CourseView key={location.pathname}/>}/><Route path="contents/:id" element={<LessonPage key={location.pathname}/>}/><Route path="history" element={<HistoryPage/>}/><Route path="*" element={<PublicError message="페이지를 찾을 수 없습니다."/>}/></Routes></main>
    <footer className="learn-footer"><span>실무 한 컷 · 짧게 배우고 업무에 적용하기</span><p>시청 위치와 메모는 이 브라우저에만 저장됩니다.</p></footer>
  </div>;
}
