import { ServiceError } from '../../domain/model';
import type { PracticeFeedback } from '../../domain/public-model';

export function feedbackUrl(base: string) {
  return `${base.replace(/\/$/, '').replace(/\/ui$/, '')}/ai/feedback`;
}

export async function submitFeedback(base: string, practiceId: number, answer: string,
  answerType: 'FORMULA' | 'RESULT', signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<PracticeFeedback> {
  try {
    const response = await fetcher(feedbackUrl(base), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ practice_id: practiceId, learner_answer: answer.trim(), answer_type: answerType }),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        404: '평가 가능한 실습이 없습니다. 영상의 공개 상태를 확인해 주세요.',
        422: '실습 번호와 답안 형식을 확인해 주세요.',
        502: 'AI 응답을 처리하지 못했습니다. 잠시 후 다시 제출해 주세요.',
        503: '평가 서비스가 준비되지 않았습니다. 담당자에게 DB·AI 제공자 설정 확인을 요청해 주세요.',
      };
      throw new ServiceError(messages[response.status] || '피드백 요청에 실패했습니다. 잠시 후 다시 제출해 주세요.', response.status);
    }
    return await response.json() as PracticeFeedback;
  } catch (error) {
    if (signal.aborted) throw new ServiceError('평가 대기 시간이 초과되었거나 요청이 취소되었습니다. 다시 제출해 주세요.');
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('피드백 서버에 연결할 수 없습니다. 잠시 후 다시 제출해 주세요.');
  }
}
