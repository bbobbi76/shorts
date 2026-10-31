import { emptyCourse, ServiceError, type Content } from '../../domain/model';
import type { PublicContent, PublicCourse, PublicRepository } from '../../domain/public-model';
import { stateAction, copy, wait, found, type DemoState } from './store';

function publicContent(value: Content, state: DemoState): PublicContent {
  const { id, courseId, title, learningGoal, workUse, subtitles, video, thumbnail, practiceText, practice, updatedAt } = value;
  const resources = state.resources.filter(r => value.resourceIds.includes(r.id) && r.status === 'PUBLISHED').map(({ id, title, resourceType, description, file, promptText }) => ({ id, title, resourceType, description, file, promptText }));
  return copy({ id, courseId, title, learningGoal, workUse, subtitles, video, thumbnail, practiceText, practice, resource: null, resources, updatedAt });
}
function published(state: DemoState) { return state.contents.filter(value => value.status === 'PUBLISHED' && state.courses.some(course => course.id === value.courseId && course.status === 'PUBLISHED')); }
const exampleCourse: PublicCourse = { ...emptyCourse(), id: 'example-excel', title: '엑셀 기초: 자주 쓰는 합계 함수', summary: '조건에 맞는 매출을 빠르게 합산하는 방법을 짧은 영상으로 살펴봅니다.', learningGoal: 'SUMIF 함수의 조건 범위와 합계 범위를 구분합니다.', categoryId: '4', level: 'BASIC', status: 'DRAFT', thumbnail: null, updatedAt: '', isExample: true };
const exampleContent: PublicContent = { id: 'example-sumif', courseId: exampleCourse.id, title: 'SUMIF로 조건별 합계 구하기', learningGoal: '부서별 매출 표에서 원하는 부서의 합계를 구하는 예시입니다.', video: { id: 'example-video', name: 'SUMIF_예시영상.mp4', size: 13_172, type: 'video/mp4', kind: 'video', duration: 2.38, url: '/demo-sample.mp4' }, thumbnail: null, practiceText: '부서명이 “영업”인 행의 매출 합계를 구해 보세요.', practice: null, resource: null, updatedAt: '', isExample: true };
function visibleContents(state: DemoState): PublicContent[] {
  const items = published(state);
  return items.length ? items.map(c => publicContent(c, state)) : [copy(exampleContent)];
}
export const mockPublicRepository: PublicRepository = {
  async courses() { await wait(); return stateAction(s => { const items = visibleContents(s); return items[0]?.isExample ? [copy(exampleCourse)] : copy(s.courses.filter(course => items.some(content => content.courseId === course.id))); }); },
  async course(id) { return stateAction(s => { const items = visibleContents(s); if (items[0]?.isExample && id === exampleCourse.id) return copy(exampleCourse); if (!items.some(c => c.courseId === id)) throw new ServiceError('공개된 과정을 찾을 수 없습니다.', 404); return copy(found(s.courses.find(c => c.id === id))); }); },
  async contents(courseId) { await wait(); return stateAction(s => visibleContents(s).filter(c => !courseId || c.courseId === courseId).sort((a, b) => (s.contents.find(c => c.id === a.id)?.sortOrder ?? 0) - (s.contents.find(c => c.id === b.id)?.sortOrder ?? 0)).map(copy)); },
  async content(id) { return stateAction(s => copy(found(visibleContents(s).find(c => c.id === id)))); },
  async mediaBlob(media) { return stateAction(s => { if (!published(s).some(c => [c.video, c.thumbnail, c.practice, ...s.resources.filter(r => c.resourceIds.includes(r.id) && r.status === 'PUBLISHED').map(r => r.file)].some(file => file?.id === media.id))) throw new ServiceError('현재 공개되지 않은 파일입니다.', 404); return found(s.media[media.id]).blob; }); },
};
