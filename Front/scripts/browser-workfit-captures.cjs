async (page) => {
  const base = 'http://127.0.0.1:5176';
  const settled = async () => { await page.getByRole('dialog', { name: '접속 확인 중', exact: true }).waitFor({ state: 'hidden' }); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/admin/contents`); await settled();
  await page.getByRole('link', { name: '검증_SUMIF 조건별 매출 합계 수정', exact: true }).click();
  await page.getByRole('textbox', { name: '콘텐츠 제목', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/workfit-content-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/workfit-content-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/admin/courses/excel-basics`); await settled();
  await page.getByRole('textbox', { name: '과정명', exact: true }).waitFor();
  await page.screenshot({ path: 'output/playwright/workfit-course-desktop.png', fullPage: true });
  await page.goto(`${base}/admin/resources`); await settled();
  await page.getByRole('button', { name: /검증_매출 요약 프롬프트/ }).click();
  await page.screenshot({ path: 'output/playwright/workfit-resources-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/workfit-resources-mobile.png', fullPage: true });
  return { cleanCaptures: 5, loadingDialogVisible: await page.getByRole('dialog').count() };
}
