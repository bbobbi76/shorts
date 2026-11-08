import { expect, it, vi } from 'vitest';
import { feedbackUrl, submitFeedback } from '../api/feedback';

it('실습 ID와 학습자 답안만 보내며 UI 경로와 배포 prefix를 구분한다', async () => {
  expect(feedbackUrl('https://example.test/api/ui/')).toBe('https://example.test/api/ai/feedback');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'needs_review', score: null }));
  const result = await submitFeedback('/api/ui', 192, ' =SUM(A:A) ', 'FORMULA', new AbortController().signal, fetcher);
  expect(result.score).toBeNull();
  expect(fetcher.mock.calls[0][0]).toBe('/api/ai/feedback');
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({practice_id: 192, learner_answer: '=SUM(A:A)', answer_type: 'FORMULA'});
});

it.each([404, 422, 502, 503])('HTTP %s 오류를 사용자에게 알리고 목업으로 대체하지 않는다', async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', {status}));
  await expect(submitFeedback('/api/ui', 1, 'answer', 'RESULT', new AbortController().signal, fetcher)).rejects.toMatchObject({status});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
