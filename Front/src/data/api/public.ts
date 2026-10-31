import { ServiceError } from '../../domain/model';
import type { PublicRepository } from '../../domain/public-model';

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
