import { useState } from 'react';
import { ServiceError } from '../../../domain/model';
import { dataMode, repository } from '../../../data/repository';
import { toError } from '../../../shared/format';
import { Field, ErrorBox } from '../../../shared/ui';

export function Login({ onSuccess }: { onSuccess: (value: { name: string }) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { onSuccess(await repository.login(email, password)); } catch (e) { setError(toError(e).message); } finally { setBusy(false); } }}>
    <p className="muted">{dataMode === 'mock' ? '시연용 관리자 세션입니다. 비밀번호 없이 화면을 확인할 수 있어요.' : '관리자 계정으로 로그인해 주세요. 작성 중인 내용은 유지됩니다.'}</p>
    {dataMode === 'api' && <><Field label="이메일" required><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></Field><Field label="비밀번호" required><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></Field></>}
    {error && <ErrorBox error={new ServiceError(error)}/>}
    <button className="button primary full" disabled={busy}>{busy ? '로그인 중…' : dataMode === 'mock' ? '관리자로 입장' : '로그인'}</button>
  </form>;
}
