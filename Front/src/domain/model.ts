export type Status = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'HIDDEN';
export type CourseStatus = Exclude<Status, 'REVIEW'>;
export type Level = 'INTRO' | 'BASIC' | 'ADVANCED';
export interface Category { id: string; name: string; categoryType: 'JOB' | 'COMMON' }
export interface Skill { id: string; categoryId: string; name: string; description: string }
export interface SearchTag { id: string; name: string; tagType: 'SITUATION' | 'ERROR' | 'FUNCTION' | 'TOOL'; synonyms: string[] }
export interface WorkResource { id: string; title: string; resourceType: 'TEMPLATE' | 'EXAMPLE_DOC' | 'PROMPT'; description: string; file: Media | null; promptText: string; categoryId: string; status: CourseStatus }
export interface OptionFeedback { feedback: string; feedbackSource: 'NONE' | 'AI_DRAFT' | 'ADMIN'; rewatchSec: number | null }
export interface PracticeSettings { title: string; expectedResult: string; resultType: 'NUMBER' | 'TEXT'; tolerance: number; requiredFunction: string; answerFormula: string }
export interface Subtitle { id: string; startSec: number; endSec: number; text: string }
export interface Catalog { tags: SearchTag[]; resources: WorkResource[] }
export const levelLabels: Record<Level, string> = { INTRO: '입문', BASIC: '기초', ADVANCED: '응용' };
export const categories: Category[] = [
  { id: '1', name: '기획', categoryType: 'JOB' }, { id: '2', name: '마케팅', categoryType: 'JOB' }, { id: '3', name: '인사', categoryType: 'JOB' },
  { id: '4', name: '엑셀', categoryType: 'COMMON' }, { id: '5', name: '문서 작성', categoryType: 'COMMON' }, { id: '6', name: 'AI 업무 활용', categoryType: 'COMMON' },
];
export const skills: Skill[] = [
  { id: '1', categoryId: '4', name: '기본 조작', description: '서식, 정렬, 필터, 단축키' },
  { id: '2', categoryId: '4', name: '함수 활용', description: 'SUM, IF, SUMIF, VLOOKUP 등' },
  { id: '3', categoryId: '4', name: '데이터 집계', description: '조건별 합계, 피벗 테이블' },
];
export const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? '분야 미지정';
export const emptyFeedback = (): OptionFeedback => ({ feedback: '', feedbackSource: 'NONE', rewatchSec: null });
export const emptyPractice = (): PracticeSettings => ({ title: '', expectedResult: '', resultType: 'NUMBER', tolerance: 0, requiredFunction: '', answerFormula: '' });
export type MediaKind = 'video' | 'thumbnail' | 'practice' | 'resource';
export interface Course {
  id: string; title: string; summary: string; learningGoal: string;
  categoryId: string; level: Level; status: CourseStatus; thumbnail: Media | null; updatedAt: string;
  legacyClassification?: { job: string; topic: string };
}
export interface Media {
  id: string; name: string; size: number; type: string; kind: MediaKind;
  url?: string; duration?: number; width?: number; height?: number;
}
export interface Content {
  id: string; courseId: string; title: string; learningGoal: string; status: Status;
  workUse: string; sortOrder: number; version: number;
  video: Media | null; thumbnail: Media | null;
  quiz: { question: string; options: string[]; correctIndex: number; explanation: string };
  practiceText: string; practice: Media | null; resource: Media | null;
  optionFeedbacks: OptionFeedback[]; practiceSettings: PracticeSettings;
  tagIds: string[]; skillIds: string[]; resourceIds: string[]; subtitles: Subtitle[];
  updatedAt: string;
  publishedAt?: string | null;
}
export interface ContentOrderItem { id: string; title: string; status: Status; sortOrder: number; durationSec: number | null }
export interface Dashboard {
  userCount: number; courseCount: number; publishedCourseCount: number; contentCount: number;
  draftContentCount: number; publishedContentCount: number; hiddenContentCount: number; resourceCount: number; tagCount: number;
  recentContents: { id: number | string; title: string; status: Status; updatedAt: string | null }[];
  recentLogs: { id: number; action: string; targetType: string; targetId: number; createdAt: string | null }[];
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
  categories(): Promise<Category[]>;
  skills(): Promise<Skill[]>;
  dashboard(): Promise<Dashboard>;
  removeContent(id: string): Promise<void>;
  courseContents(id: string): Promise<ContentOrderItem[]>;
  reorderContents(courseId: string, ids: string[]): Promise<ContentOrderItem[]>;
}
export class ServiceError extends Error {
  constructor(message: string, public status = 0, public fields: string[] = []) { super(message); }
}
export const statusLabels: Record<Status, string> = { DRAFT: '임시저장', REVIEW: '검수', PUBLISHED: '공개', HIDDEN: '비공개' };
export const emptyCourse = (): Course => ({ id: crypto.randomUUID(), title: '', summary: '', learningGoal: '', categoryId: '4', level: 'BASIC', status: 'DRAFT', thumbnail: null, updatedAt: '' });
export const emptyContent = (): Content => ({ id: crypto.randomUUID(), courseId: '', title: '', learningGoal: '', workUse: '', sortOrder: 1, version: 1, status: 'DRAFT', video: null, thumbnail: null, quiz: { question: '', options: ['', '', '', ''], correctIndex: -1, explanation: '' }, optionFeedbacks: Array.from({ length: 4 }, emptyFeedback), practiceText: '', practice: null, resource: null, practiceSettings: emptyPractice(), tagIds: [], skillIds: [], resourceIds: [], subtitles: [], updatedAt: '' });
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
  if ([...file.name].length > 255) throw new ServiceError('파일명은 255자 이내로 지정해 주세요.');
  if (!policy.extensions.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) throw new ServiceError('지원하지 않는 파일 형식입니다. 안내된 형식을 선택해 주세요.');
  if (!file.size) throw new ServiceError('빈 파일은 업로드할 수 없습니다.');
  if (file.size > policy.limit * 1024 * 1024) throw new ServiceError(`파일은 ${policy.limit}MB 이하로 선택해 주세요.`);
}
