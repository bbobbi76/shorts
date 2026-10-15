import type { Content, Course, Media } from './model';

// User responses deliberately omit quiz answers and administrator state.
export type PublicContent = Pick<Content, 'id' | 'courseId' | 'title' | 'objective' | 'video' | 'thumbnail' | 'practiceText' | 'practice' | 'resource' | 'updatedAt'> & { isExample?: boolean };
export type PublicCourse = Course & { isExample?: boolean };
export interface PublicRepository {
  courses(): Promise<PublicCourse[]>;
  course(id: string): Promise<PublicCourse>;
  contents(courseId?: string): Promise<PublicContent[]>;
  content(id: string): Promise<PublicContent>;
  mediaBlob(media: Media): Promise<Blob>;
}
