import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, Plus, Search } from 'lucide-react';
import { type Content, type Course, ServiceError } from '../../../domain/model';
import { dataMode, repository } from '../../../data/repository';
import { useApp } from '../context';
import { toError, when } from '../../../shared/format';
import { PageHeading, Loading, ErrorBox, StatusBadge, Modal } from '../../../shared/ui';

export function ContentList() {
  const [contents, setContents] = useState<Content[]>([]); const [courses, setCourses] = useState<Course[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<ServiceError | null>(null); const [reload, setReload] = useState(0);
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('ALL'); const [course, setCourse] = useState('');
  const { handleError, authEpoch, notify } = useApp();
  const [target, setTarget] = useState<Content | null>(null); const [deleting, setDeleting] = useState(false); const deleteLock = useRef(false);
  useEffect(() => { let active = true; setLoading(true); setError(null); Promise.all([repository.contents(), repository.courses()]).then(([items, list]) => { if (active) { setContents(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); setCourses(list); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [reload, authEpoch, handleError]);
  async function remove() {
    if (!target || deleteLock.current) return;
    deleteLock.current = true; setDeleting(true); setError(null);
    try { await repository.removeContent(target.id); setContents(current => current.filter(item => item.id !== target.id)); setTarget(null); notify('콘텐츠를 삭제했습니다.'); }
    catch (reason) { setError(toError(reason)); handleError(reason); }
    finally { setDeleting(false); deleteLock.current = false; }
  }
  const results = contents.filter(c => (status === 'ALL' || c.status === status) && (!course || c.courseId === course) && c.title.toLowerCase().includes(query.trim().toLowerCase()));
  return <><PageHeading title="콘텐츠 관리" description="과정별 영상을 검색하고 등록·수정·공개 상태를 관리합니다."><Link className="button primary" to="/admin/contents/new"><Plus size={18}/>콘텐츠 등록</Link></PageHeading>
    <section className="panel library-panel" aria-busy={loading}>
      <div className="library-top"><h2>학습 콘텐츠 <span>{loading ? '—' : contents.length}</span></h2><span className="help">최근 수정순</span></div>
      <div className="filter-row"><div className="tabs" role="group" aria-label="공개 상태 필터">{[['ALL', '전체'], ['PUBLISHED', '공개'], ['DRAFT', '임시저장'], ['REVIEW', '검수'], ['HIDDEN', '비공개']].map(([key, label]) => <button type="button" key={key} aria-label={label} aria-pressed={status === key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>{label}<span aria-hidden="true">{loading ? '—' : contents.filter(c => key === 'ALL' || c.status === key).length}</span></button>)}</div>
        <div className="filter-inputs"><label className="filter-field"><span>소속 과정</span><select aria-label="과정 필터" value={course} onChange={e => setCourse(e.target.value)}><option value="">모든 과정</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label className="filter-field"><span>콘텐츠 제목</span><div className="search-input"><Search size={17} aria-hidden="true"/><input aria-label="콘텐츠 제목 검색" placeholder="제목으로 검색" value={query} onChange={e => setQuery(e.target.value)}/></div></label></div>
      </div>
      {loading ? <Loading/> : error ? <ErrorBox error={error} retry={() => setReload(n => n + 1)}/> : results.length ? <div className="table-scroll"><table className="content-table"><caption className="sr-only">콘텐츠 제목, 소속 과정, 공개 상태와 수정일</caption><thead><tr><th scope="col">콘텐츠</th><th scope="col" className="desktop-column">소속 과정</th><th scope="col" className="desktop-column">공개 상태</th><th scope="col" className="desktop-column">수정일</th><th scope="col">관리</th></tr></thead><tbody>{results.map(content => { const courseTitle = courses.find(c => c.id === content.courseId)?.title || '과정 미지정'; return <tr key={content.id}><td><Link className="content-cell" to={`/admin/contents/${content.id}`}><span className="mini-art"><Clapperboard size={20} aria-hidden="true"/></span><span><strong>{content.title || '제목 없는 콘텐츠'}</strong><small>{content.video ? `${Math.round(content.video.duration ?? 0)}초 · 영상 등록됨` : '영상 등록 전'}{dataMode === 'mock' && content.id.startsWith('sample-') ? ' · 예시' : ''}</small></span></Link><div className="mobile-meta"><span>{courseTitle}</span><StatusBadge status={content.status}/></div></td><td className="course-cell desktop-column">{courseTitle}</td><td className="desktop-column"><StatusBadge status={content.status}/></td><td className="date-cell desktop-column">{when(content.updatedAt)}</td><td><Link className="table-edit" aria-label={`${content.title || '제목 없는 콘텐츠'} 수정`} to={`/admin/contents/${content.id}`}>수정<ArrowRight size={14}/></Link>{['DRAFT', 'REVIEW'].includes(content.status) && (dataMode === 'mock' || /^[1-9]\d*$/.test(content.id)) && <button className="text-button danger" aria-label={`${content.title || '제목 없는 콘텐츠'} 삭제`} disabled={deleting} onClick={() => { setError(null); setTarget(content); }}>삭제</button>}</td></tr>; })}</tbody></table></div> : <div className="empty"><Search size={28} aria-hidden="true"/><h3>표시할 콘텐츠가 없어요</h3><p>{contents.length ? '검색어 또는 필터를 바꿔 다시 확인해 주세요.' : '첫 콘텐츠를 등록하고 영상과 퀴즈를 연결해 주세요.'}</p>{contents.length ? <button type="button" className="button" onClick={() => { setQuery(''); setStatus('ALL'); setCourse(''); }}>검색 조건 초기화</button> : <Link className="button primary" to="/admin/contents/new">콘텐츠 등록</Link>}</div>}
      <div className="table-footer"><span role="status">{loading ? '불러오는 중' : `${results.length}개 표시 · 전체 ${contents.length}개`}</span><span>수정 화면에서 공개 상태를 변경할 수 있습니다.</span></div>
    </section>
    <p className="list-help">공개 필수 항목: 소속 과정, 제목, 재생 가능한 영상, 퀴즈·정답·해설. 실습·업무자료는 선택 사항입니다.</p>
    {target && <Modal title="미공개 콘텐츠를 삭제할까요?" onClose={() => { if (!deleting) setTarget(null); }}><p>{target.title || '제목 없는 콘텐츠'}</p><p className="help">삭제한 콘텐츠는 복구할 수 없습니다. 공개 이력이 있으면 서버에서 삭제를 거절하며, 비공개로 변경해야 합니다.</p><ErrorBox error={error}/><div className="button-row"><button className="button" disabled={deleting} onClick={() => setTarget(null)}>취소</button><button className="button danger" disabled={deleting} onClick={() => void remove()}>{deleting ? '삭제 중…' : '삭제하기'}</button></div></Modal>}
  </>;
}
