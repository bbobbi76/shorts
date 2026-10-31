import { useSyncExternalStore } from 'react';
import { apiBase, dataMode } from '../../data/config';

export interface LearningEntry {
  contentId: string;
  videoId: string;
  position: number;
  duration: number;
  ended: boolean;
  note: string;
  updatedAt: number;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const changeEvent = 'workfit-learning-change';
const MAX_ENTRIES = 100;

export function createLearningStore(key: string, storage: () => StorageLike, notify: () => void = () => {}) {
  function snapshot() { try { return storage().getItem(key) || '[]'; } catch { return '[]'; } }
  function entries(raw = snapshot()): LearningEntry[] {
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      const seen = new Set<string>();
      return value.filter((entry): entry is LearningEntry => {
        if (!entry || typeof entry !== 'object' || typeof entry.contentId !== 'string' || !entry.contentId
          || typeof entry.videoId !== 'string' || typeof entry.note !== 'string' || entry.note.length > 5000
          || !Number.isFinite(entry.position) || entry.position < 0 || !Number.isFinite(entry.duration) || entry.duration < 0
          || (entry.duration > 0 && entry.position > entry.duration) || typeof entry.ended !== 'boolean'
          || !Number.isFinite(entry.updatedAt) || entry.updatedAt < 0 || seen.has(entry.contentId)) return false;
        seen.add(entry.contentId);
        return true;
      }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
    } catch { return []; }
  }
  function write(value: LearningEntry[]) {
    try { storage().setItem(key, JSON.stringify(value)); notify(); return true; } catch { return false; }
  }
  function get(contentId: string, videoId: string) {
    const saved = entries().find(entry => entry.contentId === contentId);
    return saved?.videoId === videoId ? saved : saved ? { ...saved, videoId, position: 0, duration: 0, ended: false } : undefined;
  }
  return {
    key, snapshot, entries, get,
    update(contentId: string, videoId: string, patch: Partial<Pick<LearningEntry, 'position' | 'duration' | 'ended' | 'note'>>) {
      const entry: LearningEntry = { contentId, videoId, position: 0, duration: 0, ended: false, note: '', ...get(contentId, videoId), ...patch, updatedAt: Date.now() };
      if (!Number.isFinite(entry.duration) || entry.duration < 0 || !Number.isFinite(entry.position) || entry.position < 0) return false;
      entry.position = entry.duration ? Math.min(entry.position, entry.duration) : entry.position;
      entry.note = entry.note.slice(0, 5000);
      return write([entry, ...entries().filter(item => item.contentId !== contentId)].slice(0, MAX_ENTRIES));
    },
    remove: (id: string) => write(entries().filter(item => item.contentId !== id)),
    clear: () => write([]),
  };
}

export const learningStore = createLearningStore(`workfit-learning-v1:${dataMode}:${apiBase}`, () => localStorage,
  () => window.dispatchEvent(new Event(changeEvent)));
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === learningStore.key) notify(); };
  window.addEventListener(changeEvent, notify);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(changeEvent, notify); window.removeEventListener('storage', onStorage); };
}
export function useLearningEntries() {
  return learningStore.entries(useSyncExternalStore(subscribe, learningStore.snapshot, () => '[]'));
}
