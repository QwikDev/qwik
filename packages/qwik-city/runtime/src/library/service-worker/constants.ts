import type { AwaitingRequests } from './types';

export const qBuildCacheName = 'QwikBuild';

export const existingPrefetches = new Set<string>();

export const awaitingRequests: AwaitingRequests = new Map();
