import type { Content, Course, Media, WorkResource } from './model';

// User responses deliberately omit quiz answers and administrator state.
export type PublicResource = Pick<WorkResource, 'id' | 'title' | 'resourceType' | 'description' | 'file' | 'promptText'>;
export type PublicContent = Pick<Content, 'id' | 'courseId' | 'title' | 'learningGoal' | 'video' | 'thumbnail' | 'practiceText' | 'practice' | 'resource' | 'updatedAt'> & { isExample?: boolean; resources?: PublicResource[]; workUse?: string; subtitles?: Content['subtitles'] };
export type PublicCourse = Course & { isExample?: boolean };
export interface PublicRepository {
  courses(): Promise<PublicCourse[]>;
  course(id: string): Promise<PublicCourse>;
  contents(courseId?: string): Promise<PublicContent[]>;
  content(id: string): Promise<PublicContent>;
  mediaBlob(media: Media): Promise<Blob>;
}
