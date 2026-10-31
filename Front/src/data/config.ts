export const dataMode = import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'mock';
export const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/ui').replace(/\/$/, '');
