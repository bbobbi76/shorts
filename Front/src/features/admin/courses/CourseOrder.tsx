import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, RotateCcw } from 'lucide-react';
import { repository } from '../../../data/repository';
import { type ContentOrderItem, type Course, type ServiceError } from '../../../domain/model';
import { toError } from '../../../shared/format';
import { ErrorBox, Loading, PageHeading, StatusBadge } from '../../../shared/ui';
import { useApp } from '../context';

export function CourseOrder() {
  const { id = '' } = useParams();
  return <OrderEditor key={id} id={id}/>;
}
function OrderEditor({ id }: { id: string }) {
  const { authEpoch, handleError, setDirty, notify } = useApp();
  const [course, setCourse] = useState<Course | null>(null);
  const [items, setItems] = useState<ContentOrderItem[]>([]);
  const [saved, setSaved] = useState<ContentOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  const lock = useRef(false);
  const changed = items.map(item => item.id).join(',') !== saved.map(item => item.id).join(',');
  useEffect(() => {
    if (loaded.current) return;
    let active = true; setLoading(true); setError(null);
    Promise.all([repository.course(id), repository.courseContents(id)]).then(([value, rows]) => {
      if (active) { setCourse(value); setItems(rows); setSaved(rows); loaded.current = true; }
    }).catch(reason => { if (active) { setError(toError(reason)); handleError(reason); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, authEpoch, handleError, attempt]);
  function move(index: number, direction: number) {
    const next = [...items], destination = index + direction;
    if (busy || destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    setItems(next); setDirty(next.map(item => item.id).join(',') !== saved.map(item => item.id).join(',')); setError(null);
  }
  function reload() {
    if (changed && !window.confirm('저장하지 않은 순서를 버리고 목록을 다시 불러올까요?')) return;
    loaded.current = false; setDirty(false); setAttempt(value => value + 1);
  }
  async function save() {
    if (lock.current || !changed) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const rows = await repository.reorderContents(id, items.map(item => item.id));
      setItems(rows); setSaved(rows); setDirty(false); notify('영상 순서를 저장했습니다.');
    } catch (reason) { setError(toError(reason)); handleError(reason); }
    finally { setBusy(false); lock.current = false; }
  }
  return <><Link className="back-link" to="/admin/courses"><ArrowLeft size={16}/>과정 목록</Link><PageHeading title="과정 내 영상 순서" description={course ? course.title : '과정의 콘텐츠를 불러옵니다.'}/>
    {loading ? <Loading/> : !loaded.current ? <ErrorBox error={error} retry={() => setAttempt(value => value + 1)}/> : <section className="panel admin-order-panel"><p className="help">위·아래 버튼으로 순서를 바꾼 뒤 저장하세요. 비공개·임시저장 항목도 포함한 과정 전체 순서이며, 공개된 항목은 사용자 화면에도 이 순서로 표시됩니다.</p>
      <ol className="admin-order-list">{items.map((item, index) => <li key={item.id}><span className="section-number">{index + 1}</span><div><Link to={`/admin/contents/${encodeURIComponent(item.id)}`}>{item.title || '제목 없는 콘텐츠'}</Link><StatusBadge status={item.status}/></div><div className="button-row"><button className="icon-button" aria-label={`${item.title || '제목 없는 콘텐츠'} 위로 이동`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={17}/></button><button className="icon-button" aria-label={`${item.title || '제목 없는 콘텐츠'} 아래로 이동`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17}/></button></div></li>)}</ol>
      {!items.length && <p className="empty">이 과정에 연결된 콘텐츠가 없습니다.</p>}
      <ErrorBox error={error} retry={!busy ? reload : undefined}/><div className="form-bottom"><button className="button" disabled={!changed || busy} onClick={() => { setItems(saved); setDirty(false); setError(null); }}><RotateCcw size={16}/>변경 취소</button><button className="button primary" disabled={!changed || busy} onClick={() => void save()}>{busy ? '저장 중…' : '순서 저장'}</button></div><span className="sr-only" role="status">{changed ? '변경한 순서는 아직 저장되지 않았습니다.' : '현재 저장된 영상 순서입니다.'}</span>
    </section>}
  </>;
}
