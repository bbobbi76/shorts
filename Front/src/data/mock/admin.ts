import { categories, skills, publishIssues, validateFile, ServiceError, type Repository, type Catalog, type SearchTag, type WorkResource, type Media } from '../../domain/model';
import { validateContent, validateCourse } from '../../domain/validation';
import { wait, stateAction, checkDemoAuth, demoFault, copy, found } from './store';

export const mockRepository: Repository = {
  async categories() { checkDemoAuth(); return copy(categories); },
  async skills() { checkDemoAuth(); return copy(skills); },
  async dashboard() {
    checkDemoAuth(); return stateAction(s => ({ userCount: 1, courseCount: s.courses.length, publishedCourseCount: s.courses.filter(c => c.status === 'PUBLISHED').length,
      contentCount: s.contents.length, draftContentCount: s.contents.filter(c => c.status === 'DRAFT').length, publishedContentCount: s.contents.filter(c => c.status === 'PUBLISHED').length,
      hiddenContentCount: s.contents.filter(c => c.status === 'HIDDEN').length, resourceCount: s.resources.length, tagCount: s.tags.length,
      recentContents: copy([...s.contents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map(c => ({ id: c.id, title: c.title, status: c.status, updatedAt: c.updatedAt }))), recentLogs: [] }));
  },
  async removeContent(id) {
    checkDemoAuth(); demoFault('save'); return stateAction(s => {
      const value = found(s.contents.find(c => c.id === id));
      if (value.publishedAt || !['DRAFT', 'REVIEW'].includes(value.status)) throw new ServiceError('공개 이력이 있는 콘텐츠는 삭제할 수 없습니다. 비공개로 변경해 주세요.', 400);
      s.contents = s.contents.filter(c => c.id !== id);
    }, true);
  },
  async courseContents(id) {
    checkDemoAuth(); return stateAction(s => { found(s.courses.find(c => c.id === id)); return copy(s.contents.filter(c => c.courseId === id).sort((a, b) => a.sortOrder - b.sortOrder).map(c => ({ id: c.id, title: c.title, status: c.status, sortOrder: c.sortOrder, durationSec: c.video?.duration ?? null }))); });
  },
  async reorderContents(id, ids) {
    checkDemoAuth(); demoFault('save'); await stateAction(s => {
      found(s.courses.find(c => c.id === id)); const items = s.contents.filter(c => c.courseId === id);
      if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some(value => !items.some(c => c.id === value))) throw new ServiceError('과정에 속한 콘텐츠 전체의 순서를 보내 주세요.', 400);
      ids.forEach((value, index) => { const content = found(items.find(c => c.id === value)); content.sortOrder = index + 1; });
    }, true); return mockRepository.courseContents(id);
  },
  async session() { await wait(); checkDemoAuth(); return { name: '관리자', role: 'admin' }; },
  async login(_email, _password) { sessionStorage.setItem('demo-role', 'admin'); return { name: '관리자', role: 'admin' }; },
  async logout() { sessionStorage.setItem('demo-role', 'signed-out'); },
  async courses() { await wait(); checkDemoAuth(); return stateAction(s => copy(s.courses)); },
  async course(id) { checkDemoAuth(); return stateAction(s => copy(found(s.courses.find(c => c.id === id)))); },
  async saveCourse(value) {
    await wait(); checkDemoAuth(); demoFault('save');
    validateCourse(value);
    return stateAction(s => {
      if (value.status === 'PUBLISHED' && (!value.learningGoal.trim() || !s.contents.some(c => c.courseId === value.id && c.status === 'PUBLISHED'))) throw new ServiceError('과정 공개에는 학습 목표와 공개된 콘텐츠 1개 이상이 필요합니다.', 422);
      const saved = { ...copy(value), title: value.title.trim(), updatedAt: new Date().toISOString() }; s.courses = [...s.courses.filter(c => c.id !== saved.id), saved]; return saved; }, true);
  },
  async contents() { await wait(); checkDemoAuth(); return stateAction(s => copy(s.contents)); },
  async content(id) { checkDemoAuth(); return stateAction(s => copy(found(s.contents.find(c => c.id === id)))); },
  async saveContent(value) {
    await wait(); checkDemoAuth(); demoFault('save');
    return stateAction(s => {
      validateContent(value, s);
      const previous = s.contents.find(c => c.id === value.id);
      if (value.status === 'PUBLISHED') { const errors = publishIssues(value, s.courses); if (errors.length) throw new ServiceError('공개 중인 콘텐츠의 필수 항목을 확인해 주세요.', 422, errors); }
      for (const asset of [value.video, value.thumbnail, value.practice, value.resource]) if (asset && !s.media[asset.id]) throw new ServiceError('파일이 저장소에 없습니다. 다시 업로드해 주세요.', 422);
      const saved = { ...copy(value), version: previous && previous.video?.id !== value.video?.id ? previous.version + 1 : value.version, title: value.title.trim(), updatedAt: new Date().toISOString() };
      s.contents = [...s.contents.filter(c => c.id !== saved.id), saved]; return saved;
    }, true);
  },
  async transition(id, action) {
    await wait(); checkDemoAuth(); demoFault('save');
    return stateAction(s => {
      const value = found(s.contents.find(c => c.id === id));
      if (action === 'publish') { const errors = publishIssues(value, s.courses); if (errors.length) throw new ServiceError('공개에 필요한 항목을 확인해 주세요.', 422, errors); }
      value.status = action === 'publish' ? 'PUBLISHED' : 'HIDDEN'; value.updatedAt = new Date().toISOString(); if (action === 'publish') value.publishedAt ||= value.updatedAt; return copy(value);
    }, true);
  },
  async upload(file, kind, metadata) {
    await wait(); checkDemoAuth(); demoFault('upload'); validateFile(file, kind);
    const info: Media = { ...metadata, id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, kind };
    return stateAction(s => { s.media[info.id] = { info, blob: file }; return info; }, true);
  },
  async mediaBlob(media) { checkDemoAuth(); return stateAction(s => found(s.media[media.id]).blob); },
};

