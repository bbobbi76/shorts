import { apiBase, dataMode } from '../../data/config';
import type { PublicContent, PublicCourse } from '../../domain/public-model';

export interface AiSearchHit { video_id: string; start: number; end: number; score: number; text: string }

// 백엔드 AI 검색(/api/ai/search). 예시 모드이거나 실패하면 null을 돌려 기존 단어 검색을 쓰게 한다.
export async function aiSearch(query: string, signal?: AbortSignal): Promise<AiSearchHit[] | null> {
  if (dataMode !== 'api' || !query) return null;
  try {
    const response = await fetch(`${apiBase.replace(/\/ui$/, '')}/ai/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, top_k: 12 }), signal,
    });
    if (!response.ok) return null;
    return (await response.json()).results as AiSearchHit[];
  } catch {
    return null;
  }
}

// AI 검색 결과를 검색 카드 형식으로 바꾼다. 자막 구간 시작 시점부터 재생되도록 match를 채운다.
export function aiResults(hits: AiSearchHit[], contents: PublicContent[], courses: PublicCourse[], courseId = '', level = '') {
  return hits.flatMap(hit => {
    const content = contents.find(item => item.id === hit.video_id);
    const course = courses.find(item => item.id === content?.courseId);
    if (!content || !course || (courseId && course.id !== courseId) || (level && course.level !== level)) return [];
    return [{ content, course, match: { startSec: hit.start, text: hit.text }, score: hit.score }];
  });
}
