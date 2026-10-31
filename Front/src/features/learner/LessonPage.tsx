import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Play, RotateCcw } from 'lucide-react';
import { publicRepository } from '../../data/repository';
import type { PublicContent } from '../../domain/public-model';
import { Download, usePublicMedia } from './Media';
import { PublicError, Loading } from './BrowsePages';
import { cleanSubtitles, formatTime, startTime, subtitleVtt, useLoad } from './library';
import { learningStore } from './progress';

export default function LessonPage() {
  const { id = '' } = useParams();
  const { value, error, retry } = useLoad(() => publicRepository.content(id), id);
  if (error) return <PublicError message={error} retry={retry}/>;
  if (!value) return <Loading/>;
  return <LessonContent key={value.id} content={value}/>;
}

function LessonContent({ content }: { content: PublicContent }) {
  const course = useLoad(() => Promise.all([publicRepository.course(content.courseId), publicRepository.contents(content.courseId)]), content.courseId);
  const saved = learningStore.get(content.id, content.video?.id ?? '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [noteStatus, setNoteStatus] = useState('');
  const [noteFailed, setNoteFailed] = useState(false);
  const items = course.value?.[1] ?? [];
  const index = items.findIndex(item => item.id === content.id);
  const next = index >= 0 ? items[index + 1] : undefined;
  const [tab, setTab] = useState<'materials' | 'notes'>('materials');
  return <>
    <Link className="learn-back" to={`/learn/courses/${encodeURIComponent(content.courseId)}`}><ArrowLeft size={16}/>과정으로 돌아가기</Link>
    <header className="learn-lesson-heading"><span className="learn-eyebrow">{course.value?.[0].title || '영상 학습'}{content.isExample ? ' · 예시 영상' : ''}</span><h1>{content.title}</h1><p>{content.learningGoal}</p></header>
    <div className="learn-lesson-layout"><div className="learn-lesson-main">
      {content.video ? <VideoPlayer key={content.video.id} content={content}/> : <div className="learn-empty"><h2>재생할 영상이 없습니다</h2><p>아래 학습 안내와 자료를 확인해 주세요.</p></div>}
      {content.workUse && <section className="learn-white-section"><h2>이럴 때 활용해요</h2><p className="pre-wrap">{content.workUse}</p></section>}
      <section className="learn-white-section"><div className="learn-activity-tabs" role="tablist" aria-label="학습 자료와 메모" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextTab = event.key === 'Home' ? 'materials' : event.key === 'End' ? 'notes' : tab === 'materials' ? 'notes' : 'materials';
        setTab(nextTab); document.getElementById(`learn-${nextTab}-tab`)?.focus();
      }}><button role="tab" id="learn-materials-tab" tabIndex={tab === 'materials' ? 0 : -1} aria-selected={tab === 'materials'} aria-controls="learn-materials" onClick={() => setTab('materials')}><FileText size={17}/>실습·업무자료</button><button role="tab" id="learn-notes-tab" tabIndex={tab === 'notes' ? 0 : -1} aria-selected={tab === 'notes'} aria-controls="learn-notes" onClick={() => setTab('notes')}>학습 메모</button></div>
        <div role="tabpanel" id="learn-materials" aria-labelledby="learn-materials-tab" hidden={tab !== 'materials'}>
          {content.practiceText && <div className="learn-practice"><h2>직접 해보기</h2><p className="pre-wrap">{content.practiceText}</p></div>}
          {content.practice && <Download media={content.practice}/>}{content.resource && <Download media={content.resource}/>}
          {content.resources?.map(resource => <section className="learn-resource" key={resource.id}><h2>{resource.title}</h2><p className="pre-wrap">{resource.description}</p>{resource.file && <Download media={resource.file}/ >}{resource.resourceType === 'PROMPT' && resource.promptText && <Prompt text={resource.promptText}/>}</section>)}
          {!content.practiceText && !content.practice && !content.resource && !content.resources?.length && <p className="learn-muted">이 영상에 등록된 실습·업무자료가 없습니다.</p>}
        </div>
        <div role="tabpanel" id="learn-notes" aria-labelledby="learn-notes-tab" hidden={tab !== 'notes'}><label className="learn-note-label" htmlFor="learning-note">기억할 내용이나 실습한 내용을 적어보세요</label><textarea id="learning-note" rows={7} maxLength={5000} value={note} placeholder="배운 점, 다시 확인할 내용, 작성한 수식 등을 자유롭게 적어보세요." onChange={event => {
          const value = event.target.value; setNote(value);
          const ok = learningStore.update(content.id, content.video?.id ?? '', { note: value });
          setNoteFailed(!ok); setNoteStatus(ok ? '이 브라우저에 저장했습니다.' : '메모를 저장하지 못했습니다. 브라우저 저장 설정을 확인하고 내용을 복사해 두세요.');
        }}/><div className="learn-note-meta"><span>{note.length.toLocaleString()} / 5,000자</span><span role={noteFailed ? 'alert' : 'status'}>{noteStatus}</span></div><p className="help">메모는 이 브라우저에만 보관됩니다. 과제 제출이나 AI 채점으로 전송되지 않습니다.</p></div>
      </section>
      <div className="learn-next"><Link className="button" to={`/learn/courses/${encodeURIComponent(content.courseId)}`}>과정 목록</Link>{next && <Link className="button primary" to={`/learn/contents/${encodeURIComponent(next.id)}`}>다음 영상<ArrowRight size={17}/></Link>}</div>
    </div><aside className="learn-lesson-sidebar" aria-label="과정의 다른 영상"><h2>함께 학습하기</h2>{course.error ? <div className="learn-sidebar-error" role="alert"><p>과정 목록을 불러오지 못했습니다.</p><button className="text-button" onClick={course.retry}>다시 시도</button></div> : !course.value ? <p role="status">과정 불러오는 중…</p> : <ol>{items.map((item, i) => <li key={item.id}><Link aria-current={item.id === content.id ? 'page' : undefined} to={`/learn/contents/${encodeURIComponent(item.id)}`}><span>{String(i + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><small>{formatTime(item.video?.duration)}</small></div>{item.id === content.id && <Play size={14}/>}</Link></li>)}</ol>}<p className="help">시청 위치와 메모는 <Link to="/learn/history">내 학습 기록</Link>에서 다시 볼 수 있어요.</p></aside></div>
  </>;
}

function Prompt({ text }: { text: string }) {
  const [notice, setNotice] = useState('');
  return <div className="learn-prompt"><pre>{text}</pre><button className="text-button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setNotice('복사했습니다.'); }
    catch { setNotice('복사하지 못했습니다. 본문을 직접 선택해 복사해 주세요.'); }
  }}><Copy size={16}/>프롬프트 복사</button><span role="status">{notice}</span></div>;
}

