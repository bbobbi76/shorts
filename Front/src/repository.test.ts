import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyContent, emptyCourse, publishIssues, ServiceError, validateFile } from './model';
import { createApiRepository, mockRepository } from './repository';

const storage = new Map<string, string>();
vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
beforeEach(() => storage.clear());

describe('공개 검증 및 업로드 정책', () => {
  it('빈 초안은 공개에 필요한 항목을 모두 알려준다', () => {
    const issues = publishIssues(emptyContent(), []);
    expect(issues.some(i => i.includes('과정'))).toBe(true);
    expect(issues.some(i => i.includes('영상'))).toBe(true);
    expect(issues.some(i => i.includes('정답'))).toBe(true);
  });
  it('실습·썸네일·템플릿 없이도 필수 항목을 채우면 공개할 수 있다', () => {
    const course = emptyCourse();
    const content = { ...emptyContent(), courseId: course.id, title: 'SUMIF', video: { id: 'v', name: 'a.mp4', kind: 'video' as const, size: 1, type: 'video/mp4', duration: 60 }, quiz: { question: '함수는?', options: ['SUMIF', 'COUNT'], correctIndex: 0, explanation: '조건별 합계' } };
    expect(publishIssues(content, [course])).toEqual([]);
    expect(publishIssues({ ...content, quiz: { ...content.quiz, correctIndex: 9 } }, [course])).toContain('퀴즈 정답을 선택해 주세요.');
  });
  it('빈 파일과 지원하지 않는 확장자·대용량 파일을 거절한다', () => {
    expect(() => validateFile(new File([], 'empty.mp4'), 'video')).toThrow('빈 파일');
    expect(() => validateFile(new File(['x'], 'file.exe'), 'practice')).toThrow('지원하지 않는');
    expect(() => validateFile({ name: 'a.mp4', size: 101 * 1024 * 1024 } as File, 'video')).toThrow('100MB');
    expect(() => validateFile(new File(['x'], '자료.XLSX'), 'resource')).not.toThrow();
  });
});

describe('예시 저장소', () => {
  it('과정을 저장한 뒤 독립 조회로 내용을 복원한다', async () => {
    const course = { ...emptyCourse(), title: '새 엑셀 과정' };
    const saved = await mockRepository.saveCourse(course, true);
    expect((await mockRepository.course(saved.id)).title).toBe(course.title);
  });
  it('초안을 저장하고 수정해도 ID별 항목이 중복 생성되지 않는다', async () => {
    const value = emptyContent();
    await mockRepository.saveContent(value, true);
    await mockRepository.saveContent({ ...value, title: '제목 수정' }, false);
    expect((await mockRepository.contents()).filter(c => c.id === value.id)).toHaveLength(1);
    expect((await mockRepository.content(value.id)).title).toBe('제목 수정');
  });
  it('파일 Blob을 보존하고 공개 후 비공개 전환한다', async () => {
    const course = (await mockRepository.courses())[0];
    const media = await mockRepository.upload(new File(['sample-video-bytes'], 'sample.mp4', { type: 'video/mp4' }), 'video', { duration: 60 });
    expect(await (await mockRepository.mediaBlob(media))!.text()).toBe('sample-video-bytes');
    const value = { ...emptyContent(), title: '공개 콘텐츠', courseId: course.id, video: media, quiz: { question: '문제', options: ['정답', '오답'], correctIndex: 0, explanation: '해설' } };
    await mockRepository.saveContent(value, true);
    expect((await mockRepository.transition(value.id, 'publish')).status).toBe('PUBLISHED');
    expect((await mockRepository.transition(value.id, 'unpublish')).status).toBe('HIDDEN');
  });
  it('필수 항목이 부족하면 공개를 거절하고 초안은 유지한다', async () => {
    const value = await mockRepository.saveContent(emptyContent(), true);
    await expect(mockRepository.transition(value.id, 'publish')).rejects.toMatchObject({ status: 422 });
    expect((await mockRepository.content(value.id)).status).toBe('DRAFT');
  });
  it('실패한 저장은 이전 값을 유지하고 재시도는 성공한다', async () => {
    const value = await mockRepository.saveContent({ ...emptyContent(), title: '원래 제목' }, true);
    sessionStorage.setItem('demo-failure', 'save');
    await expect(mockRepository.saveContent({ ...value, title: '새 제목' }, false)).rejects.toMatchObject({ status: 503 });
    expect((await mockRepository.content(value.id)).title).toBe('원래 제목');
    await mockRepository.saveContent({ ...value, title: '새 제목' }, false);
    expect((await mockRepository.content(value.id)).title).toBe('새 제목');
  });
  it('업로드 실패 후 재시도할 수 있다', async () => {
    const file = new File(['a'], '연습.txt');
    sessionStorage.setItem('demo-failure', 'upload');
    await expect(mockRepository.upload(file, 'practice')).rejects.toMatchObject({ status: 503 });
    expect((await mockRepository.upload(file, 'practice')).name).toBe('연습.txt');
  });
  it('로그아웃·일반 회원 상태에서 조회와 저장이 차단된다', async () => {
    await mockRepository.logout();
    await expect(mockRepository.contents()).rejects.toMatchObject({ status: 401 });
    sessionStorage.setItem('demo-role', 'member');
    await expect(mockRepository.saveCourse(emptyCourse(), true)).rejects.toMatchObject({ status: 403 });
  });
});

