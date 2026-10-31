import { useEffect, useState } from 'react';
import { ArrowDownToLine, Play } from 'lucide-react';
import { publicRepository } from '../../data/repository';
import type { Media } from '../../domain/model';

export function usePublicMedia(media: Media | null) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl(''); setError('');
    if (!media) return;
    const direct = publicRepository.mediaUrl?.(media) || media.url;
    if (direct) { setUrl(direct); return; }
    publicRepository.mediaBlob(media).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '파일을 열 수 없습니다.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [media?.id, media?.url, attempt]);
  return { url, error, retry: () => setAttempt(value => value + 1) };
}

export function Cover({ media, title }: { media: Media | null; title: string }) {
  const { url } = usePublicMedia(media);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <div className="learn-cover">{url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)}/> : <><span className="learn-cover-label">실무 한 컷</span><strong>{title}</strong><Play size={28} aria-hidden="true"/></>}</div>;
}

export function Download({ media }: { media: Media }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const blob = await publicRepository.mediaBlob(media);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = media.name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '자료를 다운로드하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <div><button className="download-card learn-download" onClick={download} disabled={busy}><ArrowDownToLine size={19}/><span>{media.name}<small>{busy ? '다운로드 준비 중…' : '자료 다운로드'}</small></span></button>{error && <p className="error-box" role="alert">{error} 다시 다운로드해 주세요.</p>}</div>;
}
