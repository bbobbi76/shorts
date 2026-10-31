import { type Media, type MediaKind, ServiceError, validateFile } from '../../../domain/model';

export async function inspectMedia(file: File, kind: MediaKind): Promise<Partial<Media>> {
  validateFile(file, kind);
  if (kind !== 'video' && kind !== 'thumbnail') return {};
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ServiceError('파일 정보를 확인하지 못했습니다. 다른 파일로 다시 시도해 주세요.')), 15_000);
      if (kind === 'video') {
        const video = document.createElement('video'); video.preload = 'metadata';
        video.onloadedmetadata = () => { clearTimeout(timer); if (!Number.isFinite(video.duration) || video.duration <= 0) reject(new ServiceError('영상 길이를 확인할 수 없습니다. 재생 가능한 MP4를 선택해 주세요.')); else resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }); video.removeAttribute('src'); video.load(); };
        video.onerror = () => { clearTimeout(timer); reject(new ServiceError('재생할 수 없는 영상입니다. MP4 파일을 확인해 주세요.')); }; video.src = url;
      } else {
        const image = new Image(); image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight }); }; image.onerror = () => { clearTimeout(timer); reject(new ServiceError('이미지를 열 수 없습니다. JPG 또는 PNG를 확인해 주세요.')); }; image.src = url;
      }
    });
  } finally { URL.revokeObjectURL(url); }
}
