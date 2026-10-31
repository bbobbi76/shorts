import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Play, Search, Trash2 } from 'lucide-react';
import { publicRepository } from '../../data/repository';
import { levelLabels } from '../../domain/model';
import type { PublicContent, PublicCourse } from '../../domain/public-model';
import { Cover } from './Media';
import { formatTime, loadLibrary, searchLibrary, useLoad } from './library';
import { learningStore, useLearningEntries } from './progress';

export function PublicError({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="learn-empty" role="alert"><BookOpen size={30}/><h2>{message}</h2><div className="button-row">{retry && <button className="button primary" onClick={retry}>다시 시도</button>}<Link className="button" to="/learn">영상 찾기로</Link></div></div>;
}
export function Loading() { return <div className="learn-loading" role="status">공개된 학습 자료를 불러오는 중…</div>; }

function VideoCard({ content, course, match, position }: { content: PublicContent; course: PublicCourse; match?: { startSec: number; text: string }; position?: number }) {
  const time = match?.startSec ?? position;
  const href = `/learn/contents/${encodeURIComponent(content.id)}${time !== undefined ? `?t=${time}` : ''}`;
  return <article className="learn-video-card">
    <Link to={href} className="learn-card-image" aria-label={`${content.title} 학습하기`}><Cover media={content.thumbnail} title={content.title}/><span className="learn-duration">{formatTime(content.video?.duration)}</span></Link>
    <div className="learn-card-body"><div className="learn-meta"><span>{levelLabels[course.level]}</span>{content.isExample && <span>예시 영상</span>}</div><h3><Link to={href}>{content.title}</Link></h3><p>{content.learningGoal}</p>
      {match && <Link className="learn-match" to={href}><Play size={14}/><span><strong>{formatTime(match.startSec)} 자막</strong>{match.text}</span></Link>}
      <div className="learn-card-bottom"><Link to={`/learn/courses/${encodeURIComponent(course.id)}`}>{course.title}</Link>{!match && position !== undefined && position > 0 && <span>{formatTime(position)}부터 이어보기</span>}</div>
    </div>
  </article>;
}

export function SearchPage() {
  const { value, error, retry } = useLoad(loadLibrary, 'library');
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').slice(0, 200);
  const courseId = params.get('course') || '';
  const level = params.get('level') || '';
  const [input, setInput] = useState(query);
  const entries = useLearningEntries();
  useEffect(() => setInput(query), [query]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete('page'); setParams(next);
  }
  const results = value ? searchLibrary(value.contents, value.courses, query, courseId, level) : [];
  const pages = Math.max(1, Math.ceil(results.length / 12));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(params.get('page'))) || 1));
  const recent = !query && !courseId && !level && value ? entries.flatMap(entry => {
    const content = value.contents.find(item => item.id === entry.contentId && item.video?.id === entry.videoId);
    const course = value.courses.find(item => item.id === content?.courseId);
    return content && course && entry.position > 0 && !entry.ended ? [{ entry, content, course }] : [];
  }).slice(0, 3) : [];
  return <>
    <section className="learn-hero"><span className="learn-eyebrow">필요한 순간, 짧게 배우는 실무</span><h1>지금 필요한 영상을<br/>찾아보세요.</h1><p>제목, 학습 목표와 자막 속에서 필요한 내용을 찾아요.</p>
      <form className="learn-search" role="search" onSubmit={event => { event.preventDefault(); filter('q', input.trim()); }}><Search size={23} aria-hidden="true"/><input aria-label="영상 검색어" value={input} maxLength={200} onChange={event => setInput(event.target.value)} placeholder="예: 조건별 합계, 보고서, 매출"/><button className="button primary" type="submit">검색<ArrowRight size={17}/></button></form>
    </section>
    <div className="learn-filter-bar"><label>과정<select value={courseId} onChange={event => filter('course', event.target.value)}><option value="">전체 과정</option>{value?.courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label>난이도<select value={level} onChange={event => filter('level', event.target.value)}><option value="">전체 난이도</option>{Object.entries(levelLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{(query || courseId || level) && <button className="text-button" onClick={() => { setInput(''); setParams({}); }}>검색 조건 초기화</button>}</div>
    {error ? <PublicError message={error} retry={retry}/> : !value ? <Loading/> : <>
      {recent.length > 0 && <section className="learn-section"><div className="learn-section-heading"><h2>이어서 학습하기</h2><Link to="/learn/history">시청 기록<ArrowRight size={16}/></Link></div><div className="learn-video-grid">{recent.map(({ content, course, entry }) => <VideoCard key={content.id} content={content} course={course} position={entry.position}/>)}</div></section>}
      <section className="learn-section" aria-labelledby="video-results"><div className="learn-section-heading"><h2 id="video-results">{query ? `‘${query}’ 검색 결과` : '공개된 영상'} <span>{results.length}개</span></h2><Link to="/learn/courses">과정별로 보기<ArrowRight size={16}/></Link></div><p className="sr-only" role="status">{results.length}개의 영상이 있습니다. {page}/{pages}페이지</p>
        {results.length ? <div className="learn-video-grid">{results.slice((page - 1) * 12, page * 12).map(({ content, course, match }) => {
          const entry = entries.find(item => item.contentId === content.id && item.videoId === content.video?.id);
          return <VideoCard key={content.id} content={content} course={course} match={match} position={entry && !entry.ended ? entry.position : undefined}/>;
        })}</div> : <div className="learn-empty"><Search size={30}/><h3>{query || courseId || level ? '검색 결과가 없습니다' : '아직 공개된 영상이 없습니다'}</h3><p>{query || courseId || level ? '단어를 짧게 바꾸거나 다른 과정과 난이도를 선택해 보세요.' : '새로운 학습 자료가 공개되면 이곳에서 볼 수 있어요.'}</p>{(query || courseId || level) && <button className="button" onClick={() => { setInput(''); setParams({}); }}>검색 조건 초기화</button>}</div>}
        {pages > 1 && <nav className="learn-pagination" aria-label="검색 결과 페이지"><button className="button" disabled={page === 1} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page - 1)); setParams(next); }}>이전</button><span>{page} / {pages}</span><button className="button" disabled={page === pages} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 1)); setParams(next); }}>다음</button></nav>}
      </section>
    </>}
  </>;
}

