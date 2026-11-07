import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it('API 모드에서는 검색을 백엔드 AI 경로에 전달한다', async () => {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  vi.stubEnv('VITE_API_BASE_URL', '/api/ui');
  const hits = [{ video_id: '2', start: 15, end: 20, score: .9, text: '조건 합계' }];
  const fetcher = vi.fn().mockResolvedValue(Response.json({ results: hits }));
  vi.stubGlobal('fetch', fetcher);
  const { aiSearch } = await import('../aiSearch');
  expect(await aiSearch('부서별 합계')).toEqual(hits);
  expect(fetcher.mock.calls[0][0]).toBe('/api/ai/search');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ query: '부서별 합계', top_k: 12 });
});

it('검색 서버 장애 시 기존 단어 검색으로 복귀한다', async () => {
  vi.stubEnv('VITE_DATA_MODE', 'api');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  const { aiSearch } = await import('../aiSearch');
  expect(await aiSearch('합계')).toBeNull();
});

it('예시 모드에서는 외부 검색을 호출하지 않는다', async () => {
  vi.stubEnv('VITE_DATA_MODE', 'mock');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { aiSearch } = await import('../aiSearch');
  expect(await aiSearch('합계')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
