import { categories, skills, emptyContent, emptyCourse, emptyFeedback, emptyPractice, ServiceError, type Catalog, type Content, type Course, type Media } from './model';

export interface LocalState extends Catalog {
  schemaVersion?: number;
  courses: Course[]; contents: Content[];
  media: Record<string, { info: Media; blob: Blob }>;
}

export function initialCatalog(): Catalog {
  return { resources: [], tags: [
    { id: '1', name: '조건별 합계', tagType: 'SITUATION', synonyms: ['부서별 합계', '조건에 맞는 값만 더하기', '항목별 합계'] },
    { id: '2', name: 'SUMIF', tagType: 'FUNCTION', synonyms: [] },
    { id: '3', name: '#VALUE!', tagType: 'ERROR', synonyms: [] },
  ] };
}

// Upgrade the existing IndexedDB in place, preserving file blobs and old classifications.
export function migrateState(state: LocalState): LocalState {
  if (state.schemaVersion === 2) return state;
  const catalog = initialCatalog();
  state.tags ??= catalog.tags;
  state.resources ??= [];
  state.courses = state.courses.map(value => {
    const old = value as Course & { description?: string; objective?: string; job?: string; topic?: string; level: string; status?: string };
    const category = categories.find(c => c.name === old.topic || c.name === old.job);
    const level = ({ '입문': 'INTRO', '기초': 'BASIC', '응용': 'ADVANCED' } as Record<string, Course['level']>)[old.level] ?? old.level;
    return { ...emptyCourse(), ...value, categoryId: value.categoryId ?? category?.id ?? '4',
      summary: value.summary ?? old.description ?? '', learningGoal: value.learningGoal ?? old.objective ?? '',
      level, status: (old.status as string) === 'PRIVATE' ? 'HIDDEN' : value.status ?? 'DRAFT',
      ...(old.job || old.topic ? { legacyClassification: { job: old.job ?? '', topic: old.topic ?? '' } } : {}),
    } as Course;
  });
  state.contents = state.contents.map(value => {
    const old = value as Content & { objective?: string; status: string };
    const migrated: Content = { ...emptyContent(), ...value, learningGoal: value.learningGoal ?? old.objective ?? '',
      status: (old.status as string) === 'PRIVATE' ? 'HIDDEN' : value.status,
      optionFeedbacks: value.quiz.options.map((_, i) => value.optionFeedbacks?.[i] ?? emptyFeedback()),
      practiceSettings: { ...emptyPractice(), ...value.practiceSettings },
    };
    if (value.resource && !migrated.resourceIds.length) {
      const id = `legacy-resource-${value.resource.id}`;
      if (!state.resources.some(r => r.id === id)) state.resources.push({ id, title: value.resource.name.slice(0, 100), resourceType: 'TEMPLATE', description: '', file: value.resource, promptText: '', categoryId: '', status: value.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT' });
      migrated.resourceIds = [id];
    }
    return migrated;
  });
  state.schemaVersion = 2;
  return state;
}

function limit(value: string, length: number, label: string) {
  if ([...value].length > length) throw new ServiceError(`${label}: ${length}자 이내로 입력해 주세요.`, 422);
}
export function validateCourse(c: Course) {
  if (!c.title.trim()) throw new ServiceError('과정명을 입력해 주세요.', 422);
  limit(c.title, 100, '과정명'); limit(c.summary, 500, '과정 소개'); limit(c.learningGoal, 500, '학습 목표');
  if (!categories.some(v => v.id === c.categoryId)) throw new ServiceError('교육 분야를 선택해 주세요.', 422);
  if (!['INTRO', 'BASIC', 'ADVANCED'].includes(c.level) || !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(c.status)) throw new ServiceError('과정의 난이도·상태를 확인해 주세요.', 422);
}
export function validateContent(c: Content, catalog: Catalog & { courses: Course[] }) {
  limit(c.title, 100, '콘텐츠 제목'); limit(c.learningGoal, 500, '학습 목표'); limit(c.workUse, 255, '활용 업무'); limit(c.quiz.question, 500, '퀴즈 문제');
  c.quiz.options.forEach(o => limit(o, 255, '퀴즈 보기'));
  if (!['DRAFT', 'REVIEW', 'PUBLISHED', 'HIDDEN'].includes(c.status)) throw new ServiceError('콘텐츠 상태를 확인해 주세요.', 422);
  if (!Number.isInteger(c.sortOrder) || c.sortOrder < 0) throw new ServiceError('과정 내 순서는 0 이상의 정수로 입력해 주세요.', 422);
  for (const option of c.optionFeedbacks) {
    if (option.rewatchSec !== null && (!Number.isInteger(option.rewatchSec) || option.rewatchSec < 0 || (c.video?.duration && option.rewatchSec > c.video.duration))) throw new ServiceError('다시 볼 시점은 영상 길이 이내의 0 이상 정수(초)로 입력해 주세요.', 422);
  }
  const p = c.practiceSettings;
  limit(p.title, 100, '실습 제목'); limit(p.expectedResult, 255, '정답 결과'); limit(p.requiredFunction, 50, '핵심 함수'); limit(p.answerFormula, 1000, '정답 수식');
  if (!Number.isFinite(p.tolerance) || p.tolerance < 0 || p.tolerance >= 100000000 || Math.abs(p.tolerance * 10000 - Math.round(p.tolerance * 10000)) > 0.0001) throw new ServiceError('허용 오차는 0 이상, 소수점 4자리 이내로 입력해 주세요.', 422);
  if (p.expectedResult.trim() && p.resultType === 'NUMBER' && !Number.isFinite(Number(p.expectedResult))) throw new ServiceError('숫자 정답 결과에는 숫자를 입력해 주세요.', 422);
  for (const row of c.subtitles) {
    if (!Number.isFinite(row.startSec) || !Number.isFinite(row.endSec) || row.startSec < 0 || row.endSec <= row.startSec || row.endSec >= 100000 || !row.text.trim() || (c.video?.duration && row.endSec > c.video.duration)) throw new ServiceError('자막의 문장과 시작·종료 시점을 확인해 주세요. 종료는 시작 이후, 영상 길이 이내여야 합니다.', 422);
    limit(row.text, 500, '자막');
    if ([row.startSec, row.endSec].some(v => Math.abs(v * 100 - Math.round(v * 100)) > 0.00001)) throw new ServiceError('자막 시점은 소수점 둘째 자리까지 입력해 주세요.', 422);
  }
  if (c.tagIds.some(id => !catalog.tags.some(t => t.id === id)) || c.resourceIds.some(id => !catalog.resources.some(r => r.id === id)) || c.skillIds.some(id => !skills.some(s => s.id === id))) throw new ServiceError('연결한 태그·스킬·자료를 다시 확인해 주세요.', 422);
}

// Pure field mapping for the future backend handoff. This never sends or writes data.
// Local UUIDs are references for the mock only; MySQL generates its own numeric IDs.
export function contentRows(c: Content) {
  return {
    contents: { content_id: c.id, course_id: c.courseId, title: c.title, learning_goal: c.learningGoal, work_use: c.workUse, video_file_id: c.video?.id ?? null, thumbnail_file_id: c.thumbnail?.id ?? null,
      duration_sec: c.video?.duration ? Math.round(c.video.duration) : null, aspect_ratio: c.video?.width && c.video.height ? `${c.video.width / gcd(c.video.width, c.video.height)}:${c.video.height / gcd(c.video.width, c.video.height)}` : null,
      sort_order: c.sortOrder, version: c.version, status: c.status },
    quizzes: { content_id: c.id, question: c.quiz.question, explanation: c.quiz.explanation, sort_order: 1 },
    quiz_options: c.quiz.options.map((text, i) => ({ option_no: i + 1, option_text: text, is_correct: i === c.quiz.correctIndex, feedback: c.optionFeedbacks[i]?.feedback ?? '', feedback_source: c.optionFeedbacks[i]?.feedbackSource ?? 'NONE', rewatch_sec: c.optionFeedbacks[i]?.rewatchSec ?? null })),
    practices: c.practiceText || c.practice || c.practiceSettings.title ? { content_id: c.id, title: c.practiceSettings.title, instruction: c.practiceText, example_file_id: c.practice?.id ?? null, expected_result: c.practiceSettings.expectedResult, result_type: c.practiceSettings.resultType, tolerance: c.practiceSettings.tolerance, required_function: c.practiceSettings.requiredFunction, answer_formula: c.practiceSettings.answerFormula } : null,
    content_tags: c.tagIds.map(tag_id => ({ content_id: c.id, tag_id })), content_skills: c.skillIds.map(skill_id => ({ content_id: c.id, skill_id })),
    content_resources: c.resourceIds.map(resource_id => ({ content_id: c.id, resource_id })),
    subtitles: c.subtitles.map(s => ({ subtitle_id: s.id, content_id: c.id, start_sec: s.startSec, end_sec: s.endSec, caption_text: s.text })),
  };
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