export const mockCatalogRepository = {
  async read(): Promise<Catalog> { checkDemoAuth(); return stateAction(s => copy({ tags: s.tags, resources: s.resources })); },
  async saveTag(value: SearchTag) {
    checkDemoAuth(); demoFault('save');
    const saved = { ...copy(value), name: value.name.trim(), synonyms: value.synonyms.map(v => v.trim()).filter(Boolean) };
    if (!saved.name || saved.name.length > 50 || saved.synonyms.some(v => v.length > 50)) throw new ServiceError('태그와 동의어는 1~50자로 입력해 주세요.', 422);
    if (!['SITUATION', 'ERROR', 'FUNCTION', 'TOOL'].includes(saved.tagType)) throw new ServiceError('태그 유형을 확인해 주세요.', 422);
    return stateAction(s => {
      if (s.tags.some(t => t.id !== saved.id && t.name.toLocaleLowerCase() === saved.name.toLocaleLowerCase())) throw new ServiceError('이미 등록된 태그 이름입니다.', 422);
      const allSynonyms = [...s.tags.filter(t => t.id !== saved.id).flatMap(t => t.synonyms), ...saved.synonyms].map(v => v.toLocaleLowerCase());
      if (new Set(allSynonyms).size !== allSynonyms.length) throw new ServiceError('동의어가 중복됩니다. 다른 태그의 동의어도 확인해 주세요.', 422);
      s.tags = [...s.tags.filter(t => t.id !== saved.id), saved]; return copy(saved);
    }, true);
  },
  async saveResource(value: WorkResource) {
    checkDemoAuth(); demoFault('save');
    if (!value.title.trim() || value.title.length > 100 || value.description.length > 500) throw new ServiceError('자료 제목은 1~100자, 설명은 500자 이내로 입력해 주세요.', 422);
    if (!['TEMPLATE', 'EXAMPLE_DOC', 'PROMPT'].includes(value.resourceType) || !['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(value.status)) throw new ServiceError('자료 유형·상태를 확인해 주세요.', 422);
    if (value.categoryId && !categories.some(c => c.id === value.categoryId)) throw new ServiceError('자료 분야를 확인해 주세요.', 422);
    if (value.resourceType === 'PROMPT' ? !value.promptText.trim() : !value.file) throw new ServiceError(value.resourceType === 'PROMPT' ? '프롬프트 본문을 입력해 주세요.' : '자료 파일을 선택해 주세요.', 422);
    return stateAction(s => {
      if (value.file && !s.media[value.file.id]) throw new ServiceError('자료 파일을 다시 선택해 주세요.', 422);
      const saved = { ...copy(value), title: value.title.trim(), file: value.resourceType === 'PROMPT' ? null : value.file, promptText: value.resourceType === 'PROMPT' ? value.promptText : '' };
      s.resources = [...s.resources.filter(r => r.id !== saved.id), saved]; return copy(saved);
    }, true);
  },
};
