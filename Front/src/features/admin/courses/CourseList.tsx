import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Plus } from 'lucide-react';
import { levelLabels, type Course, ServiceError } from '../../../domain/model';
import { repository } from '../../../data/repository';
import { useMetadata, MetadataStatus } from '../metadata';
import { useApp } from '../context';
import { toError, when } from '../../../shared/format';
import { PageHeading, Loading, ErrorBox, StatusBadge } from '../../../shared/ui';

export function CourseList() {
  const [courses, setCourses] = useState<Course[]>([]); const [error, setError] = useState<ServiceError | null>(null); const [loading, setLoading] = useState(true); const [reload, setReload] = useState(0);
  const { handleError, authEpoch } = useApp();
  const { categories } = useMetadata(); const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? '분야 확인 필요';
  useEffect(() => { let active = true; setLoading(true); repository.courses().then(list => { if (active) { setCourses(list); setError(null); } }).catch(e => { if (active) { setError(toError(e)); handleError(e); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [authEpoch, reload, handleError]);
  return <><PageHeading title="과정 관리" description="과정의 소개, 학습 목표와 분류를 관리합니다."><Link className="button primary" to="/admin/courses/new"><Plus size={18}/>과정 등록</Link></PageHeading><MetadataStatus/><section className="panel library-panel" aria-busy={loading}><div className="library-top"><h2>학습 과정 <span>{loading ? '—' : courses.length}</span></h2></div>{loading ? <Loading/> : error ? <ErrorBox error={error} retry={() => setReload(n => n + 1)}/> : courses.length ? <div className="table-scroll"><table className="course-table"><caption className="sr-only">과정명, 직무, 주제와 난이도</caption><thead><tr><th scope="col">과정</th><th scope="col" className="desktop-column">교육 분야</th><th scope="col" className="desktop-column">난이도</th><th scope="col" className="desktop-column">수정일</th><th scope="col">관리</th></tr></thead><tbody>{courses.map(course => <tr key={course.id}><td><h3 className="course-title"><Link to={`/admin/courses/${course.id}`}>{course.title}</Link></h3><StatusBadge status={course.status}/><p className="course-description">{course.summary || '과정 소개 없음'}</p><div className="mobile-meta"><span>{categoryName(course.categoryId)} · {levelLabels[course.level]}</span></div></td><td className="desktop-column">{categories.find(c => c.id === course.categoryId)?.categoryType === 'JOB' ? '직무별' : '공통 실무'}<br/><span className="muted">{categoryName(course.categoryId)}</span></td><td className="desktop-column">{levelLabels[course.level]}</td><td className="date-cell desktop-column">{when(course.updatedAt)}</td><td><Link className="table-edit" to={`/admin/courses/${course.id}`} aria-label={`${course.title} 과정 수정`}>과정 수정<ArrowRight size={14}/></Link><Link className="table-edit" to={`/admin/courses/${course.id}/order`} aria-label={`${course.title} 영상 순서 변경`}>영상 순서</Link></td></tr>)}</tbody></table></div> : <div className="empty"><BookOpen size={28} aria-hidden="true"/><h3>등록된 과정이 없습니다</h3><p>콘텐츠를 연결할 과정을 먼저 등록해 주세요.</p><Link className="button primary" to="/admin/courses/new">과정 등록</Link></div>}</section></>;
}
