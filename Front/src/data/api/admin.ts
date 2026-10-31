import { validateFile, ServiceError, type Repository, type Catalog, type SearchTag, type WorkResource, type Session } from '../../domain/model';

export function createApiRepository(base: string, fetcher: typeof fetch = fetch): Repository & {
  readCatalog(): Promise<Catalog>;
  saveTag(value: SearchTag): Promise<SearchTag>;
  saveResource(value: WorkResource): Promise<WorkResource>;
} {
  let csrfToken = '';
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init.body instanceof FormData ? 120_000 : 20_000);
    try {
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
      if (csrfToken && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', csrfToken);
      const response = await fetcher(`${base}${path}`, { ...init, headers, credentials: 'include', signal: controller.signal });
      const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
      if (!response.ok) throw new ServiceError(payload?.message ?? ({ 401: '로그인이 만료되었습니다. 다시 로그인해 주세요.', 403: '이 작업을 수행할 권한이 없습니다.', 404: '요청한 자료를 찾을 수 없습니다.' }[response.status] ?? '요청을 처리하지 못했습니다. 다시 시도해 주세요.'), response.status, Array.isArray(payload?.fields) ? payload.fields : []);
      if (response.status !== 204 && !payload) throw new ServiceError('서버 응답 형식이 올바르지 않습니다. API 연결을 확인해 주세요.');
      return payload;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(controller.signal.aborted ? '서버 응답 시간이 초과되었습니다. 입력 내용은 유지됩니다. 저장 여부를 조회한 후 다시 시도해 주세요.' : '서버에 연결할 수 없습니다. 입력 내용은 유지됩니다. 서버 실행 상태를 확인해 주세요.');
    } finally { clearTimeout(timeout); }
  }
  async function auth(path: string, init?: RequestInit): Promise<Session> {
    const value = await request<Session & { csrfToken?: string }>(path, init); csrfToken = value.csrfToken ?? '';
    if (value.role !== 'admin') throw new ServiceError('관리자 권한이 없습니다.', 403);
    return value;
  }
  return {
    readCatalog: () => request('/admin/catalog'),
    saveTag: value => request('/admin/tags', { method: 'POST', body: JSON.stringify(value) }),
    saveResource: value => request('/admin/resources', { method: 'POST', body: JSON.stringify(value) }),
    session: () => auth('/auth/session'),
    login: (email, password) => auth('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    courses: () => request('/admin/courses'), course: id => request(`/admin/courses/${encodeURIComponent(id)}`),
    saveCourse: (value, isNew) => request(`/admin/courses${isNew ? '' : `/${encodeURIComponent(value.id)}`}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Idempotency-Key': value.id }, body: JSON.stringify(value) }),
    contents: () => request('/admin/contents'), content: id => request(`/admin/contents/${encodeURIComponent(id)}`),
    saveContent: (value, isNew) => request(`/admin/contents${isNew ? '' : `/${encodeURIComponent(value.id)}`}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Idempotency-Key': value.id }, body: JSON.stringify(value) }),
    transition: (id, action) => request(`/admin/contents/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
    upload: (file, kind) => { validateFile(file, kind); const body = new FormData(); body.append('file', file); body.append('kind', kind); return request('/admin/media', { method: 'POST', body }); },
    // Authenticated media is fetched to a local object URL; private URLs never bypass cookies.
    async mediaBlob(media) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetcher(`${base}/admin/media/${encodeURIComponent(media.id)}/file`, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new ServiceError('파일을 불러올 수 없습니다.', response.status);
        return await response.blob();
      } catch (error) { if (error instanceof ServiceError) throw error; throw new ServiceError('파일 연결이 끊어졌습니다. 다시 시도해 주세요.'); }
      finally { clearTimeout(timer); }
    },
  };
}
