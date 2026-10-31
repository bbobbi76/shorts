async (page) => {
  const base = 'http://127.0.0.1:5180';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  let failList = true, empty = false, hideFirst = false;
  const courses = [{ id: '1', title: 'API_엑셀 기초', summary: '공개된 과정입니다.', learningGoal: '기본 함수 활용', categoryId: '1', level: 'BASIC', status: 'PUBLISHED', thumbnail: null, updatedAt: '' }, { id: '2', title: 'API_응용 과정', summary: '응용', learningGoal: '조건식', categoryId: '1', level: 'ADVANCED', status: 'PUBLISHED', thumbnail: null, updatedAt: '' }];
  const first = { id: '1', courseId: '1', title: 'API_조건 합계', learningGoal: '조건별로 더해요.', video: { id: '10', kind: 'video', name: 'sample.mp4', type: 'video/mp4', size: 100, duration: 2.38 }, thumbnail: null, practice: null, resource: null, practiceText: '직접 계산해 보세요.', subtitles: [{ id: '1', startSec: 0.5, endSec: 1.5, text: '세금 포함 매출을 합산해요.' }], resources: [{ id: '1', title: 'API_실습 자료', description: '자료입니다.', resourceType: 'TEMPLATE', file: { id: '20', kind: 'resource', name: 'API자료.txt', type: 'text/plain', size: 12 }, promptText: '' }], updatedAt: '' };
  const contents = [first, ...Array.from({ length: 13 }, (_, i) => ({ ...first, id: String(i + 2), title: `API_영상 ${i + 2}`, courseId: i === 0 ? '2' : '1', subtitles: [], resources: [] })), { ...first, id: 'orphan', courseId: 'private-course', title: '잘못된 공개 범위 영상' }];
  await page.unroute('**/api/ui/**');
  await page.route('**/api/ui/**', async route => {
    const request = route.request();
    requests.push({ method: request.method(), path: new URL(request.url()).pathname });
    assert(request.method() === 'GET', 'Learner sent a write request');
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/ui', '');
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/courses') return json(empty ? [] : courses);
    if (path === '/contents') {
      if (failList) return json({ message: '일시적 오류' }, 503);
      const rows = empty ? [] : contents.filter(item => !hideFirst || item.id !== '1');
      return json(url.searchParams.get('courseId') ? rows.filter(item => item.courseId === url.searchParams.get('courseId')) : rows);
    }
    if (path.startsWith('/courses/')) return courses.find(item => item.id === path.split('/')[2]) ? json(courses.find(item => item.id === path.split('/')[2])) : json({}, 404);
    if (path.startsWith('/contents/')) {
      const item = contents.find(item => item.id === path.split('/')[2] && item.id !== 'orphan' && (!hideFirst || item.id !== '1'));
      return item ? json(item) : json({}, 404);
    }
    if (path === '/media/10/file') return route.fulfill({ response: await route.fetch({ url: `${base}/demo-sample.mp4` }) });
    if (path === '/media/20/file') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'API sample file' });
    return json({}, 404);
  });
  await page.goto(`${base}/favicon.svg`);
  await page.evaluate(() => { if (location.port !== '5180') throw new Error('QA origin only'); localStorage.clear(); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/learn`);
  await page.getByRole('button', { name: '다시 시도', exact: true }).waitFor();
  failList = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.getByRole('heading', { name: '공개된 영상 14개' }).waitFor();
  assert(await page.locator('.learn-video-card').count() === 12, 'Page size incorrect');
  assert(await page.getByText('잘못된 공개 범위 영상').count() === 0, 'Orphan course result leaked');
  await page.getByRole('navigation', { name: '검색 결과 페이지' }).getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('heading', { name: 'API_영상 13', exact: true }).waitFor();
  assert(await page.locator('.learn-video-card').count() === 2, 'Pagination failed');
  await page.getByRole('combobox', { name: '과정', exact: true }).selectOption('2');
  await page.getByRole('heading', { name: '공개된 영상 1개', exact: true }).waitFor();
  assert(await page.locator('.learn-video-card').count() === 1, 'Course filter failed');
  await page.getByRole('combobox', { name: '난이도', exact: true }).selectOption('BASIC');
  await page.getByRole('heading', { name: '검색 결과가 없습니다', exact: true }).waitFor();
  await page.getByRole('button', { name: '검색 조건 초기화', exact: true }).first().click();
  await page.getByRole('textbox', { name: '영상 검색어', exact: true }).fill('세금');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByRole('link', { name: /0:00 자막.*세금/ }).click();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  assert(await page.locator('video').evaluate(video => Math.abs(video.currentTime - 0.5) < 0.2), 'API timestamp seek failed');
  assert((await page.locator('video').getAttribute('src')).includes('/api/ui/media/10/file'), 'Video bypassed public endpoint');
  await page.getByRole('tab', { name: '실습·업무자료' }).focus();
  await page.keyboard.press('ArrowRight');
  assert(await page.getByRole('tab', { name: '학습 메모' }).getAttribute('aria-selected') === 'true', 'Keyboard tab selection failed');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('workfit-learning-v1:')) throw new Error('quota'); return original.call(this, key, value); };
  });
  await page.getByRole('textbox', { name: '기억할 내용이나 실습한 내용을 적어보세요' }).fill('저장 실패 시에도 입력을 유지해야 합니다.');
  await page.getByRole('alert').filter({ hasText: '메모를 저장하지 못했습니다.' }).waitFor();
  assert((await page.getByRole('textbox', { name: '기억할 내용이나 실습한 내용을 적어보세요' }).inputValue()).includes('입력을 유지'), 'Failed note input lost');
  await page.reload();
  await page.getByRole('tab', { name: '학습 메모' }).click();
  await page.getByRole('textbox', { name: '기억할 내용이나 실습한 내용을 적어보세요' }).fill('정상 저장된 메모');
  await page.getByRole('status').filter({ hasText: '이 브라우저에 저장했습니다.' }).waitFor();
  await page.screenshot({ path: 'output/playwright/learner-api-lesson.png', fullPage: true });
  hideFirst = true;
  await page.goto(`${base}/learn/history`);
  await page.getByRole('heading', { name: '아직 학습 기록이 없습니다', exact: true }).waitFor();
  assert(await page.getByText('정상 저장된 메모').count() === 0, 'Unpublished history leaked');
  // Hidden records can still be removed without showing their former metadata.
  await page.getByRole('button', { name: '전체 기록 지우기', exact: true }).click();
  await page.getByRole('button', { name: '모두 지우기', exact: true }).click();
  await page.goto(`${base}/learn/contents/1`);
  await page.getByRole('alert').filter({ hasText: '공개된 자료를 찾을 수 없습니다.' }).waitFor();
  assert(await page.locator('video').count() === 0, '404 left stale video');
  empty = true;
  await page.goto(`${base}/learn`);
  await page.getByRole('heading', { name: '아직 공개된 영상이 없습니다', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/learner-api-empty.png', fullPage: true });
  await page.unroute('**/api/ui/**');
  await page.route('**/api/ui/**', route => route.abort('failed'));
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '서버에 연결할 수 없습니다.' }).waitFor();
  assert(await page.locator('.learn-video-card').count() === 0, 'Network error silently fell back to mock');
  assert(!requests.some(request => request.path.includes('/admin/') || request.path.includes('/search')), 'Called unavailable or privileged API');
  assert(errors.length === 0, `Page errors: ${errors.join('; ')}`);
  return { success: true, scenarios: ['503 retry', 'pagination', 'combined filters', 'public media', 'timestamp', 'keyboard tabs', 'storage quota', 'unpublished history', '404', 'empty', 'offline no fallback'], requestCount: requests.length, pageErrors: errors };
}
