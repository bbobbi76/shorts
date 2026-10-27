import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyContent, emptyCourse, type Course, type Content } from '../../domain/model';
import { contentRows, initialCatalog, migrateState, validateContent, validateCourse, type LocalState } from '../validation';
import { mockCatalogRepository as catalogRepository, mockRepository, mockPublicRepository } from '../../data/repository';

const session = new Map<string, string>();
vi.stubGlobal('sessionStorage', { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key) });
beforeEach(() => session.clear());

describe('WorkFit DB 필드와 기존 데이터 보존', () => {
  it('이전 과정·비공개·첨부파일을 손실 없이 새 필드로 옮기고 재적용해도 중복하지 않는다', () => {
    const file = { id: 'old-file', name: '기존자료.txt', size: 3, type: 'text/plain', kind: 'resource' as const };
    const blob = new Blob(['old']);
    const state = { courses: [{ id: 'old-course', title: '이전 과정', description: '기존 소개', objective: '기존 목표', job: '공통 실무', topic: '엑셀', level: '응용', updatedAt: '' } as unknown as Course], contents: [{ id: 'old-content', courseId: 'old-course', title: '이전 콘텐츠', objective: '콘텐츠 목표', status: 'PRIVATE', video: null, thumbnail: null, quiz: { question: '', options: ['A', 'B'], correctIndex: -1, explanation: '' }, practiceText: '이전 실습', practice: null, resource: file, updatedAt: '' } as unknown as Content], media: { [file.id]: { info: file, blob } } } as LocalState;
    const migrated = migrateState(state);
    expect(migrated.courses[0]).toMatchObject({ summary: '기존 소개', learningGoal: '기존 목표', categoryId: '4', level: 'ADVANCED', status: 'DRAFT' });
    expect(migrated.contents[0]).toMatchObject({ learningGoal: '콘텐츠 목표', status: 'HIDDEN', practiceText: '이전 실습' });
    expect(migrated.resources[0].file?.id).toBe(file.id);
    expect(migrated.contents[0].resourceIds).toEqual([migrated.resources[0].id]);
    expect(migrated.media[file.id].blob).toBe(blob);
    expect(migrateState(migrated).resources).toHaveLength(1);
  });
  it('정답 번호와 보기별 피드백·재시청 시점·관계 테이블이 일치한다', () => {
    const content = { ...emptyContent(), status: 'REVIEW' as const, tagIds: ['t1', 't2'], skillIds: ['2'], resourceIds: ['r1'], quiz: { question: '함수?', options: ['SUM', 'SUMIF'], correctIndex: 1, explanation: '조건 합계' }, optionFeedbacks: [{ feedback: '전체 합계입니다.', feedbackSource: 'ADMIN' as const, rewatchSec: 20 }, { feedback: '맞습니다.', feedbackSource: 'ADMIN' as const, rewatchSec: null }] };
    const rows = contentRows(content);
    expect(rows.contents.status).toBe('REVIEW');
    expect(rows.quiz_options.map(o => o.is_correct)).toEqual([false, true]);
    expect(rows.quiz_options[0]).toMatchObject({ option_no: 1, feedback_source: 'ADMIN', rewatch_sec: 20 });
    expect(rows.content_tags).toHaveLength(2); expect(rows.content_resources[0].resource_id).toBe('r1');
  });
  it('DB 길이·자막 구간·실습 숫자 범위와 관계를 검증한다', () => {
    const course = { ...emptyCourse(), title: '정상' };
    expect(() => validateCourse({ ...course, title: '가'.repeat(101) })).toThrow('100자');
    const content = emptyContent(); const catalog = { ...initialCatalog(), courses: [course] };
    expect(() => validateContent({ ...content, subtitles: [{ id: 's', startSec: 5, endSec: 4, text: '잘못된 구간' }] }, catalog)).toThrow('자막');
    expect(() => validateContent({ ...content, subtitles: [{ id: 's', startSec: 0.001, endSec: 4, text: '세 자리' }] }, catalog)).toThrow('둘째 자리');
    expect(() => validateContent({ ...content, practiceSettings: { ...content.practiceSettings, expectedResult: '숫자 아님' } }, catalog)).toThrow('숫자');
    expect(() => validateContent({ ...content, resourceIds: ['missing'] }, catalog)).toThrow('연결한');
  });
});