describe('실제 API 어댑터 계약', () => {
  it('추가 관리자 기능도 기존 로그인 세션과 CSRF 토큰을 공유한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ name: '운영자', role: 'admin', csrfToken: 'shared-csrf' }));
    const api = createApiRepository('/api/ui', fetcher);
    await api.login('admin@workfit.dev', 'test-password');
    await api.readCatalog();
    await api.saveTag({ id: 'tag-uuid', name: '함수', tagType: 'FUNCTION', synonyms: [] });
    await api.saveResource({ id: 'resource-uuid', title: '자료', resourceType: 'PROMPT', description: '', file: null, promptText: '질문', categoryId: '', status: 'DRAFT' });
    expect(fetcher.mock.calls[1][0]).toBe('/api/ui/admin/catalog');
    for (const [url, init] of fetcher.mock.calls.slice(2)) {
      expect(url).toMatch(/\/api\/ui\/admin\/(tags|resources)$/);
      expect(init?.credentials).toBe('include');
      expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('shared-csrf');
    }
  });
  it('쿠키·CSRF 토큰·생성 중복방지 키를 전달한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ name: '운영자', role: 'admin', csrfToken: 'test-csrf' })).mockResolvedValueOnce(Response.json({ id: 'new-id' }));
    const api = createApiRepository('/api', fetcher);
    await api.session();
    const value = emptyContent(); await api.saveContent(value, true);
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe('/api/admin/contents');
    expect(init?.method).toBe('POST'); expect(init?.credentials).toBe('include');
    const headers = new Headers(init?.headers);
    expect(headers.get('X-CSRF-Token')).toBe('test-csrf');
    expect(headers.get('Idempotency-Key')).toBe(value.id);
    expect(JSON.parse(init?.body as string).id).toBe(value.id);
  });
  it('파일은 FormData로 보내고 Content-Type은 브라우저가 설정한다', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'media' }));
    await createApiRepository('/api', fetcher).upload(new File(['x'], '연습.txt'), 'practice');
    const init = fetcher.mock.calls[0][1];
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    expect((init?.body as FormData).get('kind')).toBe('practice');
  });
  it('401·403·필드 오류를 UI가 구별할 수 있게 전달한다', async () => {
    for (const status of [401, 403, 422]) {
      const api = createApiRepository('/api', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: '처리 실패', fields: ['영상 필요'] }, { status })));
      await expect(api.contents()).rejects.toMatchObject({ status, fields: ['영상 필요'] });
    }
  });
  it('일반 회원 세션은 관리자 세션으로 허용하지 않는다', async () => {
    const api = createApiRepository('/api', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ role: 'member' })));
    await expect(api.session()).rejects.toMatchObject({ status: 403 });
  });
  it('네트워크 장애와 잘못된 응답에서 목업 데이터로 전환하지 않는다', async () => {
    await expect(createApiRepository('/api', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))).contents()).rejects.toThrow('서버에 연결할 수 없습니다');
    await expect(createApiRepository('/api', vi.fn<typeof fetch>().mockResolvedValue(new Response('<html/>'))).contents()).rejects.toThrow('응답 형식');
  });
  it('타임아웃을 사용자 오류로 바꾸고 요청을 중단한다', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))));
    const request = createApiRepository('/api', fetcher).contents();
    const assertion = expect(request).rejects.toBeInstanceOf(ServiceError);
    await vi.advanceTimersByTimeAsync(20_001); await assertion;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true); vi.useRealTimers();
  });
});
