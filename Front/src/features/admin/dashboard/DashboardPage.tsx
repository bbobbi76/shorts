import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { repository, dataMode } from '../../../data/repository';
import { type Dashboard, type ServiceError, statusLabels } from '../../../domain/model';
import { toError, when } from '../../../shared/format';
import { ErrorBox, Loading, PageHeading, StatusBadge } from '../../../shared/ui';
import { useApp } from '../context';

function actionLabel(action: string) {
  return ({ CONTENT_DELETE: '콘텐츠 삭제', CONTENT_PUBLISH: '콘텐츠 공개', CONTENT_HIDE: '콘텐츠 비공개', COURSE_PUBLISHED: '과정 공개', COURSE_HIDDEN: '과정 비공개', COURSE_DRAFT: '과정 임시저장' } as Record<string, string>)[action] ?? action;
}
export function DashboardPage() {
  const { handleError, authEpoch } = useApp();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<ServiceError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    repository.dashboard().then(value => { if (active) setData(value); }).catch(reason => { if (active) { setError(toError(reason)); handleError(reason); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authEpoch, handleError, attempt]);
  return <><PageHeading title="관리자 통계" description="등록 현황과 최근 운영 내역을 확인합니다."><button className="button" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16}/>새로고침</button></PageHeading>
    {loading ? <Loading/> : error ? <ErrorBox error={error} retry={() => setAttempt(value => value + 1)}/> : data && <>
      {dataMode === 'mock' && <p className="help">목업 통계입니다. 회원 수 1명은 시연용 관리자이며 실제 가입자 수가 아닙니다.</p>}
      <dl className="admin-stat-grid">{[
        ['등록 회원', data.userCount, '명'], ['전체 과정', data.courseCount, '개'], ['공개 과정', data.publishedCourseCount, '개'], ['전체 콘텐츠', data.contentCount, '개'],
        ['임시저장 콘텐츠', data.draftContentCount, '개'], ['공개 콘텐츠', data.publishedContentCount, '개'], ['비공개 콘텐츠', data.hiddenContentCount, '개'], ['실무자료', data.resourceCount, '개'], ['검색 태그', data.tagCount, '개'],
      ].map(([label, count, unit]) => <div className="panel" key={label}><dt>{label}</dt><dd>{count}<small>{unit}</small></dd></div>)}</dl>
      <div className="admin-dashboard-lists"><section className="panel"><h2>최근 등록 콘텐츠</h2>{data.recentContents.length ? <ul>{data.recentContents.map(item => <li key={item.id}><Link to={`/admin/contents/${encodeURIComponent(item.id)}`}>{item.title || '제목 없는 콘텐츠'}</Link><StatusBadge status={item.status}/><small>{when(item.updatedAt ?? '')}</small></li>)}</ul> : <p className="help">등록된 콘텐츠가 없습니다.</p>}</section>
        <section className="panel"><h2>최근 운영 내역</h2>{data.recentLogs.length ? <ul>{data.recentLogs.map(item => <li key={item.id}><strong>{actionLabel(item.action)}</strong><span>{item.targetType === 'COURSE' ? '과정' : item.targetType === 'CONTENT' ? '콘텐츠' : item.targetType} #{item.targetId}</span><small>{when(item.createdAt ?? '')}</small></li>)}</ul> : <p className="help">기록된 운영 내역이 없습니다.</p>}</section></div>
      <p className="help">콘텐츠 전체 수에는 검수 상태도 포함됩니다. 상태별 수치는 서버가 반환한 {Object.values(statusLabels).join('·')} 기준입니다. 과정에 연결하지 않은 초안은 서버 통계에서 제외됩니다.</p>
    </>}
  </>;
}