export function CourseList() {
  const { value, error, retry } = useLoad(loadLibrary, 'library');
  const [query, setQuery] = useState('');
  if (error) return <PublicError message={error} retry={retry}/>;
  if (!value) return <Loading/>;
  const filtered = value.courses.filter(course => `${course.title} ${course.summary} ${course.learningGoal}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <><div className="learn-page-title"><span className="learn-eyebrow">차근차근 배우고 싶을 때</span><h1>과정 탐색</h1><p>하나의 주제를 영상 순서대로 학습해 보세요.</p></div><label className="learn-course-search">과정 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="과정명 또는 학습 목표"/></label><div className="learn-course-grid">{filtered.map(course => {
    const items = value.contents.filter(content => content.courseId === course.id);
    return <article className="learn-course-card" key={course.id}><Cover media={course.thumbnail} title={course.title}/><div><span className="learn-eyebrow">{levelLabels[course.level]} · 영상 {items.length}개{course.isExample ? ' · 화면 예시' : ''}</span><h2>{course.title}</h2><p>{course.summary || course.learningGoal}</p><Link className="button" to={`/learn/courses/${encodeURIComponent(course.id)}`}>과정 보기<ArrowRight size={16}/></Link></div></article>;
  })}</div>{!filtered.length && <div className="learn-empty"><h2>{query ? '검색 결과가 없습니다' : '아직 공개된 과정이 없습니다'}</h2>{query && <button className="button" onClick={() => setQuery('')}>검색 초기화</button>}</div>}</>;
}

export function CourseView() {
  const { id = '' } = useParams();
  const { value, error, retry } = useLoad(() => Promise.all([publicRepository.course(id), publicRepository.contents(id)]), id);
  const entries = useLearningEntries();
  if (error) return <PublicError message={error} retry={retry}/>;
  if (!value) return <Loading/>;
  const [course, contents] = value;
  return <><Link className="learn-back" to="/learn/courses"><ArrowLeft size={16}/>과정 탐색으로</Link><section className="learn-course-heading"><div><span className="learn-eyebrow">{levelLabels[course.level]} · 공개 영상 {contents.length}개{course.isExample ? ' · 화면 예시' : ''}</span><h1>{course.title}</h1><p>{course.summary}</p>{course.learningGoal && <div className="learn-goal"><h2>학습 목표</h2><p>{course.learningGoal}</p></div>}</div><Cover media={course.thumbnail} title={course.title}/></section>
    <section className="learn-section"><h2>순서대로 학습하기</h2><div className="learn-course-lessons">{contents.map((content, index) => {
      const entry = entries.find(item => item.contentId === content.id && item.videoId === content.video?.id);
      return <Link className="learn-course-lesson" key={content.id} to={`/learn/contents/${encodeURIComponent(content.id)}`}><span className="learn-lesson-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{content.title}</strong><p>{content.learningGoal}</p><span><Clock3 size={14}/>{formatTime(content.video?.duration)}{entry?.ended ? ' · 시청 완료' : entry && entry.position > 0 ? ` · ${formatTime(entry.position)}부터 이어보기` : ''}</span></div><ArrowRight size={18}/></Link>;
    })}</div>{!contents.length && <p className="learn-empty">아직 공개된 영상이 없습니다.</p>}</section></>;
}

export function HistoryPage() {
  const { value, error, retry } = useLoad(loadLibrary, 'library');
  const entries = useLearningEntries();
  const [confirm, setConfirm] = useState(false);
  const [storageError, setStorageError] = useState('');
  const items = value ? entries.flatMap(entry => {
    const content = value.contents.find(item => item.id === entry.contentId);
    const course = value.courses.find(item => item.id === content?.courseId);
    return content && course ? [{ content, course, entry: learningStore.get(content.id, content.video?.id ?? '')! }] : [];
  }) : [];
  return <><div className="learn-page-title"><span className="learn-eyebrow">보고, 적고, 다시 이어서</span><h1>내 학습 기록</h1><p>시청 위치와 메모는 이 브라우저에만 저장됩니다. 공용 기기에서는 이용 후 기록을 지워주세요.</p></div>
    {storageError && <p className="error-box" role="alert">{storageError}</p>}
    {error ? <PublicError message={error} retry={retry}/> : !value ? <Loading/> : <>
      <div className="learn-section-heading"><h2>최근 학습 <span>{items.length}개</span></h2>{entries.length > 0 && <button className="text-button" onClick={() => setConfirm(true)}><Trash2 size={16}/>전체 기록 지우기</button>}</div>
      {confirm && <div className="learn-clear-confirm" role="alert"><p>이 브라우저의 시청 위치와 학습 메모를 모두 지울까요?</p><div className="button-row"><button className="button" onClick={() => setConfirm(false)}>취소</button><button className="button primary" onClick={() => { if (!learningStore.clear()) setStorageError('기록을 지우지 못했습니다. 브라우저 저장 설정을 확인해 주세요.'); setConfirm(false); }}>모두 지우기</button></div></div>}
      <div className="learn-history-list">{items.map(({ content, course, entry }) => <article key={content.id} className="learn-history-item"><Link to={`/learn/contents/${encodeURIComponent(content.id)}`} className="learn-history-cover" aria-label={`${content.title} 학습하기`}><Cover media={content.thumbnail} title={content.title}/></Link><div><span className="learn-eyebrow">{course.title}</span><h2><Link to={`/learn/contents/${encodeURIComponent(content.id)}`}>{content.title}</Link></h2><p>{entry.ended ? '시청 완료' : `${formatTime(entry.position)} / ${formatTime(entry.duration || content.video?.duration)}`} · {new Date(entry.updatedAt).toLocaleDateString('ko-KR')}</p>{entry.note && <p className="learn-history-note">{entry.note}</p>}<Link className="text-button" to={`/learn/contents/${encodeURIComponent(content.id)}`}>{entry.ended ? '다시 학습하기' : '이어서 학습하기'}<ArrowRight size={16}/></Link></div><button className="icon-button" aria-label={`${content.title} 기록 지우기`} onClick={() => { if (!learningStore.remove(content.id)) setStorageError('기록을 지우지 못했습니다. 다시 시도해 주세요.'); }}><Trash2 size={17}/></button></article>)}</div>
      {!items.length && <div className="learn-empty"><BookOpen size={32}/><h2>아직 학습 기록이 없습니다</h2><p>영상을 시청하거나 메모를 남기면 이곳에서 다시 찾을 수 있어요.</p><Link className="button primary" to="/learn">영상 찾아보기<ArrowRight size={16}/></Link></div>}
    </>}
  </>;
}
