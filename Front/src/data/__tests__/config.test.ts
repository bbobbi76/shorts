import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it('설정이 없으면 관리자·자료·사용자 저장소가 모두 목업을 사용한다', async () => {
  vi.stubEnv('VITE_DATA_MODE', undefined);
  vi.resetModules();
  const data = await import('../repository');
  expect(data.dataMode).toBe('mock');
  expect(data.repository).toBe(data.mockRepository);
  expect(data.catalogRepository).toBe(data.mockCatalogRepository);
  expect(data.publicRepository).toBe(data.mockPublicRepository);
});

it('API 설정이면 세 저장소 모두 실제 HTTP 어댑터로 전환한다', async () => {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  vi.stubEnv('VITE_API_BASE_URL', '/api/ui');
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([]));
  vi.stubGlobal('fetch', fetcher);
  vi.resetModules();
  const data = await import('../repository');
  expect(data.dataMode).toBe('api');
  await data.repository.courses();
  await data.catalogRepository.read();
  await data.publicRepository.courses();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/api/ui/admin/courses', '/api/ui/admin/catalog', '/api/ui/courses',
  ]);
  for (const [, init] of fetcher.mock.calls) expect(init?.credentials).toBe('include');
});
