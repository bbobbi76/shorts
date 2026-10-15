export type Status = 'DRAFT' | 'PUBLISHED' | 'PRIVATE';
export type MediaKind = 'video' | 'thumbnail' | 'practice' | 'resource';
export interface Course {
  id: string; title: string; description: string; objective: string;
  job: string; topic: string; level: '기초' | '응용'; updatedAt: string;
}
export interface Media {
  id: string; name: string; size: number; type: string; kind: MediaKind;
  url?: string; duration?: number; width?: number; height?: number;
}
export interface Content {
  id: string; courseId: string; title: string; objective: string; status: Status;
  video: Media | null; thumbnail: Media | null;
  quiz: { question: string; options: string[]; correctIndex: number; explanation: string };
  practiceText: string; practice: Media | null; resource: Media | null;
  updatedAt: string;
}
export interface Session { name: string; role: 'admin' | 'member' }
export interface Repository {
  session(): Promise<Session>;
  login(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  courses(): Promise<Course[]>;
  course(id: string): Promise<Course>;
  saveCourse(value: Course, isNew: boolean): Promise<Course>;
  contents(): Promise<Content[]>;
  content(id: string): Promise<Content>;
  saveContent(value: Content, isNew: boolean): Promise<Content>;
  transition(id: string, action: 'publish' | 'unpublish'): Promise<Content>;
  upload(file: File, kind: MediaKind, metadata?: Partial<Media>): Promise<Media>;
  mediaBlob(media: Media): Promise<Blob | null>;
}
export class ServiceError extends Error {
  constructor(message: string, public status = 0, public fields: string[] = []) { super(message); }
}
export const statusLabels: Record<Status, string> = { DRAFT: '임시저장', PUBLISHED: '공개', PRIVATE: '비공개' };
export const emptyCourse = (): Course => ({ id: crypto.randomUUID(), title: '', description: '', objective: '', job: '공통 실무', topic: '엑셀', level: '기초', updatedAt: '' });
export const emptyContent = (): Content => ({ id: crypto.randomUUID(), courseId: '', title: '', objective: '', status: 'DRAFT', video: null, thumbnail: null, quiz: { question: '', options: ['', '', '', ''], correctIndex: -1, explanation: '' }, practiceText: '', practice: null, resource: null, updatedAt: '' });
export type PublicationField = 'courseId' | 'title' | 'video' | 'question' | 'options' | 'correctIndex' | 'explanation';
export function publicationProblems(c: Content, courses: Course[]): Partial<Record<PublicationField, string>> {
  const errors: Partial<Record<PublicationField, string>> = {};
  if (!courses.some(course => course.id === c.courseId)) errors.courseId = '소속 과정을 선택해 주세요.';
  if (!c.title.trim()) errors.title = '콘텐츠 제목을 입력해 주세요.';
  if (!c.video || !(c.video.duration && c.video.duration > 0)) errors.video = '재생 가능한 영상을 업로드해 주세요.';
  if (!c.quiz.question.trim()) errors.question = '퀴즈 문제를 입력해 주세요.';
  if (c.quiz.options.length < 2 || c.quiz.options.length > 4 || c.quiz.options.some(o => !o.trim())) errors.options = '퀴즈 보기를 모두 입력해 주세요. (2~4개)';
  if (c.quiz.correctIndex < 0 || !Number.isInteger(c.quiz.correctIndex) || !c.quiz.options[c.quiz.correctIndex]?.trim()) errors.correctIndex = '퀴즈 정답을 선택해 주세요.';
  if (!c.quiz.explanation.trim()) errors.explanation = '퀴즈 해설을 입력해 주세요.';
  return errors;
}
export function publishIssues(c: Content, courses: Course[]): string[] { return Object.values(publicationProblems(c, courses)); }
export const filePolicies: Record<MediaKind, { accept: string; limit: number; extensions: string[] }> = {
  video: { accept: 'video/mp4,.mp4', limit: 100, extensions: ['mp4'] },
  thumbnail: { accept: 'image/jpeg,image/png,.jpg,.jpeg,.png', limit: 5, extensions: ['jpg', 'jpeg', 'png'] },
  practice: { accept: '.xlsx,.xls,.csv,.pdf,.docx,.txt', limit: 20, extensions: ['xlsx', 'xls', 'csv', 'pdf', 'docx', 'txt'] },
  resource: { accept: '.xlsx,.xls,.csv,.pdf,.docx,.txt', limit: 20, extensions: ['xlsx', 'xls', 'csv', 'pdf', 'docx', 'txt'] },
};
export function validateFile(file: File, kind: MediaKind) {
  const policy = filePolicies[kind];
  if (!policy.extensions.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) throw new ServiceError('지원하지 않는 파일 형식입니다. 안내된 형식을 선택해 주세요.');
  if (!file.size) throw new ServiceError('빈 파일은 업로드할 수 없습니다.');
  if (file.size > policy.limit * 1024 * 1024) throw new ServiceError(`파일은 ${policy.limit}MB 이하로 선택해 주세요.`);
}
