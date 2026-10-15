import { type Content, type Course, type Media, type Repository, type Session, ServiceError, emptyContent, publishIssues, validateFile } from './model';
import type { PublicContent, PublicCourse, PublicRepository } from './public-model';

export const dataMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'mock';
export const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
interface DemoState { courses: Course[]; contents: Content[]; media: Record<string, { info: Media; blob: Blob }> }
const seed = (): DemoState => {
  const now = new Date().toISOString();
  const course: Course = { id: 'excel-basics', title: '신입 직장인을 위한 엑셀 기초', description: '업무에 바로 쓰는 엑셀의 기본기를 짧게 배우는 과정입니다.', objective: '조건별 합계와 데이터 정리의 기본을 익힙니다.', job: '공통 실무', topic: '엑셀', level: '기초', updatedAt: now };
  return { courses: [course], contents: ['SUMIF 함수로 조건별 합계 구하기', '필터로 필요한 데이터만 찾기', '피벗 테이블로 매출 요약하기'].map((title, index) => ({ ...emptyContent(), id: `sample-${index + 1}`, title, courseId: course.id, updatedAt: now })), media: {} };
};
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('douzone-admin-demo-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new ServiceError('브라우저 저장소를 열 수 없습니다. 저장소 사용 설정을 확인해 주세요.')); };
    request.onblocked = () => { database = undefined; reject(new ServiceError('다른 탭을 닫고 다시 시도해 주세요.')); };
  });
}
async function stateAction<T>(change: (state: DemoState) => T, write = false): Promise<T> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    // Always read-write so first-use seeding and concurrent changes are atomic.
    const transaction = connection.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    const request = store.get('data');
    let result: T;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const current: DemoState = request.result ?? seed();
        result = change(current);
        if (write || !request.result) store.put(current, 'data');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure ?? new ServiceError('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'));
  });
}
const copy = <T,>(value: T): T => structuredClone(value);
const wait = () => new Promise(resolve => setTimeout(resolve, 200));
function checkDemoAuth() {
  const role = sessionStorage.getItem('demo-role') ?? 'admin';
  if (role === 'signed-out') throw new ServiceError('로그인이 필요합니다. 입력한 내용은 현재 화면에 유지됩니다.', 401);
  if (role !== 'admin') throw new ServiceError('관리자 권한이 없습니다.', 403);
}
function demoFault(kind: 'save' | 'upload') {
  if (sessionStorage.getItem('demo-failure') === kind) {
    sessionStorage.removeItem('demo-failure');
    throw new ServiceError(`${kind === 'upload' ? '업로드' : '저장'} 실패를 재현했습니다. 입력 내용을 확인하고 다시 시도해 주세요.`, 503);
  }
}
function found<T>(value: T | undefined): T { if (!value) throw new ServiceError('해당 항목을 찾을 수 없습니다.', 404); return value; }
export const mockRepository: Repository = {
  async session() { await wait(); checkDemoAuth(); return { name: '관리자', role: 'admin' }; },
  async login(_email, _password) { sessionStorage.setItem('demo-role', 'admin'); return { name: '관리자', role: 'admin' }; },
  async logout() { sessionStorage.setItem('demo-role', 'signed-out'); },
  async courses() { await wait(); checkDemoAuth(); return stateAction(s => copy(s.courses)); },
  async course(id) { checkDemoAuth(); return stateAction(s => copy(found(s.courses.find(c => c.id === id)))); },
  async saveCourse(value) {
    await wait(); checkDemoAuth(); demoFault('save');
    if (!value.title.trim()) throw new ServiceError('과정명을 입력해 주세요.', 422);
    return stateAction(s => { const saved = { ...copy(value), title: value.title.trim(), updatedAt: new Date().toISOString() }; s.courses = [...s.courses.filter(c => c.id !== saved.id), saved]; return saved; }, true);
  },
  async contents() { await wait(); checkDemoAuth(); return stateAction(s => copy(s.contents)); },
  async content(id) { checkDemoAuth(); return stateAction(s => copy(found(s.contents.find(c => c.id === id)))); },
  async saveContent(value) {
    await wait(); checkDemoAuth(); demoFault('save');
    return stateAction(s => {
      if (value.status === 'PUBLISHED') { const errors = publishIssues(value, s.courses); if (errors.length) throw new ServiceError('공개 중인 콘텐츠의 필수 항목을 확인해 주세요.', 422, errors); }
      for (const asset of [value.video, value.thumbnail, value.practice, value.resource]) if (asset && !s.media[asset.id]) throw new ServiceError('파일이 저장소에 없습니다. 다시 업로드해 주세요.', 422);
      const saved = { ...copy(value), title: value.title.trim(), updatedAt: new Date().toISOString() };
      s.contents = [...s.contents.filter(c => c.id !== saved.id), saved]; return saved;
    }, true);
  },
  async transition(id, action) {
    await wait(); checkDemoAuth(); demoFault('save');
    return stateAction(s => {
      const value = found(s.contents.find(c => c.id === id));
      if (action === 'publish') { const errors = publishIssues(value, s.courses); if (errors.length) throw new ServiceError('공개에 필요한 항목을 확인해 주세요.', 422, errors); }
      value.status = action === 'publish' ? 'PUBLISHED' : 'PRIVATE'; value.updatedAt = new Date().toISOString(); return copy(value);
    }, true);
  },
  async upload(file, kind, metadata) {
    await wait(); checkDemoAuth(); demoFault('upload'); validateFile(file, kind);
    const info: Media = { ...metadata, id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, kind };
    return stateAction(s => { s.media[info.id] = { info, blob: file }; return info; }, true);
  },
  async mediaBlob(media) { checkDemoAuth(); return stateAction(s => found(s.media[media.id]).blob); },
};

