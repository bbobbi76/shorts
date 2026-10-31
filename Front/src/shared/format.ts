import { ServiceError } from '../domain/model';
export const toError = (error: unknown) => error instanceof ServiceError ? error : new ServiceError(error instanceof Error ? error.message : '작업을 처리하지 못했습니다. 다시 시도해 주세요.');
export const when = (date: string) => date ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(date)) : '저장 전';
export const fileSize = (size: number) => size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
