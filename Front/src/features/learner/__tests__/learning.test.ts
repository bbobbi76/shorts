import { beforeEach, expect, it, vi } from 'vitest';
import { emptyContent, emptyCourse } from '../../../domain/model';
import { cleanSubtitles, formatTime, searchLibrary, startTime, subtitleVtt } from '../library';
import { createLearningStore } from '../progress';

const course = { ...emptyCourse(), id: 'course', title: '엑셀 기초', status: 'PUBLISHED' as const };
const content = { ...emptyContent(), id: 'content', courseId: course.id, title: '조건별 합계', subtitles: [
  { id: 'a', startSec: 10, endSec: 14, text: '영업부 매출을 합산합니다.' },
] };
const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
beforeEach(() => values.clear());

it('제목에 없는 검색어도 공개 자막에서 찾아 해당 재생 시점을 연결한다', () => {
  const results = searchLibrary([content], [course], '영업부 매출');
  expect(results).toHaveLength(1);
  expect(results[0].match?.startSec).toBe(10);
  expect(searchLibrary([content], [course], '영업부 회계')).toHaveLength(0);
});

it('검색 결과는 공개 과정 목록에 있는 영상에만 한정하고 과정·난이도 필터를 함께 적용한다', () => {
  expect(searchLibrary([content, { ...content, id: 'private', courseId: 'hidden' }], [course], '')).toHaveLength(1);
  expect(searchLibrary([content], [course], '', 'another')).toHaveLength(0);
  expect(searchLibrary([content], [course], '', course.id, 'ADVANCED')).toHaveLength(0);
  expect(searchLibrary([content], [course], '엑셀', course.id, 'BASIC')).toHaveLength(1);
});

it('비정상 자막을 제외하고 영상 길이를 넘지 않도록 정리한다', () => {
  expect(cleanSubtitles([
    { id: 'c', startSec: 25, endSec: 30, text: '영상 밖' },
    { id: 'a', startSec: -1, endSec: 3, text: '잘못된 시간' },
    { id: 'b', startSec: 5, endSec: 100, text: '정상 구간' },
    { id: 'd', startSec: 2, endSec: 1, text: '역전' },
  ], 20)).toEqual([{ id: 'b', startSec: 5, endSec: 20, text: '정상 구간' }]);
});

it('자막을 VTT로 변환할 때 HTML처럼 보이는 원문을 안전하게 표시한다', () => {
  const vtt = subtitleVtt([{ id: 'a', startSec: 1.25, endSec: 3, text: '<b>SUM & IF</b>\n둘째 줄' }]);
  expect(vtt).toContain('00:00:01.250 --> 00:00:03.000');
  expect(vtt).toContain('&lt;b&gt;SUM &amp; IF&lt;/b&gt; 둘째 줄');
});

it('잘못된 재생 위치는 무시하고 유효한 위치는 영상 범위 안으로 제한한다', () => {
  for (const input of [null, '', ' ', 'NaN', 'Infinity', '-1']) expect(startTime(input, 30)).toBeNull();
  expect(startTime('4.5', 30)).toBe(4.5);
  expect(startTime('900', 30)).toBe(29.9);
  expect(formatTime(3601)).toBe('1:00:01');
  expect(formatTime(Number.NaN)).toBe('0:00');
});

it('시청 위치를 저장할 때 이미 작성한 메모를 보존하고 새 저장소에서도 복원한다', () => {
  const store = createLearningStore('qa', () => storage);
  store.update('1', 'video', { note: '배운 내용' });
  store.update('1', 'video', { position: 15, duration: 60 });
  expect(createLearningStore('qa', () => storage).get('1', 'video')).toMatchObject({ position: 15, note: '배운 내용' });
});

it('영상이 교체되면 이전 영상 위치와 완료 여부를 초기화하고 메모는 보존한다', () => {
  const store = createLearningStore('qa', () => storage);
  store.update('1', 'old', { position: 60, duration: 60, ended: true, note: '메모' });
  expect(store.get('1', 'new')).toMatchObject({ position: 0, duration: 0, ended: false, note: '메모', videoId: 'new' });
});

it('손상된 저장 데이터를 무시하고 저장 공간 오류를 호출자에게 알린다', () => {
  values.set('qa', '{broken');
  const store = createLearningStore('qa', () => storage);
  expect(store.entries()).toEqual([]);
  expect(createLearningStore('qa', () => { throw new Error('blocked'); }).update('1', 'v', { note: '내용' })).toBe(false);
  const full = createLearningStore('qa', () => ({ ...storage, setItem: () => { throw new Error('quota'); } }));
  expect(full.update('1', 'v', { note: '보관 실패' })).toBe(false);
});

it('최근 기록 개수를 제한하고 개별 삭제와 전체 삭제를 지원한다', () => {
  const store = createLearningStore('qa', () => storage);
  for (let i = 0; i < 105; i++) store.update(String(i), 'video', { position: 10, duration: 20 });
  expect(store.entries()).toHaveLength(100);
  store.remove('104');
  expect(store.entries().some(entry => entry.contentId === '104')).toBe(false);
  store.clear();
  expect(store.entries()).toEqual([]);
});

it('서로 다른 서버·모드의 학습 기록을 섞지 않는다', () => {
  const api = createLearningStore('api', () => storage);
  const mock = createLearningStore('mock', () => storage);
  api.update('1', 'video', { note: '서버 영상' });
  expect(mock.entries()).toEqual([]);
});

it('손상된 위치·중복 기록을 복원하지 않고 알림은 저장 성공 후에만 보낸다', () => {
  const notify = vi.fn();
  const store = createLearningStore('qa', () => storage, notify);
  expect(store.update('1', 'video', { position: Number.NaN })).toBe(false);
  expect(notify).not.toHaveBeenCalled();
  store.update('1', 'video', { position: 10, duration: 20 });
  const valid = store.entries()[0];
  values.set('qa', JSON.stringify([valid, valid, { ...valid, contentId: 'bad', position: 100 }]));
  expect(store.entries()).toHaveLength(1);
  expect(notify).toHaveBeenCalledTimes(1);
});