export function createApiRepository(base: string, fetcher: typeof fetch = fetch): Repository {
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
export const repository = dataMode === 'api' ? createApiRepository(apiBase) : mockRepository;

function publicContent(value: Content): PublicContent {
  const { id, courseId, title, objective, video, thumbnail, practiceText, practice, resource, updatedAt } = value;
  return copy({ id, courseId, title, objective, video, thumbnail, practiceText, practice, resource, updatedAt });
}
function published(state: DemoState) { return state.contents.filter(value => value.status === 'PUBLISHED' && state.courses.some(course => course.id === value.courseId)); }
const exampleCourse: PublicCourse = { id: 'example-excel', title: '엑셀 기초: 자주 쓰는 합계 함수', description: '조건에 맞는 매출을 빠르게 합산하는 방법을 짧은 영상으로 살펴봅니다.', objective: 'SUMIF 함수의 조건 범위와 합계 범위를 구분합니다.', job: '공통 실무', topic: '엑셀', level: '기초', updatedAt: '', isExample: true };
const exampleContent: PublicContent = { id: 'example-sumif', courseId: exampleCourse.id, title: 'SUMIF로 조건별 합계 구하기', objective: '부서별 매출 표에서 원하는 부서의 합계를 구하는 예시입니다.', video: { id: 'example-video', name: 'SUMIF_예시영상.mp4', size: 13_172, type: 'video/mp4', kind: 'video', duration: 8, url: '/demo-sample.mp4' }, thumbnail: null, practiceText: '부서명이 “영업”인 행의 매출 합계를 구해 보세요.', practice: null, resource: null, updatedAt: '', isExample: true };
function visibleContents(state: DemoState): PublicContent[] {
  const items = published(state);
  return items.length ? items.map(publicContent) : [copy(exampleContent)];
}
export const mockPublicRepository: PublicRepository = {
  async courses() { await wait(); return stateAction(s => { const items = visibleContents(s); return items[0]?.isExample ? [copy(exampleCourse)] : copy(s.courses.filter(course => items.some(content => content.courseId === course.id))); }); },
  async course(id) { return stateAction(s => { const items = visibleContents(s); if (items[0]?.isExample && id === exampleCourse.id) return copy(exampleCourse); if (!items.some(c => c.courseId === id)) throw new ServiceError('공개된 과정을 찾을 수 없습니다.', 404); return copy(found(s.courses.find(c => c.id === id))); }); },
  async contents(courseId) { await wait(); return stateAction(s => visibleContents(s).filter(c => !courseId || c.courseId === courseId).map(copy)); },
  async content(id) { return stateAction(s => copy(found(visibleContents(s).find(c => c.id === id)))); },
  async mediaBlob(media) { return stateAction(s => { if (!published(s).some(c => [c.video, c.thumbnail, c.practice, c.resource].some(file => file?.id === media.id))) throw new ServiceError('현재 공개되지 않은 파일입니다.', 404); return found(s.media[media.id]).blob; }); },
};
export function createPublicApiRepository(base: string, fetcher: typeof fetch = fetch): PublicRepository {
  async function request<T>(path: string, binary = false): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), binary ? 120_000 : 20_000);
    try {
      const response = await fetcher(`${base}${path}`, { credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new ServiceError(response.status === 404 ? '공개된 자료를 찾을 수 없습니다.' : '자료를 불러오지 못했습니다. 로그인 또는 서버 연결을 확인해 주세요.', response.status);
      return binary ? await response.blob() as T : await response.json() as T;
    } catch (error) { if (error instanceof ServiceError) throw error; throw new ServiceError(controller.signal.aborted ? '응답 시간이 초과되었습니다. 다시 시도해 주세요.' : '서버에 연결할 수 없습니다. 다시 시도해 주세요.'); }
    finally { clearTimeout(timer); }
  }
  return {
    courses: () => request('/courses'), course: id => request(`/courses/${encodeURIComponent(id)}`),
    contents: courseId => request(`/contents${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`), content: id => request(`/contents/${encodeURIComponent(id)}`),
    mediaBlob: media => request(`/media/${encodeURIComponent(media.id)}/file`, true),
  };
}
export const publicRepository = dataMode === 'api' ? createPublicApiRepository(apiBase) : mockPublicRepository;