describe('프론트 안에서 저장·공개 처리', () => {
  it('보기 피드백·실습 정답·자막·다중 연결을 저장하고 영상 교체 시 버전만 증가시킨다', async () => {
    const course = await mockRepository.saveCourse({ ...emptyCourse(), title: '로컬 확인' }, true);
    const first = await mockRepository.upload(new File(['a'], '첫영상.mp4'), 'video', { duration: 60 });
    const value = { ...emptyContent(), courseId: course.id, title: '로컬 콘텐츠', video: first, status: 'REVIEW' as const, tagIds: ['2'], skillIds: ['2'], workUse: '매출 합계', subtitles: [{ id: 'sub', startSec: 0, endSec: 10, text: '시작' }] };
    value.optionFeedbacks[0] = { feedback: '복습', feedbackSource: 'ADMIN', rewatchSec: 15 };
    value.practiceSettings = { title: '합계 실습', expectedResult: '100', resultType: 'NUMBER', tolerance: 0.1, requiredFunction: 'SUMIF', answerFormula: '=SUMIF(A:A,"영업",B:B)' };
    await mockRepository.saveContent(value, true);
    expect(await mockRepository.content(value.id)).toMatchObject({ workUse: '매출 합계', status: 'REVIEW', version: 1, tagIds: ['2'], practiceSettings: { expectedResult: '100' }, subtitles: [{ text: '시작' }] });
    expect((await mockRepository.content(value.id)).optionFeedbacks[0].rewatchSec).toBe(15);
    const second = await mockRepository.upload(new File(['b'], '교체.mp4'), 'video', { duration: 70 });
    const saved = await mockRepository.saveContent({ ...value, video: second }, false);
    expect(saved.version).toBe(2);
    expect((await mockRepository.saveContent(saved, false)).version).toBe(2);
  });
  it('다른 태그에 있는 동의어 중복을 막는다', async () => {
    await catalogRepository.saveTag({ id: 'custom-tag', name: '검증 태그', tagType: 'TOOL', synonyms: ['검증 동의어'] });
    await expect(catalogRepository.saveTag({ id: 'other-tag', name: '다른 태그', tagType: 'TOOL', synonyms: ['검증 동의어'] })).rejects.toThrow('중복');
  });
  it('과정 공개 조건과 공개된 자료만 사용자에게 보여주는 조건을 함께 적용한다', async () => {
    const course = await mockRepository.saveCourse({ ...emptyCourse(), title: '과정 공개 확인', learningGoal: '공개 검사' }, true);
    await expect(mockRepository.saveCourse({ ...course, status: 'PUBLISHED' }, false)).rejects.toThrow('공개된 콘텐츠');
    const publicPrompt = await catalogRepository.saveResource({ id: 'prompt-public', title: '업무 프롬프트', resourceType: 'PROMPT', description: '', promptText: '표를 요약하세요.', file: null, categoryId: '4', status: 'PUBLISHED' });
    const hiddenFile = await mockRepository.upload(new File(['private'], '숨김.txt'), 'resource');
    const hidden = await catalogRepository.saveResource({ id: 'resource-hidden', title: '숨긴 자료', resourceType: 'TEMPLATE', description: '', file: hiddenFile, promptText: '', categoryId: '4', status: 'HIDDEN' });
    const video = await mockRepository.upload(new File(['video'], '공개.mp4'), 'video', { duration: 60 });
    const c = await mockRepository.saveContent({ ...emptyContent(), courseId: course.id, title: '공개 영상', video, resourceIds: [publicPrompt.id, hidden.id], quiz: { question: '문제', options: ['A', 'B'], correctIndex: 0, explanation: '해설' } }, true);
    await mockRepository.transition(c.id, 'publish');
    await expect(mockPublicRepository.content(c.id)).rejects.toMatchObject({ status: 404 });
    await mockRepository.saveCourse({ ...course, status: 'PUBLISHED' }, false);
    const publicContent = await mockPublicRepository.content(c.id);
    expect(publicContent.resources?.map(r => r.id)).toEqual([publicPrompt.id]);
    expect(publicContent).not.toHaveProperty('practiceSettings');
    await expect(mockPublicRepository.mediaBlob(hiddenFile)).rejects.toMatchObject({ status: 404 });
    await mockRepository.saveCourse({ ...course, status: 'HIDDEN' }, false);
    await expect(mockPublicRepository.content(c.id)).rejects.toMatchObject({ status: 404 });
  });
});
