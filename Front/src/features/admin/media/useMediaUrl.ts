import { useEffect, useState } from 'react';
import { type Media } from '../../../domain/model';
import { repository } from '../../../data/repository';
import { useApp } from '../context';
import { toError } from '../../../shared/format';

export function useMediaUrl(media: Media | null) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [retry, setRetry] = useState(0); const { handleError, authEpoch } = useApp();
  useEffect(() => {
    let active = true; let objectUrl = ''; setUrl(''); setError('');
    if (media) repository.mediaBlob(media).then(blob => { if (active && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (active) { setError(toError(e).message); handleError(e); } });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [media?.id, retry, handleError, authEpoch]);
  return { url, error, retry: () => setRetry(n => n + 1) };
}
