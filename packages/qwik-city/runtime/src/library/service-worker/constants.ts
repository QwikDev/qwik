export const qBuildCacheName = 'QwikBuild';

export const existingPrefetches = new Set<string>();

export const activeRequests = new Map<string, Promise<Response>>();
