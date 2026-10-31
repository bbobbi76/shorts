import { useEffect, useState } from 'react';
import { publicRepository } from '../../data/repository';
import type { PublicContent, PublicCourse } from '../../domain/public-model';
import type { Subtitle } from '../../domain/model';

export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setValue(null);
    setError('');
    load().then(result => { if (active) setValue(result); }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : '자료를 불러오지 못했습니다.');
    });
    return () => { active = false; };
    // Callers identify each request with a stable key, rather than an inline callback.
  }, [key, attempt]);
  return { value, error, retry: () => setAttempt(value => value + 1) };
}

export async function loadLibrary() {
  const [courses, contents] = await Promise.all([publicRepository.courses(), publicRepository.contents()]);
  const visible = new Set(courses.map(course => course.id));
  return { courses, contents: contents.filter(content => visible.has(content.courseId)) };
}

const normal = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();
export function searchLibrary(contents: PublicContent[], courses: PublicCourse[], query: string, courseId = '', level = '') {
  const words = normal(query).split(/\s+/).filter(Boolean);
  const courseMap = new Map(courses.map(course => [course.id, course]));
  return contents.flatMap(content => {
    const course = courseMap.get(content.courseId);
    if (!course || (courseId && course.id !== courseId) || (level && course.level !== level)) return [];
    const title = normal(content.title);
    const subtitles = cleanSubtitles(content.subtitles, content.video?.duration);
    const fields = [title, content.learningGoal, content.workUse ?? '', course.title, ...subtitles.map(line => line.text)].map(normal);
    if (!words.every(word => fields.some(field => field.includes(word)))) return [];
    const match = words.length ? subtitles.map(line => ({ line, score: words.filter(word => normal(line.text).includes(word)).length }))
      .filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0]?.line : undefined;
    return [{ content, course, match, score: words.filter(word => title.includes(word)).length }];
  }).sort((a, b) => b.score - a.score);
}

export function formatTime(seconds: number | undefined) {
  const value = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds!) : 0);
  const h = Math.floor(value / 3600);
  const m = Math.floor(value / 60) % 60;
  const s = String(value % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function cleanSubtitles(lines: Subtitle[] = [], duration?: number) {
  return lines.filter(line => Number.isFinite(line.startSec) && Number.isFinite(line.endSec)
    && line.startSec >= 0 && line.endSec > line.startSec && line.text.trim()
    && (!duration || line.startSec < duration))
    .map(line => ({ ...line, endSec: duration ? Math.min(line.endSec, duration) : line.endSec }))
    .sort((a, b) => a.startSec - b.startSec);
}

export function subtitleVtt(lines: Subtitle[]) {
  const timestamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  return 'WEBVTT\n\n' + cleanSubtitles(lines).map((line, i) => `${i + 1}\n${timestamp(line.startSec)} --> ${timestamp(line.endSec)}\n${line.text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!).replace(/\r?\n+/g, ' ')}\n`).join('\n');
}

export function startTime(value: string | null, duration?: number) {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return duration && Number.isFinite(duration) ? Math.min(seconds, Math.max(0, duration - 0.1)) : seconds;
}
