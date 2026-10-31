import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApiRepository } from '../api/admin';
import { mockRepository } from '../mock/admin';
import { emptyContent, emptyCourse } from '../../domain/model';
import { validateContent } from '../../domain/validation';

const storage = new Map<string, string>();
vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
beforeEach(() => storage.clear());
function service() {
  return vi.fn<typeof fetch>(async url => {
    if (String(url) === '/api/auth/login') return Response.json({ token: 'bearer-token', role: 'ADMIN' });
    if (String(url) === '/api/ui/auth/login' || String(url) === '/api/ui/auth/session') return Response.json({ name: '관리자', role: 'admin', csrfToken: 'csrf' });
    if (String(url).endsWith('/contents/order') || String(url).endsWith('/courses/2/contents')) return Response.json([{ id: 3, title: '영상', status: 'DRAFT', sortOrder: 1, durationSec: 20 }]);
    if (String(url) === '/api/admin/contents/3') return new Response(null, { status: 204 });
    return Response.json([]);
  });
}
it('한 번 로그인으로 쿠키·Bearer 인증을 받고 비밀번호 대신 토큰만 탭 저장소에 보관한다', async () => {
  const fetcher = service(); const api = createApiRepository('/api/ui', fetcher);
  await api.login('admin@example.test', 'private-test-password');
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/ui/auth/login', '/api/auth/login']);
  expect([...storage.values()]).toEqual(['bearer-token']);
  const refreshed = createApiRepository('/api/ui', fetcher);
  await refreshed.dashboard();
  const last = fetcher.mock.calls.at(-1)!;
  expect(last[0]).toBe('/api/admin/dashboard');
  expect(new Headers(last[1]?.headers).get('Authorization')).toBe('Bearer bearer-token');
  expect(fetcher.mock.calls.at(-2)?.[0]).toBe('/api/ui/auth/session');
});
it('분야·스킬은 쿠키용 API에서 가져오고 삭제·순서 변경은 인증된 기존 API를 사용한다', async () => {
  const fetcher = service(); const api = createApiRepository('/api/ui', fetcher);
  await api.login('admin@example.test', 'test');
  await api.categories(); await api.skills();
  expect(fetcher.mock.calls.slice(2).map(([url]) => url)).toEqual(['/api/ui/admin/categories', '/api/ui/admin/skills']);
  await api.removeContent('3');
  expect(fetcher.mock.calls.at(-1)?.[1]?.method).toBe('DELETE');
  expect((await api.reorderContents('2', ['3']))[0].id).toBe('3');
  expect(JSON.parse(fetcher.mock.calls.at(-1)![1]!.body as string)).toEqual({ contentIds: [3] });
  await expect(api.removeContent('unassigned-uuid')).rejects.toMatchObject({ status: 422 });
});
it('서버의 관리자 세션이 만료되면 남아 있는 Bearer만으로 저장하지 않는다', async () => {
  const fetcher = service(); const api = createApiRepository('/api/ui', fetcher);
  await api.login('admin@example.test', 'test');
  fetcher.mockImplementation(async () => Response.json({ message: 'expired' }, { status: 401 }));
  await expect(api.removeContent('3')).rejects.toMatchObject({ status: 401 });
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe('/api/ui/auth/session');
});
it('보조 인증 실패 시 쿠키 세션도 취소하고 일부 로그인 성공으로 처리하지 않는다', async () => {
  const fetcher = service();
  fetcher.mockImplementation(async url => String(url) === '/api/auth/login' ? Response.json({ message: 'denied' }, { status: 403 }) : Response.json({ name: '관리자', role: 'admin', csrfToken: 'csrf' }));
  await expect(createApiRepository('/api/ui', fetcher).login('admin@example.test', 'test')).rejects.toMatchObject({ status: 403 });
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe('/api/ui/auth/logout');
  expect(storage.size).toBe(0);
});
it('로그아웃에서 두 인증을 모두 해제하고 저장된 토큰을 제거한다', async () => {
  const fetcher = service(); const api = createApiRepository('/api/ui', fetcher);
  await api.login('admin@example.test', 'test'); await api.logout();
  expect(fetcher.mock.calls.slice(-2).map(([url]) => url)).toEqual(['/api/ui/auth/logout', '/api/auth/logout']);
  expect(storage.size).toBe(0);
  await expect(api.dashboard()).rejects.toMatchObject({ status: 401 });
});
it('서버에서 추가한 고정 목록 밖의 스킬을 검증하고 선택한 ID를 보존한다', () => {
  const content = { ...emptyContent(), skillIds: ['99'] };
  const catalog = { courses: [], tags: [], resources: [], skills: [{ id: '99', categoryId: '99', name: '서버 스킬', description: '' }] };
  expect(() => validateContent(content, catalog)).not.toThrow();
  expect(() => validateContent({ ...content, skillIds: ['100'] }, catalog)).toThrow('스킬');
});
it('목업에서도 과정 전체 순서를 검증하고 공개 이력이 있는 항목을 삭제하지 않는다', async () => {
  await mockRepository.login('', '');
  const course = await mockRepository.saveCourse({ ...emptyCourse(), title: '순서 테스트' }, true);
  const a = await mockRepository.saveContent({ ...emptyContent(), courseId: course.id, title: '첫째' }, true);
  const b = await mockRepository.saveContent({ ...emptyContent(), courseId: course.id, title: '둘째' }, true);
  await expect(mockRepository.reorderContents(course.id, [a.id, a.id])).rejects.toMatchObject({ status: 400 });
  expect((await mockRepository.reorderContents(course.id, [b.id, a.id])).map(item => item.id)).toEqual([b.id, a.id]);
  await mockRepository.removeContent(a.id);
  await expect(mockRepository.content(a.id)).rejects.toMatchObject({ status: 404 });
  const historical = await mockRepository.saveContent({ ...emptyContent(), title: '공개 이력', publishedAt: '2026-01-01T00:00:00Z' }, true);
  await expect(mockRepository.removeContent(historical.id)).rejects.toMatchObject({ status: 400 });
});