function VideoPlayer({ content }: { content: PublicContent }) {
  const media = content.video!;
  const { url, error, retry } = usePublicMedia(media);
  const [params] = useSearchParams();
  const player = useRef<HTMLVideoElement>(null);
  const [saved] = useState(() => learningStore.get(content.id, media.id));
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(media.duration);
  const [playerError, setPlayerError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [trackUrl, setTrackUrl] = useState('');
  const lastSaved = useRef(-10);
  const subtitles = useMemo(() => cleanSubtitles(content.subtitles, duration), [content.subtitles, duration]);
  const requested = params.get('t');
  const target = useRef(startTime(requested, media.duration) ?? (saved?.ended ? 0 : saved?.position ?? 0));
  const [seekNotice, setSeekNotice] = useState('');
  function seek(seconds: number) {
    const element = player.current;
    target.current = seconds;
    if (!element || element.readyState < 1) { setSeekNotice('영상을 불러온 뒤 선택한 구간으로 이동합니다.'); return; }
    const time = startTime(String(seconds), element.duration) ?? 0;
    element.currentTime = time; setCurrent(time); setSeekNotice(`${formatTime(time)} 구간으로 이동했습니다.`);
  }
  useEffect(() => {
    const time = startTime(requested, media.duration);
    if (time !== null) seek(time);
  }, [requested, media.duration]);
  useEffect(() => {
    if (!subtitles.length) return;
    const objectUrl = URL.createObjectURL(new Blob([subtitleVtt(subtitles)], { type: 'text/vtt' }));
    setTrackUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [subtitles]);
  function persist(element: HTMLVideoElement) {
    if (!Number.isFinite(element.duration) || element.duration <= 0 || (element.currentTime === 0 && element.paused)) return true;
    return learningStore.update(content.id, media.id, { position: element.currentTime, duration: element.duration, ended: element.ended });
  }
  useEffect(() => {
    const element = player.current;
    if (!element) return;
    const save = () => { persist(element); };
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', hidden);
    return () => { save(); window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hidden); };
  }, [url, attempt]);
  const lines = subtitles.filter(line => line.text.toLocaleLowerCase().includes(transcriptQuery.trim().toLocaleLowerCase()));
  return <section className="learn-player-section" aria-label="영상과 자막">
    <div className="learn-player-frame">{error || playerError ? <div className="learn-player-error" role="alert"><p>{error || playerError}</p><button className="button" onClick={() => { setPlayerError(''); retry(); setAttempt(value => value + 1); }}>영상 다시 불러오기</button></div> : !url ? <div className="learn-player-loading" role="status">영상을 불러오는 중…</div> : <video key={`${url}:${attempt}`} ref={player} controls preload="metadata" playsInline aria-label={`${content.title} 영상`} src={url}
      onLoadedMetadata={event => { const element = event.currentTarget; const time = startTime(String(target.current), element.duration) ?? 0; element.currentTime = time; setCurrent(time); setDuration(element.duration); }}
      onTimeUpdate={event => { const element = event.currentTarget; setCurrent(element.currentTime); if (Math.abs(element.currentTime - lastSaved.current) >= 5) { lastSaved.current = element.currentTime; setStorageError(!persist(element)); } }}
      onPause={event => setStorageError(!persist(event.currentTarget))} onEnded={event => setStorageError(!persist(event.currentTarget))}
      onError={() => setPlayerError('영상을 재생할 수 없습니다. 공개 상태 또는 파일을 확인해 주세요.')}>
      {trackUrl && <track key={trackUrl} kind="subtitles" src={trackUrl} srcLang="ko" label="한국어" default/>}브라우저가 영상 재생을 지원하지 않습니다.
    </video>}</div>
    <div className="learn-playback-info"><span>{formatTime(current)} / {formatTime(duration)}</span><button className="text-button" onClick={() => seek(0)} disabled={!url || !!playerError}><RotateCcw size={15}/>처음부터 보기</button></div>
    {saved && saved.position > 0 && !saved.ended && <div className="learn-resume"><Check size={16}/><span>이전 시청 위치 {formatTime(saved.position)}부터 이어볼 수 있어요.</span><button className="text-button" onClick={() => seek(saved.position)} disabled={!url || !!playerError}>이어보기</button></div>}
    {storageError && <p className="error-box" role="alert">시청 위치를 저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.</p>}
    <span className="sr-only" role="status">{seekNotice}</span>
    <details className="learn-transcript" open><summary>영상 자막 <span>{subtitles.length}개 구간</span></summary>{subtitles.length ? <><label className="learn-transcript-search">자막에서 찾기<input type="search" value={transcriptQuery} onChange={event => setTranscriptQuery(event.target.value)} placeholder="다시 보고 싶은 단어"/></label><div className="learn-transcript-lines">{lines.map((line, index) => <button key={`${line.id}:${index}`} className={current >= line.startSec && current < line.endSec ? 'is-current' : ''} aria-label={`${formatTime(line.startSec)}부터 보기: ${line.text}`} aria-pressed={current >= line.startSec && current < line.endSec} onClick={() => seek(line.startSec)}><time>{formatTime(line.startSec)}</time><span>{line.text}</span><Play size={13}/></button>)}{!lines.length && <p className="learn-muted">일치하는 자막이 없습니다.</p>}</div></> : <p className="learn-muted">이 영상에 등록된 자막이 없습니다.</p>}</details>
  </section>;
}
