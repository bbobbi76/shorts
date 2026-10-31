import { createApiRepository } from './api/admin';
import { createPublicApiRepository } from './api/public';
import { mockRepository, mockCatalogRepository } from './mock/admin';
import { mockPublicRepository } from './mock/public';
import { dataMode, apiBase } from './config';
import type { SearchTag, WorkResource } from '../domain/model';
export { dataMode, apiBase } from './config';
export { createApiRepository, createPublicApiRepository, mockRepository, mockCatalogRepository, mockPublicRepository };
const apiRepository = createApiRepository(apiBase);
export const repository = dataMode === 'api' ? apiRepository : mockRepository;
export const catalogRepository = dataMode === 'api' ? {
  read: () => apiRepository.readCatalog(),
  saveTag: (value: SearchTag) => apiRepository.saveTag(value),
  saveResource: (value: WorkResource) => apiRepository.saveResource(value),
} : mockCatalogRepository;
export const publicRepository = dataMode === 'api' ? createPublicApiRepository(apiBase) : mockPublicRepository;
