// Run the API dev server on 5177, then use playwright-cli run-code --filename=...
// Responses below are intercepted contract fixtures; this does not verify MySQL.
async (page) => {
  const base = 'http://127.0.0.1:5177';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await page.unroute('**/api/ui/**');
  await page.unroute('**/api/auth/**');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/favicon.svg`);
  const fixtures = await page.evaluate(async () => {
    const { emptyContent, emptyCourse, categories, skills } = await import('/src/domain/model.ts');
    return {
      course: { ...emptyCourse(), id: '1', title: 'API 검증 과정', learningGoal: '동작 확인' },
      content: emptyContent(),
      categories, skills,
    };
  });
  let course = fixtures.course;
  const contents = [];
  const catalog = { tags: [], resources: [] };
  let courseLoadFailures = 100, catalogFailures = 0, saveFailure = 0, logoutFailure = 0;
  let publishFailures = 1, creates = 0, patches = 0, catalogReads = 0;
  const media = { id: '5', name: 'demo-sample.mp4', type: 'video/mp4', kind: 'video', size: 13172, duration: 7 };
  await page.route('**/api/auth/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'contract-bearer', role: 'ADMIN' }) }));
  await page.route('**/api/ui/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/ui', '');
    const method = request.method();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/session' || path === '/auth/login') return respond({ name: '검증 관리자', role: 'admin', csrfToken: 'contract-csrf' });
    if (path === '/auth/logout') return logoutFailure ? respond({ message: '권한 만료' }, logoutFailure) : route.fulfill({ status: 204 });
    if (path === '/admin/categories') return respond(fixtures.categories);
    if (path === '/admin/skills') return respond(fixtures.skills);
    if (method !== 'GET') assert(request.headers()['x-csrf-token'] === 'contract-csrf', 'CSRF 누락');
    if (path === '/admin/courses' && method === 'GET') return respond([course]);
    if (path === '/admin/courses/1' && method === 'GET') {
      if (courseLoadFailures-- > 0) return respond({ message: '과정 조회 실패' }, 503);
      return respond(course);
    }
    if (path === '/admin/courses/1' && method === 'PATCH') {
      if (saveFailure) { const failure = saveFailure; saveFailure = 0; return respond({ message: '권한 만료' }, failure); }
      course = { ...request.postDataJSON(), updatedAt: new Date().toISOString() };
      return respond(course);
    }
    if (path === '/admin/catalog') {
      catalogReads++;
      if (catalogFailures-- > 0) return respond({ message: '목록 조회 실패' }, 503);
      return respond(catalog);
    }
    if (path === '/admin/tags') {
      const saved = { ...request.postDataJSON(), id: '10', synonyms: ['정규화된 동의어'] };
      catalog.tags = [saved]; return respond(saved);
    }
    if (path === '/admin/contents' && method === 'GET') return respond(contents);
    if (path === '/admin/contents' && method === 'POST') {
      creates++;
      assert(request.headers()['idempotency-key'] === request.postDataJSON().id, '중복방지 키 누락');
      const saved = { ...request.postDataJSON(), id: '20', updatedAt: new Date().toISOString() };
      contents.push(saved); return respond(saved, 201);
    }
    if (path === '/admin/contents/20' && method === 'GET') return respond(contents[0]);
    if (path === '/admin/contents/20' && method === 'PATCH') {
      patches++; contents[0] = { ...request.postDataJSON(), updatedAt: new Date().toISOString() };
      return respond(contents[0]);
    }
    if (path === '/admin/contents/20/publish') {
      if (publishFailures-- > 0) return respond({ message: '공개 요청 실패', fields: ['공개 상태를 다시 확인해 주세요.'] }, 503);
      contents[0].status = 'PUBLISHED'; return respond(contents[0]);
    }
    if (path === '/admin/media' && method === 'POST') return respond(media, 201);
    if (path === '/admin/media/5/file') return route.fulfill({ path: 'public/demo-sample.mp4', contentType: 'video/mp4' });
    return respond({ message: `미구현 검증 경로: ${method} ${path}` }, 404);
  });
  await page.goto(`${base}/admin/courses`);
  await page.getByRole('link', { name: 'API 검증 과정 과정 수정', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '과정 조회 실패' }).waitFor();
  courseLoadFailures = 0;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.getByRole('textbox', { name: '과정명', exact: true }).waitFor();
  await page.getByLabel('과정 소개', { exact: true }).fill('재로그인 후 보존할 내용');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('heading', { name: '저장하지 않은 내용을 버리고 로그아웃할까요?' }).waitFor();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  assert(await page.getByLabel('과정 소개', { exact: true }).inputValue() === '재로그인 후 보존할 내용', '로그아웃 취소 시 입력 유실');
  saveFailure = 403; logoutFailure = 403;
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('heading', { name: '관리자 권한이 필요해요' }).waitFor();
  await page.getByRole('button', { name: '다른 계정으로 로그인' }).click();
  await page.getByLabel('이메일').fill('admin@example.test');
  await page.getByLabel('비밀번호').fill('contract-test-only');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  assert(page.url().endsWith('/admin/courses/1'), '계정 전환 시 편집 경로 유실');
  assert(await page.getByLabel('과정 소개', { exact: true }).inputValue() === '재로그인 후 보존할 내용', '재로그인 시 입력 유실');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '과정이 저장되었습니다.' }).waitFor();
  catalogFailures = 100;
  await page.getByRole('link', { name: '검색 태그 관리', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '목록 조회 실패' }).waitFor();
  catalogFailures = 0;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.getByLabel('대표 태그', { exact: true }).fill('검색 검증');
  await page.getByLabel('동의어 (한 줄에 하나)').fill('입력한 동의어');
  const readsBeforeSave = catalogReads;
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '서버에 저장했습니다.' }).waitFor();
  assert(await page.getByLabel('동의어 (한 줄에 하나)').inputValue() === '정규화된 동의어', '서버 정규화 동의어 반영 실패');
  assert(catalogReads === readsBeforeSave, '저장 후 불필요한 목록 재조회');
  await page.getByRole('link', { name: '콘텐츠 관리', exact: true }).click();
  await page.locator('.page-heading').getByRole('link', { name: '콘텐츠 등록', exact: true }).click();
  await page.getByRole('combobox', { name: '소속 과정', exact: true }).selectOption('1');
  await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).fill('공개 복구 검증');
  await page.getByLabel('숏폼 영상 파일 선택', { exact: true }).setInputFiles('public/demo-sample.mp4');
  await page.getByText('demo-sample.mp4', { exact: true }).waitFor();
  assert((await page.locator('.uploaded small').first().textContent()).includes('7초'), '서버 영상 길이 덮어쓰기');
  await page.getByRole('textbox', { name: '퀴즈 문제', exact: true }).fill('문제');
  for (let i = 1; i <= 4; i++) await page.getByRole('textbox', { name: `보기 ${i}`, exact: true }).fill(`보기${i}`);
  await page.getByRole('radio', { name: '보기 1 정답', exact: true }).check();
  await page.getByRole('textbox', { name: '정답 해설', exact: true }).fill('정답 해설');
  await page.getByRole('button', { name: '공개하기', exact: true }).click();
  await page.waitForURL(`${base}/admin/contents/20`);
  await page.getByRole('alert').filter({ hasText: '콘텐츠는 저장했지만 공개하지 못했습니다.' }).waitFor();
  assert(await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).inputValue() === '공개 복구 검증', '공개 실패 후 저장 데이터 유실');
  await page.screenshot({ path: 'output/playwright/week5-publish-recovery.png', fullPage: true });
  await page.getByRole('button', { name: '공개하기', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '사용자에게 표시하려면 소속 과정도 공개해 주세요.' }).waitFor();
  assert(creates === 1 && patches === 1, '공개 재시도 시 중복 생성');
  await page.reload();
  await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).waitFor();
  assert(await page.getByRole('alert').filter({ hasText: '콘텐츠는 저장했지만 공개하지 못했습니다.' }).count() === 0, '공개 성공 후 이전 오류 재표시');
  assert(errors.length === 0, `화면 오류: ${errors.join('; ')}`);
  return { success: true, actualBackend: false, creates, patches, scenarios: ['과정 조회 재시도', '로그아웃 취소', '403 계정 전환·입력 보존', '카탈로그 조회 재시도', '저장 응답 반영', '서버 영상 길이 보존', '공개 실패 복구·중복 생성 방지', '과정 공개 안내'], pageErrors: errors };
}
