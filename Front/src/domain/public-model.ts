import type { Content, Course, Media, WorkResource } from './model';

// User responses deliberately omit quiz answers and administrator state.
export type PublicResource = Pick<WorkResource, 'id' | 'title' | 'resourceType' | 'description' | 'file' | 'promptText'>;
export type PublicContent = Pick<Content, 'id' | 'courseId' | 'title' | 'learningGoal' | 'video' | 'thumbnail' | 'practiceText' | 'practice' | 'resource' | 'updatedAt'> & { practiceId?: number | null; practiceTitle?: string; isExample?: boolean; resources?: PublicResource[]; workUse?: string; subtitles?: Content['subtitles'] };
export type PublicCourse = Course & { isExample?: boolean };
export type PracticeFeedback = {
  status: 'correct' | 'partially_correct' | 'incorrect' | 'needs_review';
  score: number | null;
  good_points: string[];
  improvement_points: string[];
  corrected_answer: string;
  explanation: string;
  next_practice: string;
};
export interface PublicRepository {
  courses(): Promise<PublicCourse[]>;
  course(id: string): Promise<PublicCourse>;
  contents(courseId?: string): Promise<PublicContent[]>;
  content(id: string): Promise<PublicContent>;
  mediaBlob(media: Media): Promise<Blob>;
  mediaUrl?(media: Media): string | undefined;
}
