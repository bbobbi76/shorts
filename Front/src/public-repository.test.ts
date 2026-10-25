import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { createPublicApiRepository, mockPublicRepository, mockRepository } from './repository';
import { emptyContent, emptyCourse } from './model';

const storage = new Map<string,string>();
vi.stubGlobal('sessionStorage', { getItem: (key:string) => storage.get(key) ?? null, setItem: (key:string,value:string) => storage.set(key,value), removeItem: (key:string) => storage.delete(key) });
beforeEach(() => storage.clear());
it('사용자에게 공개 콘텐츠만 표시하고 비공개 시 직접 조회와 파일 접근을 차단한다', async () => {
  const course = await mockRepository.saveCourse({ ...emptyCourse(), title:'공개 범위 검사 과정' }, true);
  const video = await mockRepository.upload(new File(['video'], 'sample.mp4'), 'video', { duration:60 });
  const content = await mockRepository.saveContent({ ...emptyContent(), title:'공개 검사 영상', courseId:course.id, video, quiz:{ question:'문제', options:['정답','오답'],correctIndex:0,explanation:'해설' } }, true);
  await expect(mockPublicRepository.content(content.id)).rejects.toMatchObject({ status:404 });
  await expect(mockPublicRepository.mediaBlob(video)).rejects.toMatchObject({ status:404 });
  await mockRepository.transition(content.id,'publish');
  await mockRepository.saveCourse({ ...course, learningGoal: '공개 범위 확인', status: 'PUBLISHED' }, false);
  sessionStorage.setItem('demo-role','member');
  const publicContent = await mockPublicRepository.content(content.id);
  expect(publicContent).not.toHaveProperty('quiz');
  expect(publicContent).not.toHaveProperty('status');
  expect((await mockPublicRepository.courses()).some(c=>c.id===course.id)).toBe(true);
  expect((await mockPublicRepository.contents(course.id))).toHaveLength(1);
  expect(await (await mockPublicRepository.mediaBlob(video)).text()).toBe('video');
  await expect(mockRepository.saveContent(content,false)).rejects.toMatchObject({status:403});
  await mockRepository.login('',''); await mockRepository.transition(content.id,'unpublish');
  expect((await mockPublicRepository.contents(course.id))).toHaveLength(0);
  await expect(mockPublicRepository.course(course.id)).rejects.toMatchObject({status:404});
  await expect(mockPublicRepository.content(content.id)).rejects.toMatchObject({status:404});
  await expect(mockPublicRepository.mediaBlob(video)).rejects.toMatchObject({status:404});
});
it('사용자 API는 관리자 경로를 사용하지 않고 오류를 목업으로 대체하지 않는다', async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(new Response('',{status:404}));
  const api=createPublicApiRepository('/api',fetcher);
  await expect(api.courses()).resolves.toEqual([]);
  expect(fetcher.mock.calls[0][0]).toBe('/api/courses');
  await expect(api.content('private')).rejects.toMatchObject({status:404});
  expect(fetcher.mock.calls[1][0]).toBe('/api/contents/private');
});
