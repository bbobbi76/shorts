// Browser contract test using intercepted HTTP responses. This is NOT a backend.
async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const courses = [{ id: 'contract-course', title: 'API 계약 검증 과정', description: '', objective: '', job: '공통 실무', topic: '엑셀', level: '기초', updatedAt: new Date().toISOString() }];
  const contents = []; let failure = 0; let creates = 0; let patches = 0; let csrfChecks = 0;
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/auth/session' || path === '/api/auth/login') return respond({ name: '계약 검증 관리자', role: 'admin', csrfToken: 'browser-contract-token' });
    if (path === '/api/auth/logout') return route.fulfill({ status: 204 });
    if (path === '/api/admin/courses') return respond(courses);
    if (path === '/api/admin/contents' && request.method() === 'GET') return respond(contents);
    if (path.startsWith('/api/admin/contents/') && request.method() === 'GET') return respond(contents.find(item => item.id === path.split('/').pop()));
    if (path.startsWith('/api/admin/contents') && ['POST', 'PATCH'].includes(request.method())) {
      assert(request.headers()['x-csrf-token'] === 'browser-contract-token', 'API CSRF 헤더 누락'); csrfChecks++;
      if (failure) { const status = failure; failure = 0; return respond({ message: `HTTP ${status} 계약 오류 확인`, fields: [] }, status); }
      const value = request.postDataJSON();
      assert(request.headers()['idempotency-key'] === value.id, '중복 방지 키 누락');
      if (request.method() === 'POST') { creates++; await new Promise(resolve => setTimeout(resolve, 600)); }
      else patches++;
      const result = { ...value, updatedAt: new Date().toISOString() };
      const existing = contents.findIndex(item => item.id === value.id); if (existing >= 0) contents[existing] = result; else contents.push(result);
      return respond(result);
    }
    return respond({ message: '계약에 없는 요청' }, 404);
  });
  await page.goto('http://127.0.0.1:5174/admin/contents');
  await page.getByText('서버 연결 모드 · 저장과 권한 확인은 연결된 백엔드에서 처리합니다.').waitFor();
  await page.locator('.page-heading').getByRole('link', { name: '콘텐츠 등록', exact: true }).click();
  await page.getByLabel('소속 과정').selectOption('contract-course');
  await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).fill('실제 API 어댑터 계약 검증');
  await page.getByRole('button', { name: '임시저장', exact: true }).click();
  assert(await page.getByRole('button', { name: '임시저장', exact: true }).isDisabled(), '요청 중 저장 버튼 잠금 실패');
  await page.waitForURL(url => /\/admin\/contents\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'));
  assert(creates === 1, '중복 생성 요청 발생');
  await page.reload();
  await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).waitFor();
  assert(await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).inputValue() === '실제 API 어댑터 계약 검증', '서버 조회 복원 실패');
  failure = 503; await page.getByLabel('학습 목표', { exact: true }).fill('API 장애 후 유지할 입력');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'HTTP 503 계약 오류 확인' }).waitFor();
  assert(await page.getByLabel('학습 목표', { exact: true }).inputValue() === 'API 장애 후 유지할 입력', '503 입력 보존 실패');
  failure = 401; await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('heading', { name: '관리자 로그인', exact: true }).waitFor();
  await page.getByLabel('이메일').fill('admin@example.test'); await page.getByLabel('비밀번호').fill('contract-test-only');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  assert(await page.getByLabel('학습 목표', { exact: true }).inputValue() === 'API 장애 후 유지할 입력', '401 로그인 후 입력 보존 실패');
  failure = 403; await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('heading', { name: '관리자 권한이 필요해요' }).waitFor();
  await page.getByRole('button', { name: '다른 계정으로 로그인' }).click();
  await page.getByLabel('이메일').fill('admin@example.test'); await page.getByLabel('비밀번호').fill('contract-test-only');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '콘텐츠가 저장되었습니다.' }).waitFor();
  await page.screenshot({ path: 'output/playwright/13-api-contract-mode.png', fullPage: true });
  assert(contents.length === 1 && patches === 1 && csrfChecks >= 5, 'API 계약 요청 수 확인 실패');
  await page.unroute('**/api/**');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  // No actual server runs on :8000: the UI must keep API mode and show a connection error.
  await page.getByRole('heading', { name: '서버에 연결하지 못했어요', exact: true }).waitFor();
  console.log(JSON.stringify({ result: 'passed', creates, patches, csrfChecks, actualBackend: false, scenarios: ['API 모드 HTTP 계약', '요청 중 잠금', '생성 중복 방지', 'API 조회 복원', 'HTTP 503·401·403 및 입력 유지', '서버 미연결 오류·목업 자동 전환 없음'] }));
}
