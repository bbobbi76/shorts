import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Clapperboard, Layers3, Search } from 'lucide-react';
import { dataMode, publicRepository } from './repository';
import type { Media } from './model';
import type { PublicContent, PublicCourse } from './public-model';

export function RoleHome() {
  return <div className="role-home"><header className="learner-header"><Brand/><span className="badge published">{dataMode === 'mock' ? '예시 데이터 모드' : '서버 연결 모드'}</span></header><main className="role-main"><h1>이용할 화면을 선택하세요</h1><p className="page-description">사용자는 공개된 콘텐츠를 학습하고, 관리자는 과정과 콘텐츠를 운영합니다.</p><div className="role-options"><section className="panel role-option"><BookOpen size={28}/><h2>사용자</h2><p>공개된 과정과 영상을 찾아보고<br/>실습·업무자료를 확인합니다.</p><Link className="button primary" to="/learn" onClick={() => { if (dataMode === 'mock') sessionStorage.setItem('demo-role', 'member'); }}>사용자로 입장<ArrowRight size={17}/></Link></section><section className="panel role-option"><Clapperboard size={28}/><h2>관리자</h2><p>과정과 영상을 등록·수정하고<br/>콘텐츠 공개 상태를 관리합니다.</p><Link className="button" to="/admin/contents" onClick={() => { if (dataMode === 'mock') sessionStorage.setItem('demo-role', 'signed-out'); }}>관리자로 입장<ArrowRight size={17}/></Link></section></div><p className="help">{dataMode === 'mock' ? '예시 모드의 역할 선택은 화면 확인용입니다. 실제 회원가입·계정 인증은 서버 연결이 필요합니다.' : '관리자 화면은 서버에서 확인한 관리자 계정으로만 이용할 수 있습니다.'}</p></main></div>;
}
function Brand() { return <Link to="/" className="brand"><span className="brand-icon"><Layers3 size={24}/></span><span>실무 한 컷<small>직장인을 위한 실무 학습</small></span></Link>; }
export default function LearnerApp() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="learner-shell"><a className="skip-link" href="#learner-main">본문으로 바로가기</a><header className="learner-header"><Brand/><nav aria-label="사용자 메뉴"><Link to="/learn">과정 탐색</Link><Link to="/">화면 선택</Link></nav><span className="badge published">사용자 화면</span></header><div className="mode-banner">{dataMode === 'mock' ? '예시 데이터 모드 · 공개 콘텐츠가 없으면 화면 확인용 예시를 표시합니다. 학습 진도·퀴즈 제출 기록은 아직 저장하지 않습니다.' : '서버 연결 모드 · 공개된 학습 자료를 불러옵니다.'}</div><main id="learner-main" tabIndex={-1}><Routes><Route index element={<Catalogue/>}/><Route path="courses/:id" element={<CourseView key={location.pathname}/>}/><Route path="contents/:id" element={<LessonView key={location.pathname}/>}/><Route path="*" element={<PublicError message="페이지를 찾을 수 없습니다."/>}/></Routes></main></div>;
}
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [value, setValue] = useState<T | null>(null); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setValue(null); setError(''); load().then(v => { if (active) setValue(v); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '자료를 불러오지 못했습니다.'); }); return () => { active = false; }; }, [key, retry]);
  return { value, error, retry: () => setRetry(n => n + 1) };
}
function PublicError({ message, retry }: { message: string; retry?: () => void }) { return <div className="empty"><h2>{message}</h2><div className="button-row">{retry && <button className="button" onClick={retry}>다시 시도</button>}<Link className="button" to="/learn">과정 탐색으로</Link></div></div>; }
function Catalogue() {
  const { value, error, retry } = useLoad(() => publicRepository.courses(), 'courses'); const [query, setQuery] = useState('');
  const courses = value?.filter(c => `${c.title} ${c.topic} ${c.job}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <><div className="page-heading"><div><h1>과정 탐색</h1><p className="page-description">업무에 필요한 내용을 짧은 영상으로 배워보세요.</p></div></div><label className="filter-field learner-search"><span>과정 검색</span><div className="search-input"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="과정명, 직무 또는 주제"/></div></label>{error ? <PublicError message={error} retry={retry}/> : value === null ? <div className="loading" role="status">공개된 과정을 불러오는 중…</div> : courses.length ? <div className="learner-courses">{courses.map(course => <section key={course.id} className="panel learner-course">{course.isExample && <span className="badge private">화면 예시</span>}<span className="badge private">{course.topic} · {course.level}</span><h2>{course.title}</h2><p>{course.description || course.objective}</p><span className="help">{course.job}</span><Link className="button primary" to={`/learn/courses/${course.id}`}>과정 보기<ArrowRight size={16}/></Link></section>)}</div> : <div className="empty"><BookOpen size={30}/><h2>{query ? '검색 결과가 없습니다' : '아직 공개된 과정이 없습니다'}</h2><p>{query ? '검색어를 바꿔 다시 찾아보세요.' : '관리자가 콘텐츠를 공개하면 이곳에서 학습할 수 있습니다.'}</p>{query && <button className="button" onClick={() => setQuery('')}>검색 초기화</button>}</div>}</>;
}
function CourseView() {
  const { id = '' } = useParams(); const { value, error, retry } = useLoad(() => Promise.all([publicRepository.course(id), publicRepository.contents(id)]), id);
  if (error) return <PublicError message={error} retry={retry}/>;
  if (!value) return <div className="loading" role="status">과정 불러오는 중…</div>;
  const [course, contents]: [PublicCourse, PublicContent[]] = value;
  return <><Link className="back-link" to="/learn"><ArrowLeft size={16}/>과정 탐색</Link>{course.isExample && <span className="badge private">화면 예시</span>}<h1>{course.title}</h1><p className="page-description">{course.description}</p>{course.objective && <section className="learner-objective"><h2>학습 목표</h2><p>{course.objective}</p></section>}<section className="panel learner-lessons"><div className="library-top"><h2>{contents[0]?.isExample ? '예시 영상' : `공개 영상 ${contents.length}개`}</h2></div>{contents.map((content, index) => <Link className="learner-lesson" key={content.id} to={`/learn/contents/${content.id}`}><span className="section-number">{index + 1}</span><div><strong>{content.title}</strong><small>{content.isExample ? '화면 예시 영상' : `${Math.round(content.video?.duration ?? 0)}초`}</small></div><ArrowRight size={18}/></Link>)}</section></>;
}
function Asset({ media, video = false }: { media: Media; video?: boolean }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; let objectUrl = ''; setUrl(''); setError(''); if (media.url) { setUrl(media.url); return () => { active = false; }; } publicRepository.mediaBlob(media).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : '파일을 열 수 없습니다.'); }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [media.id, media.url, retry]);
  if (error) return <div className="error-box" role="alert">{error}<button className="text-button" onClick={() => setRetry(n => n + 1)}>다시 시도</button></div>;
  if (!url) return <p role="status">파일 불러오는 중…</p>;
  return video ? <video className="learner-video" src={url} controls preload="metadata" onError={() => setError('영상을 재생할 수 없습니다. 파일을 다시 확인해 주세요.')}/> : <a className="download-card" href={url} download={media.name}><ArrowDownToLine size={20}/><span>{media.name}</span></a>;
}
function LessonView() {
  const { id = '' } = useParams(); const { value, error, retry } = useLoad(() => publicRepository.content(id), id);
  if (error) return <PublicError message={error} retry={retry}/>;
  if (!value) return <div className="loading" role="status">영상 불러오는 중…</div>;
  return <>{value.isExample && <span className="badge private">화면 예시</span>}<Link className="back-link" to={`/learn/courses/${value.courseId}`}><ArrowLeft size={16}/>과정으로 돌아가기</Link><h1>{value.title}</h1><p className="page-description">{value.objective}</p>{value.video && <Asset media={value.video} video/>}{value.practiceText && <section className="learner-objective"><h2>선택 실습</h2><p className="pre-wrap">{value.practiceText}</p></section>}{(value.practice || value.resource) && <section className="learner-resources"><h2>실습·업무자료</h2>{value.practice && <Asset media={value.practice}/>} {value.resource && <Asset media={value.resource}/>}</section>}</>;
}
