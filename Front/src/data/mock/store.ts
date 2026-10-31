import { emptyContent, emptyCourse, ServiceError, type Catalog, type Course, type Content, type Media } from '../../domain/model';
import { migrateState, initialCatalog } from '../../domain/validation';

export interface DemoState extends Catalog { schemaVersion?: number; courses: Course[]; contents: Content[]; media: Record<string, { info: Media; blob: Blob }> }
const seed = (): DemoState => {
  const now = new Date().toISOString();
  const course: Course = { ...emptyCourse(), id: 'excel-basics', title: '신입 직장인을 위한 엑셀 기초', summary: '업무에 바로 쓰는 엑셀의 기본기를 짧게 배우는 과정입니다.', learningGoal: '조건별 합계와 데이터 정리의 기본을 익힙니다.', categoryId: '4', level: 'BASIC', status: 'DRAFT', thumbnail: null, updatedAt: now };
  return { ...initialCatalog(), schemaVersion: 2, courses: [course], contents: ['SUMIF 함수로 조건별 합계 구하기', '필터로 필요한 데이터만 찾기', '피벗 테이블로 매출 요약하기'].map((title, index) => ({ ...emptyContent(), id: `sample-${index + 1}`, title, courseId: course.id, updatedAt: now })), media: {} };
};
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('douzone-admin-demo-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new ServiceError('브라우저 저장소를 열 수 없습니다. 저장소 사용 설정을 확인해 주세요.')); };
    request.onblocked = () => { database = undefined; reject(new ServiceError('다른 탭을 닫고 다시 시도해 주세요.')); };
  });
}
export async function stateAction<T>(change: (state: DemoState) => T, write = false): Promise<T> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    // Always read-write so first-use seeding and concurrent changes are atomic.
    const transaction = connection.transaction('state', 'readwrite');
    const store = transaction.objectStore('state');
    const request = store.get('data');
    let result: T;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const needsMigration = request.result && request.result.schemaVersion !== 2;
        const current: DemoState = request.result ? migrateState(request.result) : seed();
        result = change(current);
        if (write || !request.result || needsMigration) store.put(current, 'data');
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure ?? new ServiceError('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'));
  });
}
export const copy = <T,>(value: T): T => structuredClone(value);
export const wait = () => new Promise(resolve => setTimeout(resolve, 200));
export function checkDemoAuth() {
  const role = sessionStorage.getItem('demo-role') ?? 'admin';
  if (role === 'signed-out') throw new ServiceError('로그인이 필요합니다. 입력한 내용은 현재 화면에 유지됩니다.', 401);
  if (role !== 'admin') throw new ServiceError('관리자 권한이 없습니다.', 403);
}
export function demoFault(kind: 'save' | 'upload') {
  if (sessionStorage.getItem('demo-failure') === kind) {
    sessionStorage.removeItem('demo-failure');
    throw new ServiceError(`${kind === 'upload' ? '업로드' : '저장'} 실패를 재현했습니다. 입력 내용을 확인하고 다시 시도해 주세요.`, 503);
  }
}
export function found<T>(value: T | undefined): T { if (!value) throw new ServiceError('해당 항목을 찾을 수 없습니다.', 404); return value; }
